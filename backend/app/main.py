"""FastAPI application entry point."""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.database import SessionLocal, verify_database
from app.routers import dashboard, earnings, etf_holdings, holdings, market, transactions, watchlist
from app.services.market_data_service import MarketDataService

logger = logging.getLogger(__name__)

scheduler: BackgroundScheduler | None = None


def _get_refresh_interval() -> int:
    """Read REFRESH_INTERVAL_MINUTES from settings, clamped to 1-1440."""
    settings = get_settings()
    interval = settings.REFRESH_INTERVAL_MINUTES
    if interval < 1:
        interval = 1
    elif interval > 1440:
        interval = 1440
    return interval


def _refresh_market_data() -> None:
    """Background job: refresh all market prices using a new DB session."""
    db = SessionLocal()
    try:
        result = MarketDataService.refresh_all_prices(db)
        logger.info(
            "Market data refresh complete: %d updated, %d failed",
            result.success_count,
            result.failure_count,
        )
    except Exception as exc:
        logger.error("Market data refresh job failed: %s", exc)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: startup and shutdown events."""
    global scheduler

    # Startup: verify database
    logger.info("Verifying database...")
    verify_database()
    logger.info("Database verified.")

    # Startup: configure and start APScheduler
    interval_minutes = _get_refresh_interval()
    logger.info(
        "Starting background scheduler with %d-minute refresh interval.",
        interval_minutes,
    )
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        _refresh_market_data,
        "interval",
        minutes=interval_minutes,
        id="market_data_refresh",
        replace_existing=True,
    )
    scheduler.start()

    yield

    # Shutdown: stop scheduler
    if scheduler is not None:
        logger.info("Shutting down background scheduler...")
        scheduler.shutdown(wait=False)
        scheduler = None


app = FastAPI(
    title="Personal Finance Dashboard API",
    description="Backend API for the Personal Finance Dashboard application.",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware: allow frontend on localhost:3000
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Exception Handlers ---


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Handle Pydantic/FastAPI validation errors with field-level details."""
    errors: list[dict[str, str]] = []
    for error in exc.errors():
        loc = error.get("loc", ())
        # Skip the first element if it's "body"
        field_path = ".".join(str(part) for part in loc if part != "body")
        errors.append(
            {
                "field": field_path,
                "message": error.get("msg", "Validation error"),
            }
        )

    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "data": None,
            "error": "Validation failed",
            "details": errors,
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(
    request: Request, exc: HTTPException
) -> JSONResponse:
    """Wrap FastAPI HTTPExceptions in the standard API envelope format."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "data": None,
            "error": exc.detail,
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    """Catch all unhandled exceptions. Log details, return safe message."""
    logger.error(
        "Unhandled exception on %s %s: %s: %s",
        request.method,
        request.url.path,
        type(exc).__name__,
        exc,
    )
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "data": None,
            "error": "Internal server error",
        },
    )


# --- Routers ---

app.include_router(holdings.router)
app.include_router(etf_holdings.router)
app.include_router(transactions.router)
app.include_router(watchlist.router)
app.include_router(dashboard.router)
app.include_router(market.router)
app.include_router(earnings.router)


# --- Health Check ---


@app.get("/health")
def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}


# --- Uvicorn entry point ---

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )
