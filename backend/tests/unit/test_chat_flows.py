"""Tests for the "mark a bill paid" chat flow (app/services/chat_engine/flows.py)
and for idempotent write tools."""

import threading
import time
from datetime import date
from typing import Any

import pytest
from sqlalchemy.orm import Session

from app.models.financial_account import FinancialAccount
from app.models.recurring_expense import RecurringExpense
from app.schemas.chat import (
    ChatAction,
    ChatRequest,
    dump_chat_response,
    parse_chat_response,
)
from app.services.chat_engine import RuleBasedEngine
from app.services.chat_engine.intents import default_intents
from app.services.chat_service import ChatService
from app.services.chat_sessions import InMemorySessionStore
from app.services.chat_tools import (
    IdempotencyStore,
    ToolContext,
    ToolError,
    build_registry,
)

OWNER = "owner"
TODAY = date(2026, 11, 2)


class Chat:
    """A conversation that keeps its session between turns, like the app."""

    def __init__(self, db: Session, session_id: str = "s-1") -> None:
        self.db = db
        self.session_id = session_id
        self.service = ChatService(
            RuleBasedEngine(build_registry(OWNER)), InMemorySessionStore(600)
        )

    def say(self, message: str) -> dict[str, Any]:
        return self._send(ChatRequest(session_id=self.session_id, message=message))

    def click(self, action: dict[str, Any]) -> dict[str, Any]:
        return self._send(
            ChatRequest(session_id=self.session_id, action=ChatAction(**action))
        )

    def _send(self, request: ChatRequest) -> dict[str, Any]:
        response, _intent = self.service.handle(self.db, OWNER, request, TODAY)
        wire = dump_chat_response(response)
        parse_chat_response(wire)
        return wire


def kinds(reply: dict[str, Any]) -> list[str]:
    return [m["type"] for m in reply["messages"]]


def chip_labels(reply: dict[str, Any]) -> list[str]:
    return [o["label"] for o in reply["messages"][-1]["options"]]


def chip_action(reply: dict[str, Any], label: str) -> dict[str, Any]:
    return next(
        o["action"] for o in reply["messages"][-1]["options"] if o["label"] == label
    )


def confirm_card(reply: dict[str, Any]) -> dict[str, Any]:
    card = reply["messages"][-1]
    assert card["type"] == "confirm"
    return dict(card)


@pytest.fixture
def bills(db_session: Session) -> dict[str, int]:
    checking = FinancialAccount(name="Checking", account_type="checking", balance=5000)
    db_session.add(checking)
    db_session.commit()
    ids = {}
    for name, amount, freq, due, autopay in [
        ("Rent", 2400, "monthly", date(2026, 11, 5), False),
        ("Water", 50, "monthly", date(2026, 10, 20), False),  # overdue
        ("Phone", 60, "monthly", date(2026, 10, 25), True),  # autopay
        ("Gym", 45, "monthly", None, False),  # no due date
        ("Car insurance", 600, "semiannual", date(2026, 12, 20), False),
        ("Home insurance", 900, "annual", date(2027, 1, 15), False),
    ]:
        bill = RecurringExpense(
            name=name,
            category="Housing",
            amount=amount,
            frequency=freq,
            next_due_date=due,
            autopay=autopay,
            paid_from_account_id=checking.id,
        )
        db_session.add(bill)
        db_session.commit()
        ids[name] = bill.id
    return ids


def due(db: Session, bill_id: int) -> date | None:
    db.expire_all()
    bill = db.get(RecurringExpense, bill_id)
    assert bill is not None
    return bill.next_due_date


