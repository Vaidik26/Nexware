"""
Application settings loaded from environment variables via pydantic-settings.

All configuration is read exclusively from the .env file or the host environment.
No secrets or URLs are ever hardcoded in source code.
"""
import os
from typing import Optional

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
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000,http://localhost:8081,https://nexware.vercel.app"

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
    # Sales-app data source (the legacy analytics project)
    # -------------------------------------------------------------------------
    # The sales history lives in a SEPARATE Supabase project from the one above:
    # it is the legacy sales app's, and it is where ng2_bootstrap / ng2_dashboard
    # are defined. Nothing writes to it — the backend only reads, and only to
    # serve /sales-dashboard.
    #
    # These moved out of the frontend bundle deliberately. Shipping the key to
    # the browser let anyone who opened devtools call ng2_dashboard themselves
    # with no customer filter, which is precisely the territory scoping the
    # portal exists to apply. Held here, the browser never sees the project at
    # all.
    SALES_APP_SUPABASE_URL: str = ""
    SALES_APP_SUPABASE_KEY: str = ""
    #: How long to wait on that project. Its dashboard RPC scans several years
    #: of sales at once and is genuinely slow, so this is well above the usual.
    SALES_APP_TIMEOUT_SECONDS: float = 60.0

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

    def sales_app_config_error(self) -> Optional[str]:
        """
        Return why the sales data source is unusable, or None if it is fine.

        Checked at startup as well as per request: an unset key surfaces as an
        opaque 401 from another project halfway through loading a dashboard,
        which is a bad place to discover a missing environment variable.
        """
        if not self.SALES_APP_SUPABASE_URL.strip() or not self.SALES_APP_SUPABASE_KEY.strip():
            return (
                "SALES_APP_SUPABASE_URL and SALES_APP_SUPABASE_KEY are not set, so the "
                "Sales Dashboard has no data source. They name the legacy sales-app "
                "Supabase project — the same values the frontend used to carry as "
                "VITE_SALES_APP_SUPABASE_URL / VITE_SALES_APP_SUPABASE_ANON_KEY. Move them "
                "into backend/.env; the frontend no longer needs them."
            )
        if not self.SALES_APP_SUPABASE_URL.strip().startswith(("http://", "https://")):
            return (
                f"SALES_APP_SUPABASE_URL must be the project's REST URL "
                f"(https://<ref>.supabase.co), not '{self.SALES_APP_SUPABASE_URL[:40]}'."
            )
        return None

    def validate_jwt_secret(self) -> None:
        """Log a warning and auto-generate a fallback if JWT_SECRET_KEY is missing."""
        if not self.JWT_SECRET_KEY or self.JWT_SECRET_KEY.startswith("nexware-super-secret"):
            import secrets
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(
                "\n[Warning]: JWT_SECRET_KEY is missing or insecure in environment.\n"
                "Auto-generating a temporary random secret for this session. "
                "Users will be logged out when the server restarts."
            )
            self.JWT_SECRET_KEY = secrets.token_hex(32)


settings = Settings()
