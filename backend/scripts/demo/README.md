# Demo data (not for real use)

Everything in this folder is for **demos only**. It builds a separate SQLite
database full of made-up data so every page of the app can be shown without
revealing real finances.

- It never reads or writes your real database. The script refuses to write to
  any file whose name doesn't contain `demo`.
- Holdings, trades, options, accounts, bills and income are fictional. Most
  institution names are too ("Harbor Bank"), but a second checking account and
  four credit cards use real bank names (Chase, American Express, Capital One)
  with made-up balances, so card issuer logos can be tested.
- Stock prices are real one-year closes from Yahoo Finance, so gains and charts
  look natural. The script needs internet access.
- The earnings calendar is pre-filled for the next 30 days, so it works without
  a Finnhub key. After 30 days, run the script again.

## Use it

From `backend/`:

```bash
source venv/bin/activate
python scripts/demo/seed_demo_data.py          # creates ./finance_demo.db (replaces an old one)

# Run the app against the demo database instead of your real one
DATABASE_URL=sqlite:///./finance_demo.db uvicorn app.main:app --port 8000
```

Then start the frontend as usual (`cd frontend && npm run dev`).

To go back to your own data, restart the backend without `DATABASE_URL=...`
(it then uses the database in `backend/.env`).

`*.db` files are git-ignored, so the demo database itself is never committed.
