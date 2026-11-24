"""
email_utils.py
===============
Envio de e-mails transacionais (redefinição de senha) via SMTP, usando
só a biblioteca padrão do Python (smtplib) - sem dependência nova.
"""

import logging
import os
import smtplib
import ssl
from email.mime.text import MIMEText


logger = logging.getLogger(__name__)


class PasswordResetSMTPError(RuntimeError):
    def __init__(self, stage, port, error):
        code = getattr(error, "smtp_code", "indisponível")
        super().__init__(f"etapa={stage}, porta={port}, erro={type(error).__name__}, código SMTP={code}")


def send_password_reset_email(to_email, reset_url):
    """
    Manda o e-mail de redefinição de senha. Levanta uma exceção se a
    configuração de SMTP estiver incompleta ou se o envio falhar -
    a rota de recuperação registra a falha sem expor o link.
    """
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER")
    smtp_password = os.environ.get("SMTP_PASSWORD")
    smtp_from = os.environ.get("SMTP_FROM") or smtp_user

    if not smtp_host or not smtp_user or not smtp_password:
        raise RuntimeError(
            "Configuração de SMTP incompleta "
            "(defina SMTP_HOST, SMTP_USER e SMTP_PASSWORD no .env)"
        )

    body = (
        "Oi!\n\n"
        "Recebemos um pedido para redefinir a senha da sua conta no "
        "Trash Talker.\n\n"
        "Clique no link abaixo para escolher uma nova senha (válido "
        "por 1 hora):\n\n"
        f"{reset_url}\n\n"
        "Se você não pediu essa redefinição, pode ignorar este "
        "e-mail - sua senha continua a mesma.\n"
        "\n--\n"
        # Rodapé de identificação. Sem link de "descadastrar" de propósito:
        # este é um e-mail transacional (só sai quando alguém pede a
        # redefinição) - não existe lista de envio da qual sair.
        "Você recebeu este e-mail porque foi pedida a redefinição de senha "
        "da conta ligada a este endereço no Trash Talker, um projeto "
        "acadêmico. Não enviamos e-mails de marketing.\n"
        "Dúvidas: trashtalkpodcast123456@gmail.com\n"
    )

    message = MIMEText(body, "plain", "utf-8")
    message["Subject"] = "Redefinir sua senha - Trash Talker"
    message["From"] = smtp_from
    message["To"] = to_email

    tls_context = ssl.create_default_context()
    gmail = smtp_host.lower() == "smtp.gmail.com"
    ports = (smtp_port,)
    if gmail and smtp_port == 587:
        ports = (587, 465)

    for port in ports:
        stage = "connect"
        try:
            if port == 465:
                connection = smtplib.SMTP_SSL(smtp_host, port, timeout=10, context=tls_context)
            else:
                connection = smtplib.SMTP(smtp_host, port, timeout=10)

            with connection as server:
                if port != 465:
                    stage = "starttls"
                    server.starttls(context=tls_context)
                stage = "ehlo"
                server.ehlo_or_helo_if_needed()
                stage = "login"
                if gmail:
                    server.login(smtp_user, smtp_password, initial_response_ok=False)
                else:
                    server.login(smtp_user, smtp_password)
                stage = "sendmail"
                server.sendmail(smtp_from, [to_email], message.as_string())
                stage = "quit"
            return
        except OSError as error:
            failure = PasswordResetSMTPError(stage, port, error)
            # O Gmail oferece as duas portas. Só repita antes de autenticar ou enviar.
            if (
                port != ports[-1]
                and stage in ("connect", "starttls", "ehlo")
                and isinstance(error, (smtplib.SMTPServerDisconnected, ConnectionError, TimeoutError))
            ):
                logger.warning("SMTP de recuperação: %s. Tentando TLS implícito na porta 465.", failure)
                continue
            raise failure from None
