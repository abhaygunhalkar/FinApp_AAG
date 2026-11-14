"""Application configuration loaded from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings read from environment variables or .env file."""

    DATABASE_URL: str = "sqlite:///./finance_tracker.db"
    MARKET_API_PROVIDER: str = "yfinance"
    REFRESH_INTERVAL_MINUTES: int = 15
    BROKERS: str = "Robinhood,Schwab,Merrill"
    FINNHUB_API_KEY: str | None = None
    PLAID_CLIENT_ID: str | None = None
    PLAID_SECRET: str | None = None
    PLAID_ENV: str = "sandbox"
    # The app has one owner; chat tools only act for this id.
    OWNER_USER_ID: str = "owner"
    # Which chat engine answers: "rules" (the only one so far).
    CHAT_ENGINE: str = "rules"

    # Sign-in (app/auth.py). One owner account, made on the server with
    # scripts/create_owner.py; there is no sign-up page.
    AUTH_SESSION_IDLE_MINUTES: int = 60
    AUTH_SESSION_MAX_HOURS: int = 12
    # Off only for local development over plain http.
    AUTH_COOKIE_SECURE: bool = True
    AUTH_MAX_FAILED_LOGINS: int = 5
    AUTH_LOCKOUT_MINUTES: int = 15
    AUTH_LOGIN_ATTEMPTS_PER_MINUTE: int = 10

    # No longer used: the nginx basic-auth setup before the app had its own
    # sign-in. Kept so an existing .env still loads; remove them from .env,
    # then from here.
    AUTH_USER_HEADER: str = "X-Remote-User"
    AUTH_TRUSTED_PROXIES: str = "127.0.0.1,::1"
    AUTH_PROXY_SECRET: str | None = None
    AUTH_PROXY_SECRET_HEADER: str = "X-Proxy-Secret"
    AUTH_DEV_USER: str | None = None

    # POST /api/chat limits.
    CHAT_RATE_LIMIT_PER_MINUTE: int = 30
    CHAT_MAX_BODY_BYTES: int = 8192
    CHAT_TIMEOUT_SECONDS: float = 10.0
    CHAT_SESSION_TTL_MINUTES: int = 30
    CHAT_HISTORY_LIMIT: int = 20

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def broker_list(self) -> list[str]:
        """Return the list of configured brokers."""
        return [b.strip() for b in self.BROKERS.split(",") if b.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings instance."""
    return Settings()
