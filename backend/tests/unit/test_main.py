"""Tests for FastAPI application setup and error handling."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app, _get_refresh_interval


@pytest.fixture()
async def test_client():
    """Provide an async test client."""
    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


class TestHealthCheck:
    """Tests for the health check endpoint."""

    @pytest.mark.asyncio
    async def test_health_check_returns_ok(self, test_client: AsyncClient) -> None:
        """Health check should return status ok."""
        response = await test_client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestCORSMiddleware:
    """Tests for CORS middleware configuration."""

    @pytest.mark.asyncio
    async def test_cors_allows_localhost_3000(
        self, test_client: AsyncClient
    ) -> None:
        """CORS should allow requests from http://localhost:3000."""
        response = await test_client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"

    @pytest.mark.asyncio
    async def test_cors_rejects_other_origins(
        self, test_client: AsyncClient
    ) -> None:
        """CORS should not allow requests from other origins."""
        response = await test_client.options(
            "/health",
            headers={
                "Origin": "http://evil.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.headers.get("access-control-allow-origin") != "http://evil.com"


class TestGlobalExceptionHandler:
    """Tests for the global exception handler."""

    @pytest.mark.asyncio
    async def test_unhandled_exception_returns_500_envelope(self) -> None:
        """Unhandled exceptions should return 500 with envelope format."""
        # Add a temporary route that raises an exception
        @app.get("/test-error")
        def raise_error() -> None:
            raise RuntimeError("Something went wrong internally")

        # Use raise_app_exceptions=False so the test client doesn't re-raise
        # the exception that Starlette's ServerErrorMiddleware propagates.
        transport = ASGITransport(
            app=app,  # type: ignore[arg-type]
            raise_app_exceptions=False,
        )
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/test-error")

        assert response.status_code == 500
        body = response.json()
        assert body["success"] is False
        assert body["data"] is None
        assert body["error"] == "Internal server error"
        # Should NOT contain internal details
        assert "Something went wrong internally" not in body["error"]
        assert "RuntimeError" not in body["error"]


class TestValidationErrorHandler:
    """Tests for the RequestValidationError handler."""

    @pytest.mark.asyncio
    async def test_validation_error_returns_422_with_field_details(
        self, test_client: AsyncClient
    ) -> None:
        """Validation errors should return 422 with field-level error messages."""
        from pydantic import BaseModel, Field
        from fastapi import APIRouter

        # Create a temporary router with a validated endpoint
        test_router = APIRouter()

        class TestInput(BaseModel):
            name: str = Field(..., min_length=1)
            age: int = Field(..., gt=0)

        @test_router.post("/test-validation")
        def validate_input(data: TestInput) -> dict[str, str]:
            return {"status": "ok"}

        app.include_router(test_router)

        # Send invalid data
        response = await test_client.post(
            "/test-validation",
            json={"name": "", "age": -1},
        )
        assert response.status_code == 422
        body = response.json()
        assert body["success"] is False
        assert body["data"] is None
        assert body["error"] == "Validation failed"
        assert "details" in body
        assert len(body["details"]) > 0
        # Each detail should have field and message
        for detail in body["details"]:
            assert "field" in detail
            assert "message" in detail


class TestRefreshInterval:
    """Tests for the refresh interval configuration."""

    def test_default_interval(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Default interval should be 15 minutes."""
        from app.config import get_settings
        get_settings.cache_clear()
        monkeypatch.setenv("REFRESH_INTERVAL_MINUTES", "15")
        get_settings.cache_clear()
        interval = _get_refresh_interval()
        assert interval == 15

    def test_interval_clamped_to_minimum(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Interval below 1 should be clamped to 1."""
        from app.config import get_settings
        get_settings.cache_clear()
        monkeypatch.setenv("REFRESH_INTERVAL_MINUTES", "0")
        get_settings.cache_clear()
        interval = _get_refresh_interval()
        assert interval == 1

    def test_interval_clamped_to_maximum(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Interval above 1440 should be clamped to 1440."""
        from app.config import get_settings
        get_settings.cache_clear()
        monkeypatch.setenv("REFRESH_INTERVAL_MINUTES", "2000")
        get_settings.cache_clear()
        interval = _get_refresh_interval()
        assert interval == 1440

    def test_valid_interval_passes_through(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Valid interval within range should pass through unchanged."""
        from app.config import get_settings
        get_settings.cache_clear()
        monkeypatch.setenv("REFRESH_INTERVAL_MINUTES", "30")
        get_settings.cache_clear()
        interval = _get_refresh_interval()
        assert interval == 30


class TestRouterErrorsUseTheEnvelope:
    """404s and 405s raised by the router itself get the standard envelope."""

    @pytest.mark.asyncio
    async def test_unknown_path(self, test_client: AsyncClient) -> None:
        response = await test_client.get("/api/no-such-thing")
        assert response.status_code == 404
        assert response.json() == {"success": False, "data": None, "error": "Not Found"}

    @pytest.mark.asyncio
    async def test_wrong_method_keeps_the_allow_header(
        self, test_client: AsyncClient
    ) -> None:
        response = await test_client.delete("/health")
        assert response.status_code == 405
        assert response.headers["allow"] == "GET"
        assert response.json()["error"] == "Method Not Allowed"
