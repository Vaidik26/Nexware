"""
Authentication service — password hashing and verification using bcrypt.

Passwords are truncated to 72 bytes before hashing. This is a bcrypt requirement:
characters beyond 72 bytes are silently ignored by the bcrypt algorithm.
"""
import logging

import bcrypt

logger = logging.getLogger(__name__)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain-text password against a stored bcrypt hash.
    Returns False (rather than raising) on invalid inputs or bcrypt errors.
    """
    if not hashed_password or not plain_password:
        return False
    try:
        # Truncate to 72 bytes — bcrypt silently ignores characters beyond this limit
        password_bytes = plain_password.encode("utf-8")[:72]
        hashed_bytes = (
            hashed_password.encode("utf-8")
            if isinstance(hashed_password, str)
            else hashed_password
        )
        return bcrypt.checkpw(password_bytes, hashed_bytes)
    except Exception as exc:
        # Log at WARNING so authentication failures are visible without leaking credentials
        logger.warning("bcrypt.checkpw raised an unexpected error: %s", exc)
        return False


def hash_password(password: str) -> str:
    """Hash a plain-text password using bcrypt with a randomly generated salt."""
    password_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode("utf-8")


# Aliases for convenience and backward compatibility
get_password_hash = hash_password
get_pin_hash = hash_password
verify_pin = verify_password
