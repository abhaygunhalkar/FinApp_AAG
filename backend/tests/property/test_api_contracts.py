"""Property-based tests for API contracts and error handling.

Tests Property 19 (API response contract) and Property 20 (Error responses hide
internals)
using Hypothesis to generate random payloads and verify response format and security.

**Validates: Requirements 11.6, 11.7, 14.1, 14.2**
"""

import re
from collections.abc import Generator
from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from sqlalchemy.orm import Session

from app.database import get_db
from app.main import app

# --- Fixtures ---


@pytest.fixture()
def test_client(db_session: Session) -> Generator[TestClient, None, None]:
    """Provide a synchronous test client with the test DB session injected."""

    def _override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app, raise_server_exceptions=False) as tc:
        yield tc
    app.dependency_overrides.clear()


# --- Strategies ---

# Strategy for generating arbitrary JSON-like payloads (invalid data)
json_primitives = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(),
    st.floats(allow_nan=False, allow_infinity=False),
    st.text(max_size=50),
)

json_values = st.recursive(
    json_primitives,
    lambda children: st.one_of(
        st.lists(children, max_size=3),
        st.dictionaries(st.text(max_size=10), children, max_size=5),
    ),
    max_leaves=10,
)

# Strategy for random request bodies (dictionaries with arbitrary keys/values)
random_payload_st = st.dictionaries(
    keys=st.text(min_size=1, max_size=20),
    values=json_values,
    min_size=0,
    max_size=10,
)

# Endpoints that accept POST with a JSON body
POST_ENDPOINTS = [
    "/api/holdings",
    "/api/watchlist",
    "/api/transactions",
]

# Endpoints that accept PUT with a JSON body
PUT_ENDPOINTS = [
    "/api/holdings/1",
    "/api/watchlist/1",
]

# GET endpoints (no body required) — only endpoints that don't make external calls
GET_ENDPOINTS = [
    "/api/holdings",
    "/api/holdings/1",
    "/api/holdings/99999",
    "/api/watchlist",
    "/api/transactions?holding_id=1",
    "/api/dashboard/summary",
    "/api/dashboard/activity",
    "/api/dashboard/history",
    "/health",
]

# Market endpoints tested separately with mocked external calls
MARKET_GET_ENDPOINTS = [
    "/api/market/quote/AAPL",
    "/api/market/history/AAPL",
]

# DELETE endpoints
DELETE_ENDPOINTS = [
    "/api/holdings/99999",
    "/api/watchlist/99999",
    "/api/transactions/99999",
]

# Sampled strategies
ALL_GET_ENDPOINTS = st.sampled_from(GET_ENDPOINTS)
ALL_MARKET_ENDPOINTS = st.sampled_from(MARKET_GET_ENDPOINTS)
ALL_POST_ENDPOINTS = st.sampled_from(POST_ENDPOINTS)
ALL_PUT_ENDPOINTS = st.sampled_from(PUT_ENDPOINTS)
ALL_DELETE_ENDPOINTS = st.sampled_from(DELETE_ENDPOINTS)


# Common settings for all property tests
PBT_SETTINGS = settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)


def _validate_envelope(body: dict[str, Any]) -> None:
    """Assert the response body conforms to the API envelope format.

    Envelope: {success: bool, data: T | null, error: str | null}
    - success=true => error is null, data may be non-null
    - success=false => data is null, error is non-null (string)
    """
    assert "success" in body, f"Missing 'success' key in response: {body}"
    assert isinstance(body["success"], bool), f"'success' must be bool: {body}"
    assert "data" in body, f"Missing 'data' key in response: {body}"
    assert "error" in body, f"Missing 'error' key in response: {body}"

    if body["success"] is True:
        assert (
            body["error"] is None
        ), f"success=true but error is not null: {body['error']}"
    else:
        assert (
            body["data"] is None
        ), f"success=false but data is not null: {body['data']}"
        assert body["error"] is not None, "success=false but error is null"
        assert isinstance(
            body["error"], str
        ), f"error must be a string, got: {type(body['error'])}"


# --- Property 19: API response contract ---


