"""Pull the details a tool needs out of a message: a time window, an account.

Plain regex and difflib; no date or fuzzy-search packages are needed for the
two tools that exist.
"""

import calendar
import re
from dataclasses import dataclass
from datetime import date, timedelta
from difflib import SequenceMatcher

MAX_DAYS = 60  # getUpcomingBills looks at most this far ahead

WORD_NUMBERS = {"a": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6}


@dataclass(frozen=True)
class Window:
    days: int
    # True when the user asked for more than MAX_DAYS.
    capped: bool = False


def _window(days: int) -> Window:
    return Window(min(max(days, 1), MAX_DAYS), capped=days > MAX_DAYS)


def _end_of_month(d: date) -> date:
    return d.replace(day=calendar.monthrange(d.year, d.month)[1])


def extract_window(text: str, today: date) -> Window | None:
    """A look-ahead from today, e.g. "this week" or "next 10 days"."""
    t = text.lower()
    if re.search(r"\b(today|tomorrow)\b", t):
        return _window(1)
    if re.search(r"\bthis week\b", t):
        return _window(6 - today.weekday())  # through Sunday
    if re.search(r"\bnext week\b", t):
        return _window(13 - today.weekday())  # through next Sunday
    if re.search(r"\bthis month\b", t):
        return _window((_end_of_month(today) - today).days)
    if re.search(r"\bnext month\b", t):
        next_month = _end_of_month(today) + timedelta(days=1)
        return _window((_end_of_month(next_month) - today).days)
    m = re.search(
        r"\b(\d{1,3}|" + "|".join(WORD_NUMBERS) + r")\s+(day|week|month)s?\b", t
    )
    if m:
        n = int(m.group(1)) if m.group(1).isdigit() else WORD_NUMBERS[m.group(1)]
        per = {"day": 1, "week": 7, "month": 30}[m.group(2)]
        return _window(n * per)
    return None


@dataclass(frozen=True)
class AccountRef:
    id: int
    name: str
    institution: str | None
    type: str

    @property
    def label(self) -> str:
        """As the app names it: "Name (Institution)"."""
        return f"{self.name} ({self.institution})" if self.institution else self.name


# Words that say what's being asked, not which account.
STOP_WORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "are",
        "about",
        "account",
        "accounts",
        "balance",
        "balances",
        "do",
        "does",
        "have",
        "how",
        "i",
        "in",
        "is",
        "it",
        "left",
        "me",
        "much",
        "my",
        "of",
        "on",
        "owe",
        "s",
        "show",
        "the",
        "to",
        "what",
        "whats",
        "with",
    }
)

TYPE_WORDS = {
    "checking": "checking",
    "savings": "savings",
    "credit card": "credit_card",
    "mortgage": "mortgage",
    "loan": "loan",
}

THRESHOLD = 0.8


def _tokens(text: str) -> list[str]:
    words = re.findall(r"[a-z0-9]+", text.lower().replace("'", ""))
    return [w for w in words if w not in STOP_WORDS]


def _best(tokens: list[str], phrase: str) -> float:
    """How closely any run of the message's words matches `phrase`, 0–1."""
    words = phrase.lower().split()
    n = len(words)
    best = 0.0
    for i in range(len(tokens) - n + 1):
        window = " ".join(tokens[i : i + n])
        best = max(best, SequenceMatcher(None, window, " ".join(words)).ratio())
    return best


def match_accounts(text: str, accounts: list[AccountRef]) -> list[AccountRef]:
    """The user's accounts the message names, best first.

    Typos are tolerated ("chse" finds Chase). Several results mean the message
    is ambiguous ("chase" with two Chase accounts); none means no account named.
    """
    tokens = _tokens(text)
    if not tokens:
        return []
    scores: dict[int, float] = {}
    for a in accounts:
        phrases = [a.name, *(w for w in a.name.split() if len(w) >= 4)]
        if a.institution:
            phrases += [a.institution, f"{a.institution} {a.name}"]
        phrases += [word for word, kind in TYPE_WORDS.items() if kind == a.type]
        scores[a.id] = max(_best(tokens, p) for p in phrases)
    top = max(scores.values(), default=0.0)
    if top < THRESHOLD:
        return []
    return [a for a in accounts if scores[a.id] >= top - 0.05]
