from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/phishguard"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    SECRET_KEY: str = "change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # LLMs
    GROQ_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    PRIMARY_MODEL: str = "llama-3-70b-8192"
    FALLBACK_MODEL: str = "gpt-4o"

    # Agent config
    RAGAS_PASS_THRESHOLD: float = 0.75
    MAX_RETRIES: int = 2

    # ChromaDB
    CHROMA_PERSIST_DIR: str = "./chroma_db"
    CHROMA_COLLECTION: str = "phishing_patterns"
    RAG_TOP_K: int = 5

    # Tracking
    BASE_URL: str = "http://localhost:8000"
    TRACKING_WINDOW_DAYS: int = 14

    # Email sending (Gmail SMTP — Brevo's transactional API was stuck in an
    # unexplained "sending platform disabled" state with no error detail, so
    # this app sends through a regular Gmail account + App Password instead)
    GMAIL_ADDRESS: str = ""
    GMAIL_APP_PASSWORD: str = ""
    # Gmail's own cap is ~500 recipients/day on a free account; stay under it.
    EMAIL_DAILY_LIMIT: int = 450

    @field_validator("GMAIL_APP_PASSWORD")
    @classmethod
    def _strip_app_password_spaces(cls, v: str) -> str:
        # Google's UI displays the code as "xxxx xxxx xxxx xxxx" for
        # readability, but the real password has no spaces — strip them so a
        # literal copy-paste from the Google Account page still works.
        return v.replace(" ", "")

    # App
    ENVIRONMENT: str = "development"
    FRONTEND_URL: str = "http://localhost:5173"
    LOG_LEVEL: str = "INFO"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def frontend_origins(self) -> list[str]:
        """FRONTEND_URL may be a comma-separated list (prod domain + Vercel preview URLs)."""
        return [o.strip() for o in self.FRONTEND_URL.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
