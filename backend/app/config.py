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
    # The app has one owner and no logins; chat tools only act for this id.
    OWNER_USER_ID: str = "owner"
    # Which chat engine answers: "rules" (the only one so far).
    CHAT_ENGINE: str = "rules"

    # Auth: nginx basic auth signs the user in and passes their name in this
    # header. Without AUTH_PROXY_SECRET it is trusted only from these client
    # addresses, which works only where nothing rewrites the address.
    AUTH_USER_HEADER: str = "X-Remote-User"
    AUTH_TRUSTED_PROXIES: str = "127.0.0.1,::1"
    # On the VM nginx also sends this secret, proving the request came through
    # it; when set, it replaces the address check (which uvicorn's proxy
    # handling defeats). Generate with: openssl rand -hex 32
    AUTH_PROXY_SECRET: str | None = None
    AUTH_PROXY_SECRET_HEADER: str = "X-Proxy-Secret"
    # Local development only (no nginx): act as this user. Never set on the VM.
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

    @property
    def trusted_proxies(self) -> set[str]:
        return {h.strip() for h in self.AUTH_TRUSTED_PROXIES.split(",") if h.strip()}


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings instance."""
    return Settings()
