"""
email_utils.py
===============
Envio de e-mails transacionais (redefinição de senha) via SMTP, usando
só a biblioteca padrão do Python (smtplib) - sem dependência nova.
"""

import os
import smtplib
from email.mime.text import MIMEText
from email.utils import formatdate, make_msgid, parseaddr

SMTP_TIMEOUT_SECONDS = 15


def _smtp_env(name, default=""):
    """
    Lê uma variável SMTP_* tirando espaços, quebras de linha e aspas em
    volta do valor - descuidos comuns ao colar no painel da Vercel (ex.:
    copiar `"smtp.gmail.com"` do .env com as aspas junto).
    """
    value = (os.environ.get(name) or "").strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1].strip()
    return value or default


def send_password_reset_email(to_email, reset_url):
    """
    Manda o e-mail de redefinição de senha. Levanta uma exceção se a
    configuração de SMTP estiver incompleta ou se o envio falhar -
    quem chama decide o que fazer (ver forgot_password() em
    routes/auth_api.py, que cai para um fallback de console).
    """
    smtp_host = _smtp_env("SMTP_HOST")
    smtp_port = int(_smtp_env("SMTP_PORT", "587"))
    smtp_user = _smtp_env("SMTP_USER")
    smtp_password = _smtp_env("SMTP_PASSWORD")
    smtp_from = _smtp_env("SMTP_FROM") or smtp_user

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
    # Date e Message-ID: e-mail sem eles pontua mais como spam. O domínio
    # do Message-ID vem do remetente (evita make_msgid() consultar o DNS
    # da máquina da Vercel).
    from_domain = parseaddr(smtp_from)[1].rpartition("@")[2] or None
    message["Date"] = formatdate(localtime=False, usegmt=True)
    message["Message-ID"] = make_msgid(domain=from_domain)

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
