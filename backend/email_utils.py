"""
email_utils.py
===============
Envio de e-mails transacionais (redefinição de senha) via SMTP, usando
só a biblioteca padrão do Python (smtplib) - sem dependência nova.
"""

import os
import smtplib
from email.mime.text import MIMEText

SMTP_TIMEOUT_SECONDS = 15


def send_password_reset_email(to_email, reset_url):
    """
    Manda o e-mail de redefinição de senha. Levanta uma exceção se a
    configuração de SMTP estiver incompleta ou se o envio falhar -
    quem chama decide o que fazer (ver forgot_password() em
    routes/auth_api.py, que cai para um fallback de console).
    """
    # .strip() em tudo: um espaço ou quebra de linha colado sem querer no
    # painel da Vercel basta para o login no SMTP falhar.
    smtp_host = (os.environ.get("SMTP_HOST") or "").strip()
    smtp_port = int((os.environ.get("SMTP_PORT") or "587").strip())
    smtp_user = (os.environ.get("SMTP_USER") or "").strip()
    smtp_password = (os.environ.get("SMTP_PASSWORD") or "").strip()
    smtp_from = (os.environ.get("SMTP_FROM") or "").strip() or smtp_user

    # O Google mostra a senha de app como "abcd efgh ijkl mnop"; ela nunca
    # tem espaços de verdade, então tiramos os que vieram junto na cópia.
    if smtp_host.lower() == "smtp.gmail.com":
        smtp_password = smtp_password.replace(" ", "")

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

    # timeout: sem ele, um servidor que não responde segura a função da
    # Vercel até estourar o maxDuration (60s) sem erro nenhum no log.
    # Porta 465 = TLS direto (SMTP_SSL); as outras (587) = STARTTLS.
    if smtp_port == 465:
        server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=SMTP_TIMEOUT_SECONDS)
    else:
        server = smtplib.SMTP(smtp_host, smtp_port, timeout=SMTP_TIMEOUT_SECONDS)

    with server:
        if smtp_port != 465:
            server.starttls()
        server.login(smtp_user, smtp_password)
        server.sendmail(smtp_from, [to_email], message.as_string())
