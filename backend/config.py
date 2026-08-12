"""
Application settings loaded from environment variables via pydantic-settings.

All configuration is read exclusively from the .env file or the host environment.
No secrets or URLs are ever hardcoded in source code.
"""
import os
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))


class Settings(BaseSettings):
    PROJECT_NAME: str = "Nexware Backend"
    VERSION: str = "1.0.0"

    # -------------------------------------------------------------------------
    # Database
    # -------------------------------------------------------------------------
    DATABASE_URL: str = ""

    # -------------------------------------------------------------------------
    # JWT Authentication
    # -------------------------------------------------------------------------
    JWT_SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440   # 24 hours
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # -------------------------------------------------------------------------
    # CORS — comma-separated list of allowed origins (no wildcards in production)
    # -------------------------------------------------------------------------
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000,http://localhost:8081"

    # -------------------------------------------------------------------------
    # Push Notifications (Expo)
    # -------------------------------------------------------------------------
    EXPO_PUSH_URL: str = "https://exp.host/--/api/v2/push/send"

    # -------------------------------------------------------------------------
    # Supabase Storage
    # -------------------------------------------------------------------------
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""

    # -------------------------------------------------------------------------
    # File upload limits
    # -------------------------------------------------------------------------
    MAX_UPLOAD_SIZE_MB: int = 10

    model_config = SettingsConfigDict(
        env_file=(
            os.path.join(BACKEND_DIR, ".env"),
            ".env",
            "backend/.env",
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # -------------------------------------------------------------------------
    # Derived helpers
    # -------------------------------------------------------------------------

    def get_async_database_url(self) -> str:
        """Return an asyncpg-compatible DB URL, raising ValueError on misconfiguration."""
        url = self.DATABASE_URL.strip()
        if not url:
            raise ValueError(
                "\n[Error]: DATABASE_URL is missing or empty in backend/.env file.\n"
                "Please add your Supabase PostgreSQL connection string to backend/.env."
            )
        if url.startswith("https://") or url.startswith("http://"):
            raise ValueError(
                f"\n{'=' * 80}\n"
                "[DATABASE CONNECTION ERROR]\n"
                f"Invalid DATABASE_URL format: '{url}'\n\n"
                "You pasted the Supabase Web/REST API URL instead of the PostgreSQL connection string.\n\n"
                "HOW TO FIX:\n"
                "1. Open Supabase Dashboard → Select your project\n"
                "2. Go to Project Settings (gear icon) → Database\n"
                "3. Scroll to 'Connection string' → select 'URI'\n"
                "4. Copy the string starting with: postgresql://postgres.[ref]:[PASSWORD]...\n"
                "5. Replace '[YOUR-PASSWORD]' with your actual password and save to backend/.env\n"
                f"{'=' * 80}\n"
            )
        if url.startswith("postgres://"):
            url = "postgresql+asyncpg://" + url[len("postgres://"):]
        elif url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
            url = "postgresql+asyncpg://" + url[len("postgresql://"):]
        return url

    def validate_jwt_secret(self) -> None:
        """Raise ValueError if JWT_SECRET_KEY is missing or still set to an insecure default."""
        if not self.JWT_SECRET_KEY or self.JWT_SECRET_KEY.startswith("nexware-super-secret"):
            raise ValueError(
                "\n[Error]: JWT_SECRET_KEY is missing or insecure in backend/.env.\n"
                "Generate a strong secret with: python -c \"import secrets; print(secrets.token_hex(64))\"\n"
                "and set it as JWT_SECRET_KEY in backend/.env."
            )


settings = Settings()
