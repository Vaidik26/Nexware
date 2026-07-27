"""
Tests for simplified auth service functions (password hashing).
"""
from backend.services.auth_service import hash_password, verify_password


def test_hash_and_verify_password():
    raw = "Admin@Nexware2024"
    hashed = hash_password(raw)
    assert hashed != raw
    assert verify_password(raw, hashed)
    assert not verify_password("wrong_password", hashed)


def test_empty_password_verify():
    assert not verify_password("test", "")
    assert not verify_password("test", None)