class TestProperty19ApiResponseContract:
    """Property 19: API response contract.

    For any API request to any endpoint, the response body SHALL conform to
    the envelope format {success: boolean, data: T | null, error: string | null}.

    **Validates: Requirements 11.6, 11.7**
    """

    @PBT_SETTINGS
    @given(endpoint=ALL_GET_ENDPOINTS)
    def test_get_endpoints_return_envelope(
        self, endpoint: str, test_client: TestClient
    ) -> None:
        """All GET endpoints return responses conforming to the envelope format."""
        response = test_client.get(endpoint)
        body = response.json()

        # /health is a special case - it doesn't use the envelope
        if endpoint == "/health":
            assert "status" in body
            return

        _validate_envelope(body)

    @PBT_SETTINGS
    @given(endpoint=ALL_MARKET_ENDPOINTS)
    def test_market_endpoints_return_envelope(
        self, endpoint: str, test_client: TestClient
    ) -> None:
        """Market GET endpoints return responses conforming to the envelope format."""
        # Mock external yfinance calls to avoid network dependency
        with (
            patch(
                "app.services.market_data_service.MarketDataService.fetch_quote",
                return_value=None,
            ),
            patch(
                "app.services.market_data_service.MarketDataService.fetch_history",
                return_value=[],
            ),
            patch(
                "app.services.market_data_service.MarketDataService.get_cached_price",
                return_value=None,
            ),
        ):
            response = test_client.get(endpoint)
            body = response.json()
            _validate_envelope(body)

    @PBT_SETTINGS
    @given(endpoint=ALL_POST_ENDPOINTS, payload=random_payload_st)
    def test_post_with_random_payload_returns_envelope(
        self, endpoint: str, payload: dict[str, Any], test_client: TestClient
    ) -> None:
        """POST endpoints with random payloads return responses in envelope format."""
        response = test_client.post(endpoint, json=payload)
        body = response.json()
        _validate_envelope(body)

    @PBT_SETTINGS
    @given(endpoint=ALL_PUT_ENDPOINTS, payload=random_payload_st)
    def test_put_with_random_payload_returns_envelope(
        self, endpoint: str, payload: dict[str, Any], test_client: TestClient
    ) -> None:
        """PUT endpoints with random payloads return responses in envelope format."""
        response = test_client.put(endpoint, json=payload)
        body = response.json()
        _validate_envelope(body)

    @PBT_SETTINGS
    @given(endpoint=ALL_DELETE_ENDPOINTS)
    def test_delete_endpoints_return_envelope(
        self, endpoint: str, test_client: TestClient
    ) -> None:
        """DELETE endpoints return responses conforming to the envelope format."""
        response = test_client.delete(endpoint)
        body = response.json()
        _validate_envelope(body)

    @PBT_SETTINGS
    @given(endpoint=ALL_POST_ENDPOINTS, payload=random_payload_st)
    def test_invalid_payload_returns_422(
        self, endpoint: str, payload: dict[str, Any], test_client: TestClient
    ) -> None:
        """POST with payloads missing required fields returns 422 with envelope."""
        response = test_client.post(endpoint, json=payload)
        body = response.json()

        # Assert envelope format for all cases
        _validate_envelope(body)

        # If status is 422, verify it's a validation error response
        if response.status_code == 422:
            assert body["success"] is False
            assert body["error"] is not None

    @PBT_SETTINGS
    @given(
        endpoint=ALL_POST_ENDPOINTS,
        payload=st.just({}),  # Empty payload always fails validation
    )
    def test_empty_payload_returns_422_with_envelope(
        self, endpoint: str, payload: dict[str, Any], test_client: TestClient
    ) -> None:
        """POST with empty payload returns 422 status code with envelope format."""
        response = test_client.post(endpoint, json=payload)
        body = response.json()

        assert response.status_code == 422
        _validate_envelope(body)
        assert body["success"] is False
        assert body["error"] is not None


# --- Property 20: Error responses hide internals ---


