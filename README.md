# Retail Shift Cashflow Tracker

Local-first retail operations tracker for small shops that need to manage:

- daily cash and terminal checkpoints;
- rostered and approved actual hours;
- payroll payouts by allocation week;
- cash movements after staff payments;
- weekly summary reporting;
- audit evidence for every money and hours total.

The app is intentionally simple: static HTML, CSS, and JavaScript with no build
step and no backend. It can run from `file://` or as a small offline-capable PWA.

## Why This Exists

Small retail teams often track roster, cash, terminal totals, and staff payouts
in separate chats or spreadsheets. That makes it easy for a payout or terminal
report to appear in one place but not another.

This project uses a ledger-first approach:

- inputs write source records to a local ledger;
- active views read ledger-derived values;
- regression checks protect payroll, cashflow, and dependency invariants;
- legacy schedule fields are allowed only for drafts, form state, or guarded
  recovery.

## Pages

- `index.html` - order helper with sample products.
- `staff.html` - staff availability page.
- `manager.html#/day` - daily manager workflow.
- `manager.html#/roster` - roster and actual hours.
- `manager.html#/payroll` - approved hours and payroll.
- `manager.html#/cashflow` - cash and terminal tracking.
- `manager.html#/summary` - weekly summary.
- `manager.html#/audit` - ledger evidence.

Redirect stubs (`roster.html`, `payroll.html`, `cashflow.html`,
`dashboard.html`, `audit.html`) point to the manager SPA routes.

## Data Model

The ledger contains four operational record types:

- shifts;
- payments;
- cash movements;
- terminal reports.

`ledger-model.js` provides pure derivation functions that can run in both the
browser and Node-based checks. `manager.html` keeps the no-build UI and routing.

## Checks

Use the bundled Node runtime if available, or any recent Node.js:

```powershell
node .\tools\privacy-scan.js
node .\tools\data-dependency-check.js
node .\tools\regression-check.js
```

Release rule: after structural changes, privacy scan, dependency check, and
regression check must pass before the app is considered releasable.

## Privacy

This public version uses synthetic names, sample products, fake phone numbers,
and sample ledger data. It does not include screenshots, private backups, chat
exports, or real shop journals.

## Running

Open `index.html` or `manager.html` directly in a browser. For service worker
testing, serve the folder over local HTTP.