class TestOneShot:
    def test_paid_rent_asks_then_marks_paid_on_yes(
        self, db_session: Session, bills: dict[str, int]
    ) -> None:
        chat = Chat(db_session)
        reply = chat.say("I paid rent")
        assert kinds(reply) == ["confirm"]
        card = confirm_card(reply)
        assert card["prompt"] == (
            "Mark Rent ($2,400.00, due Nov 5) as paid? It will next be due Dec 5."
        )
        assert card["cancelAction"] == {"type": "cancelFlow"}
        # Nothing changes until the button.
        assert due(db_session, bills["Rent"]) == date(2026, 11, 5)

        done = chat.click(card["confirmAction"])
        assert done["messages"][0]["text"] == (
            "Done. Rent is marked paid; it's next due Dec 5."
        )
        assert chip_labels(done) == [
            "Bills due this week",
            "Mark another bill paid",
            "Can I cover my bills?",
        ]
        assert due(db_session, bills["Rent"]) == date(2026, 12, 5)

    @pytest.mark.parametrize(
        "text",
        [
            "mark rent as paid",
            "Mark the rent paid",
            "we just paid the rnt",
            "paid rent",
        ],
    )
    def test_phrasings(
        self, db_session: Session, bills: dict[str, int], text: str
    ) -> None:
        reply = Chat(db_session).say(text)
        assert confirm_card(reply)["prompt"].startswith("Mark Rent ")

    def test_overdue_bill(self, db_session: Session, bills: dict[str, int]) -> None:
        reply = Chat(db_session).say("I paid the water bill")
        assert confirm_card(reply)["prompt"] == (
            "Mark Water ($50.00, overdue since Oct 20) as paid? "
            "It will next be due Nov 20."
        )

    def test_get_paid_is_still_about_income(self) -> None:
        intent = default_intents().match("when do I get paid?")
        assert intent is not None and intent.name == "income"


class TestChoosingTheBill:
    def test_no_bill_named_offers_the_payable_ones_soonest_first(
        self, db_session: Session, bills: dict[str, int]
    ) -> None:
        chat = Chat(db_session)
        reply = chat.say("mark a bill as paid")
        assert reply["messages"][0]["text"] == "Which bill did you pay?"
        # Not Phone (autopay) or Gym (no due date).
        assert chip_labels(reply) == [
            "Water · overdue",
            "Rent · Nov 5",
            "Car insurance · Dec 20",
            "Home insurance · Jan 15",
            "Cancel",
        ]
        card = confirm_card(chat.click(chip_action(reply, "Rent · Nov 5")))
        assert card["prompt"].startswith("Mark Rent ")

    def test_ambiguous_name(self, db_session: Session, bills: dict[str, int]) -> None:
        chat = Chat(db_session)
        reply = chat.say("I paid the insurance")
        assert reply["messages"][0]["text"] == "Which one?"
        assert chip_labels(reply) == [
            "Car insurance · Dec 20",
            "Home insurance · Jan 15",
            "Cancel",
        ]
        card = confirm_card(chat.click(chip_action(reply, "Car insurance · Dec 20")))
        assert card["prompt"] == (
            "Mark Car insurance ($600.00, due Dec 20) as paid? "
            "It will next be due Jun 20."
        )

    def test_name_typed_after_the_question(
        self, db_session: Session, bills: dict[str, int]
    ) -> None:
        chat = Chat(db_session)
        chat.say("mark a bill paid")
        card = confirm_card(chat.say("home insurance"))
        assert card["prompt"].startswith("Mark Home insurance ")

    def test_unknown_bill(self, db_session: Session, bills: dict[str, int]) -> None:
        reply = Chat(db_session).say("I paid unicorn")
        assert reply["messages"][0]["text"] == (
            "I couldn't find a bill called “unicorn”. Which bill did you pay?"
        )
        assert chip_labels(reply)[-1] == "Cancel"

    def test_autopay_bill_is_refused(
        self, db_session: Session, bills: dict[str, int]
    ) -> None:
        reply = Chat(db_session).say("I paid phone")
        assert kinds(reply) == ["text", "quickReplies"]
        assert reply["messages"][0]["text"].startswith("Phone is on autopay")
        assert due(db_session, bills["Phone"]) == date(2026, 10, 25)

    def test_bill_without_due_date(
        self, db_session: Session, bills: dict[str, int]
    ) -> None:
        reply = Chat(db_session).say("I paid gym")
        assert reply["messages"][0]["text"] == (
            "Gym has no due date set, so there's nothing to mark paid."
        )

    def test_nothing_to_mark(self, db_session: Session) -> None:
        reply = Chat(db_session).say("mark a bill paid")
        assert reply["messages"][0]["text"].startswith("You have no bills to mark paid")

    def test_bills_answer_offers_the_flow(
        self, db_session: Session, bills: dict[str, int]
    ) -> None:
        chat = Chat(db_session)
        reply = chat.say("bills due this week")
        reply = chat.click(chip_action(reply, "Mark a bill paid"))
        assert reply["messages"][0]["text"] == "Which bill did you pay?"


