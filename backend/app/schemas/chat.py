"""Chat assistant contract: what the widget sends and what the bot replies.

Mirrored in frontend/src/types/chat.ts (Zod). Change both together, and the
shared examples in docs/chat-contract.examples.json. See docs/chat-contract.md.

Unlike the rest of the API, these fields are camelCase on the wire; Python
code uses the snake_case names. Parse wire JSON with `parse_chat_request` /
`parse_chat_response`, which reject snake_case keys so both sides agree.
"""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel


class ChatModel(BaseModel):
    """camelCase on the wire, and unknown fields are rejected."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
        extra="forbid",
    )


class ChatAction(ChatModel):
    """What a quick reply or confirm button sends back to the bot."""

    type: str = Field(..., min_length=1, max_length=64)
    payload: dict[str, Any] | None = None


class ChatRequest(ChatModel):
    """One turn from the user: typed text, or a clicked action. Never both."""

    session_id: str = Field(..., min_length=1, max_length=100)
    # Trimmed first, then checked, as the frontend does.
    message: str | None = Field(None, min_length=1, max_length=2000)
    action: ChatAction | None = None

    @field_validator("message", mode="before")
    @classmethod
    def strip_message(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def one_of_message_or_action(self) -> "ChatRequest":
        if (self.message is None) == (self.action is None):
            raise ValueError("send either a message or an action")
        return self


class TextMessage(ChatModel):
    type: Literal["text"]
    text: str = Field(..., min_length=1)


class StatMessage(ChatModel):
    """One headline number, e.g. "Net worth $330,827 ▲ $1,200"."""

    type: Literal["stat"]
    label: str = Field(..., min_length=1)
    value: float
    currency: str = Field("USD", pattern=r"^[A-Z]{3}$")
    delta: float | None = None


Cell = str | float | None


class TableMessage(ChatModel):
    type: Literal["table"]
    columns: list[str] = Field(..., min_length=1)
    rows: list[list[Cell]]

    @model_validator(mode="after")
    def rows_match_columns(self) -> "TableMessage":
        for i, row in enumerate(self.rows):
            if len(row) != len(self.columns):
                raise ValueError(
                    f"row {i} has {len(row)} cells; expected {len(self.columns)}"
                )
        return self


class ChartPoint(ChatModel):
    label: str
    value: float


class ChartSeries(ChatModel):
    name: str
    points: list[ChartPoint]


class ChartMessage(ChatModel):
    type: Literal["chart"]
    kind: Literal["bar", "pie", "line"]
    series: list[ChartSeries] = Field(..., min_length=1)

    @model_validator(mode="after")
    def pie_has_one_series(self) -> "ChartMessage":
        if self.kind == "pie" and len(self.series) != 1:
            raise ValueError("a pie chart has exactly one series")
        return self


class QuickReply(ChatModel):
    label: str = Field(..., min_length=1)
    action: ChatAction


class QuickRepliesMessage(ChatModel):
    type: Literal["quickReplies"]
    options: list[QuickReply] = Field(..., min_length=1, max_length=6)


class LinkMessage(ChatModel):
    """A link to a page in the app; never an external URL."""

    type: Literal["link"]
    label: str = Field(..., min_length=1)
    route: str = Field(..., pattern=r"^/([^/].*)?$")


class ConfirmMessage(ChatModel):
    """Asked before the bot changes anything."""

    type: Literal["confirm"]
    prompt: str = Field(..., min_length=1)
    confirm_action: ChatAction
    cancel_action: ChatAction


class ErrorMessage(ChatModel):
    type: Literal["error"]
    message: str = Field(..., min_length=1)
    code: str | None = None


BotMessage = Annotated[
    TextMessage
    | StatMessage
    | TableMessage
    | ChartMessage
    | QuickRepliesMessage
    | LinkMessage
    | ConfirmMessage
    | ErrorMessage,
    Field(discriminator="type"),
]


class ChatResponse(ChatModel):
    """The bot's reply to one turn: one or more messages, in order."""

    session_id: str = Field(..., min_length=1, max_length=100)
    messages: list[BotMessage]


def parse_chat_request(data: Any) -> ChatRequest:
    """Validate a request from the wire (camelCase keys only)."""
    return ChatRequest.model_validate(data, by_name=False)


def dump_chat_response(response: ChatResponse) -> dict[str, Any]:
    """A response as wire JSON. Unset optional fields are left out, not sent
    as null, which the frontend's schema would reject; null table cells stay."""
    return response.model_dump(mode="json", by_alias=True, exclude_none=True)


def parse_chat_response(data: Any) -> ChatResponse:
    """Validate a response from the wire (camelCase keys only)."""
    return ChatResponse.model_validate(data, by_name=False)
