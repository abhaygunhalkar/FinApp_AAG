"""Create the app's sign-in account, or reset its password. Run on the server.

There is no sign-up page: this script is the only way to make the account.

Usage (from backend/, with the venv active):
    python scripts/create_owner.py            # one-time: choose username + password
    python scripts/create_owner.py --reset    # forgot password: set a new one
    python scripts/create_owner.py --unlock   # clear a lockout after failed sign-ins
    python scripts/create_owner.py --enable-2fa     # turn on authenticator codes
    python scripts/create_owner.py --disable-2fa    # lost your phone: turn them off
    python scripts/create_owner.py --backup-codes   # new backup codes (old ones stop)

--reset and --enable-2fa also sign out every browser. Uses DATABASE_URL like
the app does.
"""

import argparse
import getpass
import sys
from pathlib import Path

from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal, verify_database  # noqa: E402
from app.repositories.owner_repository import OwnerRepository  # noqa: E402
from app.services import totp  # noqa: E402
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


def _print_backup_codes(codes: list[str]) -> None:
    print("\nBackup codes. Each works once, in place of an authenticator code.")
    print(
        "Save them somewhere safe now (a password manager); "
        "they won't be shown again:\n"
    )
    for code in codes:
        print(f"    {code}")
    print()


def _enable_two_step(db: Session) -> None:
    owner = OwnerRepository.get(db)
    if owner is None:
        raise ValueError("No owner account yet. Run without options first.")
    if (
        owner.totp_secret
        and input("Two-step sign-in is already on. Replace it with a new key? [y/N] ")
        .strip()
        .lower()
        != "y"
    ):
        print("Nothing changed.")
        return
    secret = totp.new_secret()
    print("\nIn your authenticator app (Google Authenticator, 1Password, ...),")
    print("add an account with 'Enter a setup key', time-based:\n")
    print(f"    Account: {totp.ISSUER} ({owner.username})")
    print(f"    Key:     {totp.setup_key(secret)}\n")
    print("Or paste this link into an app that accepts one:")
    print(f"    {totp.otpauth_uri(secret, owner.username)}\n")
    for _attempt in range(3):
        code = input("Type the 6-digit code the app shows: ")
        try:
            codes = AuthService.enable_two_step(db, secret, code)
        except ValueError as exc:
            print(exc)
            continue
        print("\nTwo-step sign-in is on. Every browser has been signed out.")
        _print_backup_codes(codes)
        return
    raise ValueError("Two-step sign-in was not turned on. Run the command again.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--reset", action="store_true", help="set a new password")
    group.add_argument("--unlock", action="store_true", help="clear a lockout")
    group.add_argument(
        "--enable-2fa", action="store_true", help="turn on authenticator codes"
    )
    group.add_argument(
        "--disable-2fa", action="store_true", help="turn off authenticator codes"
    )
    group.add_argument(
        "--backup-codes", action="store_true", help="replace the backup codes"
    )
    args = parser.parse_args()

    verify_database()
    db = SessionLocal()
    try:
        if args.enable_2fa:
            _enable_two_step(db)
        elif args.disable_2fa:
            AuthService.disable_two_step(db)
            print("Two-step sign-in is off: the password alone signs in.")
        elif args.backup_codes:
            _print_backup_codes(AuthService.new_backup_codes(db))
        elif args.unlock:
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