class TestCancel:
    def test_no_button(self, db_session: Session, bills: dict[str, int]) -> None:
        chat = Chat(db_session)
        card = confirm_card(chat.say("I paid rent"))
        reply = chat.click(card["cancelAction"])
        assert reply["messages"][0]["text"] == "Okay, nothing was changed."
        # The old Yes no longer works.
        stale = chat.click(card["confirmAction"])
        assert stale["messages"][0]["code"] == "expired"
        assert due(db_session, bills["Rent"]) == date(2026, 11, 5)

    @pytest.mark.parametrize("word", ["cancel", "never mind", "no", "Nope, stop"])
    def test_typed_at_the_confirm_step(
        self, db_session: Session, bills: dict[str, int], word: str
    ) -> None:
        chat = Chat(db_session)
        card = confirm_card(chat.say("I paid rent"))
        assert chat.say(word)["messages"][0]["text"] == "Okay, nothing was changed."
        assert chat.click(card["confirmAction"])["messages"][0]["code"] == "expired"

    def test_typed_at_the_choose_step(
        self, db_session: Session, bills: dict[str, int]
    ) -> None:
        chat = Chat(db_session)
        reply = chat.say("mark a bill paid")
        assert chat.say("cancel")["messages"][0]["text"] == "Okay, nothing was changed."
        # The bill chips from before still work as a fresh start.
        assert kinds(chat.click(chip_action(reply, "Rent · Nov 5"))) == ["confirm"]

    def test_cancel_chip_at_the_choose_step(
        self, db_session: Session, bills: dict[str, int]
    ) -> None:
        chat = Chat(db_session)
        reply = chat.say("mark a bill paid")
        out = chat.click(chip_action(reply, "Cancel"))
        assert out["messages"][0]["text"] == "Okay, nothing was changed."

    def test_nothing_to_cancel(self, db_session: Session) -> None:
        reply = Chat(db_session).say("cancel")
        assert reply["messages"][0]["text"] == "There's nothing to cancel."

    def test_asking_something_else_drops_the_flow(
        self, db_session: Session, bills: dict[str, int]
    ) -> None:
        chat = Chat(db_session)
        card = confirm_card(chat.say("I paid rent"))
        assert chat.say("what's my net worth?")["messages"][0]["label"] == "Net worth"
        assert chat.click(card["confirmAction"])["messages"][0]["code"] == "expired"

    def test_clicking_another_chip_drops_the_flow(
        self, db_session: Session, bills: dict[str, int]
    ) -> None:
        chat = Chat(db_session)
        card = confirm_card(chat.say("I paid rent"))
        chat.click({"type": "netWorth"})
        assert chat.click(card["confirmAction"])["messages"][0]["code"] == "expired"


class TestOnlyTheButtonConfirms:
    def test_typed_yes_shows_the_card_again(
        self, db_session: Session, bills: dict[str, int]
    ) -> None:
        chat = Chat(db_session)
        card = confirm_card(chat.say("I paid rent"))
        reply = chat.say("yes")
        assert reply["messages"][0]["text"] == "Tap Yes on the card to confirm."
        assert confirm_card(reply)["confirmAction"] == card["confirmAction"]
        assert due(db_session, bills["Rent"]) == date(2026, 11, 5)
        chat.click(card["confirmAction"])
        assert due(db_session, bills["Rent"]) == date(2026, 12, 5)

    def test_made_up_key(self, db_session: Session, bills: dict[str, int]) -> None:
        chat = Chat(db_session)
        chat.say("I paid rent")
        reply = chat.click({"type": "markBillPaid", "payload": {"confirm": "f" * 32}})
        assert reply["messages"][0] == {
            "type": "error",
            "code": "expired",
            "message": "That confirmation is no longer valid, so nothing was changed.",
        }
        assert due(db_session, bills["Rent"]) == date(2026, 11, 5)

    def test_the_bill_comes_from_the_session_not_the_button(
        self, db_session: Session, bills: dict[str, int]
    ) -> None:
        chat = Chat(db_session)
        key = confirm_card(chat.say("I paid rent"))["confirmAction"]["payload"][
            "confirm"
        ]
        chat.click(
            {
                "type": "markBillPaid",
                "payload": {"confirm": key, "billId": bills["Car insurance"]},
            }
        )
        assert due(db_session, bills["Rent"]) == date(2026, 12, 5)
        assert due(db_session, bills["Car insurance"]) == date(2026, 12, 20)

    def test_another_session_cannot_use_the_key(
        self, db_session: Session, bills: dict[str, int]
    ) -> None:
        card = confirm_card(Chat(db_session, "s-1").say("I paid rent"))
        other = Chat(db_session, "s-2")
        assert other.click(card["confirmAction"])["messages"][0]["code"] == "expired"

    def test_bill_deleted_before_yes(
        self, db_session: Session, bills: dict[str, int]
    ) -> None:
        chat = Chat(db_session)
        card = confirm_card(chat.say("I paid rent"))
        bill = db_session.get(RecurringExpense, bills["Rent"])
        db_session.delete(bill)
        db_session.commit()
        reply = chat.click(card["confirmAction"])
        assert reply["messages"][0]["message"] == f"No bill with id {bills['Rent']}."


