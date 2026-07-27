import bcrypt

def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not hashed_password or not plain_password:
        return False
    try:
        # Truncate to 72 bytes max as required by modern bcrypt v4+
        password_bytes = plain_password.encode('utf-8')[:72]
        hashed_bytes = hashed_password.encode('utf-8') if isinstance(hashed_password, str) else hashed_password
        return bcrypt.checkpw(password_bytes, hashed_bytes)
    except Exception:
        return False

def hash_password(password: str) -> str:
    # Truncate to 72 bytes max and generate secure bcrypt salt
    password_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode('utf-8')

# Aliases for convenience and backward compatibility
get_password_hash = hash_password
get_pin_hash = hash_password
verify_pin = verify_password