# Patterns that should NEVER appear in error messages
INTERNAL_PATTERNS = [
    # Stack traces
    re.compile(r"Traceback \(most recent call last\)", re.IGNORECASE),
    re.compile(r"File \"[^\"]+\", line \d+", re.IGNORECASE),
    # File paths (Unix or Windows)
    re.compile(r"(/[a-zA-Z0-9_\-\.]+){3,}"),  # Unix paths like /app/routers/foo.py
    re.compile(r"[A-Z]:\\[^\s]+"),  # Windows paths like C:\Users\...
    # Python exception class names
    re.compile(r"\b[A-Z][a-zA-Z]*Error\b"),
    re.compile(r"\b[A-Z][a-zA-Z]*Exception\b"),
    # Database query strings
    re.compile(r"\bSELECT\b.*\bFROM\b", re.IGNORECASE),
    re.compile(r"\bINSERT\b.*\bINTO\b", re.IGNORECASE),
    re.compile(r"\bUPDATE\b.*\bSET\b", re.IGNORECASE),
    re.compile(r"\bDELETE\b.*\bFROM\b", re.IGNORECASE),
    # Internal variable names / module paths
    re.compile(r"\bapp\.[a-z_]+\.[a-z_]+"),  # e.g., app.services.holdings_service
    re.compile(r"sqlalchemy\.", re.IGNORECASE),
]


def _assert_no_internals(error_message: str) -> None:
    """Assert that an error message does not expose internal details."""
    for pattern in INTERNAL_PATTERNS:
        assert not pattern.search(error_message), (
            f"Error message exposes internals matching pattern "
            f"'{pattern.pattern}': {error_message!r}"
        )


class TestProperty20ErrorResponsesHideInternals:
    """Property 20: Error responses hide internals.

    For any 500 response, the error message SHALL NOT contain stack traces,
    file paths, Python exception class names, database query strings, or
    internal variable names.

    **Validates: Requirements 14.1, 14.2**
    """

    @PBT_SETTINGS
    @given(endpoint=ALL_GET_ENDPOINTS)
    def test_get_error_responses_hide_internals(
        self, endpoint: str, test_client: TestClient
    ) -> None:
        """GET error responses do not expose internal implementation details."""
        response = test_client.get(endpoint)
        body = response.json()

        # Only check error responses (skip /health which has different format)
        if endpoint == "/health":
            return
        if response.status_code >= 400 and "error" in body and body["error"]:
            _assert_no_internals(body["error"])

    @PBT_SETTINGS
    @given(endpoint=ALL_POST_ENDPOINTS, payload=random_payload_st)
    def test_post_error_responses_hide_internals(
        self, endpoint: str, payload: dict[str, Any], test_client: TestClient
    ) -> None:
        """POST error responses do not expose internal implementation details."""
        response = test_client.post(endpoint, json=payload)
        body = response.json()

        if response.status_code >= 400 and "error" in body and body["error"]:
            _assert_no_internals(body["error"])

    @PBT_SETTINGS
    @given(endpoint=ALL_PUT_ENDPOINTS, payload=random_payload_st)
    def test_put_error_responses_hide_internals(
        self, endpoint: str, payload: dict[str, Any], test_client: TestClient
    ) -> None:
        """PUT error responses do not expose internal implementation details."""
        response = test_client.put(endpoint, json=payload)
        body = response.json()

        if response.status_code >= 400 and "error" in body and body["error"]:
            _assert_no_internals(body["error"])

    @PBT_SETTINGS
    @given(endpoint=ALL_DELETE_ENDPOINTS)
    def test_delete_error_responses_hide_internals(
        self, endpoint: str, test_client: TestClient
    ) -> None:
        """DELETE error responses do not expose internal implementation details."""
        response = test_client.delete(endpoint)
        body = response.json()

        if response.status_code >= 400 and "error" in body and body["error"]:
            _assert_no_internals(body["error"])

    @PBT_SETTINGS
    @given(
        payload=st.dictionaries(
            keys=st.text(min_size=1, max_size=30),
            values=st.one_of(
                st.text(max_size=100),
                st.integers(),
                st.floats(allow_nan=False, allow_infinity=False),
                st.booleans(),
                st.none(),
                st.lists(st.text(max_size=20), max_size=5),
            ),
            min_size=1,
            max_size=15,
        )
    )
    def test_500_responses_return_generic_message(
        self, payload: dict[str, Any], test_client: TestClient
    ) -> None:
        """Any 500 response should contain only a generic error message."""
        # Try all POST endpoints with random payloads to trigger potential 500s
        for endpoint in POST_ENDPOINTS:
            response = test_client.post(endpoint, json=payload)
            if response.status_code == 500:
                body = response.json()
                assert (
                    body["error"] == "Internal server error"
                ), f"500 response has non-generic error: {body['error']!r}"
                assert body["success"] is False
                assert body["data"] is None
                _assert_no_internals(body["error"])