class TestIdempotency:
    def test_double_click_marks_paid_once(
        self, db_session: Session, bills: dict[str, int]
    ) -> None:
        chat = Chat(db_session)
        card = confirm_card(chat.say("I paid rent"))
        first = chat.click(card["confirmAction"])
        second = chat.click(card["confirmAction"])
        assert first["messages"][0]["text"] == second["messages"][0]["text"]
        assert due(db_session, bills["Rent"]) == date(2026, 12, 5)  # not Jan 5

    def test_tool_runs_a_key_once(
        self, db_session: Session, bills: dict[str, int]
    ) -> None:
        registry = build_registry(OWNER)
        ctx = ToolContext(db_session, OWNER, TODAY)
        data = {"billId": bills["Rent"], "idempotencyKey": "key-0001"}
        a = registry.call("markBillPaid", data, ctx)
        b = registry.call("markBillPaid", data, ctx)
        assert a == b
        assert due(db_session, bills["Rent"]) == date(2026, 12, 5)
        registry.call("markBillPaid", {**data, "idempotencyKey": "key-0002"}, ctx)
        assert due(db_session, bills["Rent"]) == date(2027, 1, 5)

    @pytest.mark.parametrize("key", ["short", "has spaces!!", "x" * 65])
    def test_key_must_be_well_formed(
        self, db_session: Session, bills: dict[str, int], key: str
    ) -> None:
        with pytest.raises(ToolError, match="idempotencyKey"):
            build_registry(OWNER).call(
                "markBillPaid",
                {"billId": bills["Rent"], "idempotencyKey": key},
                ToolContext(db_session, OWNER, TODAY),
            )

    def test_write_tools_must_take_a_key(self) -> None:
        from app.schemas.chat_tools import NoInput
        from app.services.chat_tools import Tool, ToolRegistry

        with pytest.raises(ValueError, match="idempotency_key"):
            ToolRegistry(OWNER).register(
                Tool(
                    name="writer",
                    description="x",
                    input_model=NoInput,
                    output_model=NoInput,
                    handler=lambda _c, d: d,
                    writes=True,
                )
            )

    def test_simultaneous_calls_run_once(self) -> None:
        store = IdempotencyStore()
        runs: list[int] = []

        def slow() -> str:
            runs.append(1)
            time.sleep(0.05)
            return "done"

        results: list[str] = []
        threads = [
            threading.Thread(target=lambda: results.append(store.run(("k",), slow)))
            for _ in range(8)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert runs == [1]
        assert results == ["done"] * 8

    def test_a_failed_run_can_be_retried(self) -> None:
        store = IdempotencyStore()
        attempts: list[int] = []

        def flaky() -> str:
            attempts.append(1)
            if len(attempts) == 1:
                raise RuntimeError("db busy")
            return "ok"

        with pytest.raises(RuntimeError):
            store.run(("k",), flaky)
        assert store.run(("k",), flaky) == "ok"
        assert store.run(("k",), flaky) == "ok"
        assert len(attempts) == 2

    def test_keys_are_scoped_per_user(
        self, db_session: Session, bills: dict[str, int]
    ) -> None:
        registry = build_registry(OWNER)
        with pytest.raises(Exception, match="Not allowed"):
            registry.call(
                "markBillPaid",
                {"billId": bills["Rent"], "idempotencyKey": "key-0001"},
                ToolContext(db_session, "someone-else", TODAY),
            )
        assert due(db_session, bills["Rent"]) == date(2026, 11, 5)
