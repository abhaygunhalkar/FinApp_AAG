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

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def broker_list(self) -> list[str]:
        """Return the list of configured brokers."""
        return [b.strip() for b in self.BROKERS.split(",") if b.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings instance."""
    return Settings()
