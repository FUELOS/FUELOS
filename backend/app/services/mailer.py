"""SMTP email delivery for account recovery."""

import smtplib
import ssl
from email.message import EmailMessage

from app.config import get_settings


def send_password_reset_email(recipient: str, reset_url: str) -> None:
    """Send a password reset link using the configured SMTP server."""
    settings = get_settings()
    if not settings.SMTP_HOST or not settings.SMTP_FROM_EMAIL:
        raise RuntimeError("SMTP_HOST and SMTP_FROM_EMAIL must be configured")
    if bool(settings.SMTP_USERNAME) != bool(settings.SMTP_PASSWORD):
        raise RuntimeError("SMTP_USERNAME and SMTP_PASSWORD must be configured together")
    if settings.SMTP_USE_SSL and settings.SMTP_USE_TLS:
        raise RuntimeError("Configure either SMTP_USE_SSL or SMTP_USE_TLS, not both")

    message = EmailMessage()
    message["Subject"] = "FuelOS - Şifre sıfırlama"
    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = recipient
    message.set_content(
        "FuelOS hesabınız için şifre sıfırlama isteği aldık.\n\n"
        f"Yeni şifre belirlemek için bağlantıyı 30 dakika içinde açın:\n{reset_url}\n\n"
        "Bu isteği siz yapmadıysanız bu e-postayı dikkate almayın."
    )

    context = ssl.create_default_context()
    if settings.SMTP_USE_SSL:
        with smtplib.SMTP_SSL(
            settings.SMTP_HOST,
            settings.SMTP_PORT,
            timeout=15,
            context=context,
        ) as server:
            if settings.SMTP_USERNAME:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.send_message(message)
        return

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
        server.ehlo()
        if settings.SMTP_USE_TLS:
            server.starttls(context=context)
            server.ehlo()
        if settings.SMTP_USERNAME:
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.send_message(message)
