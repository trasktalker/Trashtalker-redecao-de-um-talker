import os
import smtplib
import unittest
from email import message_from_string
from unittest.mock import patch

from backend.email_utils import send_password_reset_email


class PasswordResetEmailTests(unittest.TestCase):
    def test_gmail_retries_with_implicit_tls_if_starttls_connection_closes(self):
        env = {
            "SMTP_HOST": "smtp.gmail.com",
            "SMTP_PORT": "587",
            "SMTP_USER": "sender@example.invalid",
            "SMTP_PASSWORD": "test-password",
        }
        with patch.dict(os.environ, env, clear=True), patch(
            "backend.email_utils.ssl.create_default_context"
        ), patch("backend.email_utils.smtplib.SMTP") as smtp, patch(
            "backend.email_utils.smtplib.SMTP_SSL"
        ) as smtp_ssl:
            first = smtp.return_value.__enter__.return_value
            first.starttls.side_effect = smtplib.SMTPServerDisconnected("closed")
            with self.assertLogs("backend.email_utils", level="WARNING") as logs:
                send_password_reset_email("pilot@example.invalid", "https://example.invalid/reset")

            self.assertIn("etapa=starttls", logs.output[0])
            self.assertIn("porta=587", logs.output[0])
            first.login.assert_not_called()
            self.assertEqual(smtp_ssl.call_args.args, ("smtp.gmail.com", 465))
            second = smtp_ssl.return_value.__enter__.return_value
            second.ehlo_or_helo_if_needed.assert_called_once()
            second.login.assert_called_once_with(
                env["SMTP_USER"], env["SMTP_PASSWORD"], initial_response_ok=False
            )
            second.sendmail.assert_called_once()

    def test_authentication_failure_is_diagnosed_without_retry_or_secret(self):
        env = {
            "SMTP_HOST": "smtp.gmail.com",
            "SMTP_PORT": "587",
            "SMTP_USER": "sender@example.invalid",
            "SMTP_PASSWORD": "test-password",
        }
        with patch.dict(os.environ, env, clear=True), patch(
            "backend.email_utils.ssl.create_default_context"
        ), patch("backend.email_utils.smtplib.SMTP") as smtp, patch(
            "backend.email_utils.smtplib.SMTP_SSL"
        ) as smtp_ssl:
            server = smtp.return_value.__enter__.return_value
            server.login.side_effect = smtplib.SMTPAuthenticationError(535, b"test-password")
            with self.assertRaisesRegex(RuntimeError, r"etapa=login.*porta=587.*535") as error:
                send_password_reset_email("pilot@example.invalid", "https://example.invalid/reset")

            self.assertNotIn("test-password", str(error.exception))
            smtp_ssl.assert_not_called()
            server.sendmail.assert_not_called()

    def test_smtp_uses_the_port_tls_mode_and_delivers_the_link(self):
        env = {
            "SMTP_HOST": "smtp.example.invalid",
            "SMTP_USER": "sender@example.invalid",
            "SMTP_PASSWORD": "test-password",
        }
        recipient = "pilot@example.invalid"
        link = "https://example.invalid/reset-password?token=synthetic"

        for port in (465, 587):
            with self.subTest(port=port), patch.dict(
                os.environ, dict(env, SMTP_PORT=str(port)), clear=True
            ), patch("backend.email_utils.smtplib.SMTP") as smtp, patch(
                "backend.email_utils.smtplib.SMTP_SSL"
            ) as smtp_ssl, patch("backend.email_utils.ssl.create_default_context") as tls:
                send_password_reset_email(recipient, link)

                transport = smtp_ssl if port == 465 else smtp
                unused = smtp if port == 465 else smtp_ssl
                self.assertEqual(transport.call_args.args, (env["SMTP_HOST"], port))
                self.assertGreater(transport.call_args.kwargs["timeout"], 0)
                unused.assert_not_called()
                server = transport.return_value.__enter__.return_value
                if port == 465:
                    server.starttls.assert_not_called()
                    context = transport.call_args.kwargs["context"]
                else:
                    server.starttls.assert_called_once()
                    context = server.starttls.call_args.kwargs["context"]
                self.assertIs(context, tls.return_value)
                server.login.assert_called_once_with(env["SMTP_USER"], env["SMTP_PASSWORD"])
                sender, recipients, raw = server.sendmail.call_args.args
                self.assertEqual(sender, env["SMTP_USER"])
                self.assertEqual(recipients, [recipient])
                message = message_from_string(raw)
                self.assertIn(link, message.get_payload(decode=True).decode("utf-8"))
