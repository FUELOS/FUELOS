"""Password reset token security checks."""

from datetime import datetime, timedelta, timezone
import unittest

from jose import jwt

from app.auth.security import (
    create_password_reset_token,
    hash_password,
    settings,
    verify_password_reset_token,
)


class PasswordResetTokenTests(unittest.TestCase):
    def test_token_is_bound_to_current_password(self):
        password_hash = hash_password("correct horse battery staple")
        token = create_password_reset_token("user-123", password_hash)

        self.assertEqual(verify_password_reset_token(token, password_hash), "user-123")
        self.assertIsNone(
            verify_password_reset_token(token, hash_password("different password"))
        )

    def test_token_rejects_access_token_purpose(self):
        token = jwt.encode(
            {
                "sub": "user-123",
                "purpose": "access",
                "password_version": "irrelevant",
                "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
            },
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM,
        )

        self.assertIsNone(
            verify_password_reset_token(token, hash_password("correct horse battery staple"))
        )

    def test_token_rejects_expired_token(self):
        token = jwt.encode(
            {
                "sub": "user-123",
                "purpose": "password_reset",
                "password_version": "irrelevant",
                "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
            },
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM,
        )

        self.assertIsNone(
            verify_password_reset_token(token, hash_password("correct horse battery staple"))
        )
