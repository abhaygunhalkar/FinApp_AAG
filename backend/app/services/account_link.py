"""Shared logic for linking bills and income to Net Worth accounts.

A record either links to an account by ID (its label then always shows the
account's current name) or, with no link, keeps a free-text label: one typed
before linking existed, or the name of an account that was since deleted.
"""

from typing import Any

from sqlalchemy.orm import Session

from app.repositories.financial_account_repository import FinancialAccountRepository
from app.services.financial_account_service import FinancialAccountService


def clean_text(value: str | None) -> str | None:
    """Trim optional text and store blanks as NULL."""
    if value is None:
        return None
    value = value.strip()
    return value or None


def validate_account(db: Session, account_id: int, allowed_types: set[str]) -> int:
    """Return `account_id` if it names an existing account of an allowed type.

    Raises:
        ValueError: If the account doesn't exist or can't be used here.
    """
    account = FinancialAccountRepository.get_by_id(db, account_id)
    if account is None:
        raise ValueError(f"Account {account_id} not found")
    if account.account_type not in allowed_types:
        raise ValueError(
            f"'{account.name}' is a {account.account_type.replace('_', ' ')} account "
            "and can't be used here"
        )
    return account_id


def link_from_create(
    db: Session, account_id: int | None, text: str | None, allowed_types: set[str]
) -> tuple[int | None, str | None]:
    """(account_id, text) to store for a new record: a link wins over text."""
    if account_id is not None:
        return validate_account(db, account_id, allowed_types), None
    return None, clean_text(text)


def link_from_update(
    db: Session,
    fields: dict[str, Any],
    id_key: str,
    text_key: str,
    current: tuple[int | None, str | None],
    allowed_types: set[str],
) -> tuple[int | None, str | None]:
    """(account_id, text) after an update that may send either field.

    Sending an account ID links it (and drops the text); sending a null ID
    unlinks, keeping any text sent with it; sending only text replaces the link.
    """
    if id_key in fields:
        if fields[id_key] is not None:
            return validate_account(db, fields[id_key], allowed_types), None
        return None, clean_text(fields.get(text_key))
    if text_key in fields:
        return None, clean_text(fields[text_key])
    return current


def account_labels(db: Session) -> dict[int, str]:
    """Current label of every account, keyed by ID."""
    return {
        a.id: FinancialAccountService.label(a)
        for a in FinancialAccountRepository.get_all(db)
    }


def display_label(
    db: Session,
    account_id: int | None,
    text: str | None,
    labels: dict[int, str] | None = None,
) -> str | None:
    """The label to show: the linked account's current name, else the stored text."""
    if account_id is None:
        return text
    if labels is not None:
        return labels.get(account_id, text)
    account = FinancialAccountRepository.get_by_id(db, account_id)
    return FinancialAccountService.label(account) if account else text
