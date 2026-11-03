"""Unit tests for the chat contract (app/schemas/chat.py).

The shared examples in docs/chat-contract.examples.json are also checked by the
frontend's Zod schemas, so both sides accept and reject the same payloads.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from app.schemas.chat import (
    ChatRequest,
    ChatResponse,
    StatMessage,
    TableMessage,
    TextMessage,
    parse_chat_request,
    parse_chat_response,
)

EXAMPLES: dict[str, Any] = json.loads(
    (Path(__file__).parents[3] / "docs" / "chat-contract.examples.json").read_text()
)


def _why(case: dict[str, Any]) -> str:
    return str(case["why"])


@pytest.mark.parametrize("payload", EXAMPLES["valid"]["requests"])
def test_valid_requests_round_trip(payload: dict[str, Any]) -> None:
    request = parse_chat_request(payload)
    assert request.model_dump(by_alias=True, exclude_unset=True) == payload


@pytest.mark.parametrize("payload", EXAMPLES["valid"]["responses"])
def test_valid_responses_round_trip(payload: dict[str, Any]) -> None:
    response = parse_chat_response(payload)
    assert response.model_dump(by_alias=True, exclude_unset=True) == payload


@pytest.mark.parametrize("case", EXAMPLES["invalid"]["requests"], ids=_why)
def test_invalid_requests_are_rejected(case: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        parse_chat_request(case["value"])


@pytest.mark.parametrize("case", EXAMPLES["invalid"]["responses"], ids=_why)
def test_invalid_responses_are_rejected(case: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        parse_chat_response(case["value"])


def test_every_message_type_has_a_valid_example() -> None:
    seen = {m["type"] for r in EXAMPLES["valid"]["responses"] for m in r["messages"]}
    assert seen == {
        "text",
        "stat",
        "table",
        "chart",
        "quickReplies",
        "link",
        "confirm",
        "error",
    }


def test_message_is_trimmed_and_limited_to_2000_characters() -> None:
    request = parse_chat_request({"sessionId": "s", "message": "  hi  "})
    assert request.message == "hi"
    parse_chat_request({"sessionId": "s", "message": "x" * 2000})
    parse_chat_request({"sessionId": "s", "message": " " + "x" * 2000 + " "})
    with pytest.raises(ValidationError):
        parse_chat_request({"sessionId": "s", "message": "x" * 2001})


def test_python_code_can_use_snake_case_names() -> None:
    response = ChatResponse(
        session_id="s",
        messages=[TextMessage(type="text", text="hi")],
    )
    assert response.model_dump(by_alias=True)["sessionId"] == "s"
    request = ChatRequest(session_id="s", message="hi")
    assert request.session_id == "s"


def test_stat_currency_defaults_to_usd() -> None:
    stat = StatMessage.model_validate({"type": "stat", "label": "Cash", "value": 5})
    assert stat.currency == "USD"


def test_table_error_names_the_bad_row() -> None:
    with pytest.raises(ValidationError, match="row 1 has 1 cells; expected 2"):
        TableMessage.model_validate(
            {"type": "table", "columns": ["A", "B"], "rows": [[1, 2], [3]]}
        )
