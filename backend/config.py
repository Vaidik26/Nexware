import os
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

class Settings(BaseSettings):
    PROJECT_NAME: str = "Nexware Backend"
    
    # Database URL from .env (default to empty string to allow graceful custom error handling)
    DATABASE_URL: str = ""
    
    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000,http://localhost:8081"

    # Notifications
    EXPO_PUSH_URL: str = "https://exp.host/--/api/v2/push/send"

    # Supabase Storage
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""

    model_config = SettingsConfigDict(
        env_file=(
            os.path.join(BACKEND_DIR, ".env"),
            ".env",
            "backend/.env"
        ),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def get_async_database_url(self) -> str:
        url = self.DATABASE_URL.strip()
        if not url:
            raise ValueError(
                "\n[Error]: DATABASE_URL is missing or empty in backend/.env file.\n"
                "Please add your Supabase PostgreSQL connection string to backend/.env."
            )
        if url.startswith("https://") or url.startswith("http://"):
            raise ValueError(
                f"\n================================================================================\n"
                f"[DATABASE CONNECTION ERROR]\n"
                f"Invalid DATABASE_URL format in backend/.env: '{url}'\n\n"
                f"You pasted the Supabase Web/REST API URL instead of the PostgreSQL database connection string.\n\n"
                f"HOW TO FIX IN SUPABASE DASHBOARD:\n"
                f"1. Open your Supabase Dashboard -> Select your project\n"
                f"2. Go to Project Settings (gear icon at bottom left) -> Database\n"
                f"3. Scroll down to 'Connection string' and select 'URI'\n"
                f"4. Copy the string that starts with: postgresql://postgres.[your-project-ref]:[YOUR-PASSWORD]...\n"
                f"5. Replace '[YOUR-PASSWORD]' with your actual database password and save it in backend/.env\n"
                f"================================================================================\n"
            )
        if url.startswith("postgres://"):
            url = "postgresql+asyncpg://" + url[len("postgres://"):]
        elif url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
            url = "postgresql+asyncpg://" + url[len("postgresql://"):]
        return url

settings = Settings()
