"""Create the app's sign-in account, or reset its password. Run on the server.

There is no sign-up page: this script is the only way to make the account.

Usage (from backend/, with the venv active):
    python scripts/create_owner.py            # one-time: choose username + password
    python scripts/create_owner.py --reset    # forgot password: set a new one
    python scripts/create_owner.py --unlock   # clear a lockout after failed sign-ins

--reset also signs out every browser. Uses DATABASE_URL like the app does.
"""

import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal, verify_database  # noqa: E402
from app.repositories.owner_repository import OwnerRepository  # noqa: E402
from app.services.auth_service import AuthService  # noqa: E402
from app.services.passwords import (  # noqa: E402
    MIN_LENGTH,
    password_problem,
    username_problem,
)


def _ask_username() -> str:
    while True:
        username = input("Username: ").strip()
        problem = username_problem(username)
        if problem is None:
            return username
        print(problem)


def _ask_password(username: str) -> str:
    while True:
        first = getpass.getpass(f"Password (at least {MIN_LENGTH} characters): ")
        problem = password_problem(first, username)
        if problem:
            print(problem)
        elif getpass.getpass("Repeat password: ") != first:
            print("The passwords don't match. Try again.")
        else:
            return first


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--reset", action="store_true", help="set a new password")
    group.add_argument("--unlock", action="store_true", help="clear a lockout")
    args = parser.parse_args()

    verify_database()
    db = SessionLocal()
    try:
        if args.unlock:
            AuthService.unlock(db)
            print("Sign-in unlocked.")
        elif args.reset:
            existing = OwnerRepository.get(db)
            if existing is None:
                raise ValueError("No owner account yet. Run without --reset first.")
            print(f"Setting a new password for {existing.username}.")
            owner = AuthService.reset_password(db, _ask_password(existing.username))
            print(f"Password changed for {owner.username}. All browsers signed out.")
        else:
            if OwnerRepository.get(db) is not None:
                raise ValueError("An owner account already exists. Use --reset.")
            username = _ask_username()
            owner = AuthService.create_owner(db, username, _ask_password(username))
            print(f"Created {owner.username}. Sign in at the app's address.")
    except ValueError as exc:
        print(f"Not done: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
