# Ledger Data Model Specification

Target app: Retail Shift Cashflow Tracker â€” manager module
Spec version: 1.0, 2026-01-21
Status: pre-implementation contract. No UI work should begin against a model that does not satisfy this spec.

## 1. Principles

1. **Append-only ledger.** Every money or hours fact is an immutable event record. Nothing overwrites totals. Corrections are new events that reference the event they correct.
2. **Derived totals.** Earned, paid, to-pay, expected cash, daily cash sales, weekly terminal â€” all computed at render time from ledger events. No stored total is ever authoritative.
3. **Two dates on every payment.** `paidOn` (physical cash movement) and `forWeekStart` (payroll allocation period) are separate required fields. The UI always shows both.
4. **Status machine for shifts.** A shift moves forward through explicit states. Automated code (migrations, repairs, imports) may never move a shift backward.
5. **One fact, two projections.** A staff payout is a single event. Payroll reads it via `forWeekStart`; cashflow reads it via `paidOn`. It is never stored twice.

## 2. Storage layout

localStorage key: `retailShiftCashflowTrackerPublicDemoV2`.

```json
{
  "schemaVersion": 2,
  "ledger": {
    "shifts":        [ ShiftRecord ],
    "payments":      [ PaymentRecord ],
    "cashMovements": [ CashMovementRecord ],
    "terminalReports": [ TerminalReportRecord ]
  },
  "staff":      { "<staffId>": { "name": "...", "rate": 20 } },
  "repairs":    [ RepairRecord ],
  "guards":     { "<flagName>": "<isoDateTime>" },
  "meta":       { "lastBackupAt": "...", "appVersion": "..." }
}
```

`guards` carries the existing migration flags (`journalData20260115v1`, `rosterCorrection20260115v2`, `financeLedger20260115v1`, `payrollActualsCorrection20260115v1`, `staff_aPayrollCorrection20260115v1`, `ownerPayrollCorrection20260115v1`). `loadState`/`saveState` must round-trip `guards` and `repairs` verbatim. A guard dropped on load is treated as data corruption: abort save, surface error.

## 3. Entities

### 3.1 ShiftRecord

```json
{
  "id": "shift_20260115_owner",
  "staffId": "owner",
  "date": "2026-01-15",
  "plannedStart": "07:30",
  "plannedEnd": "17:30",
  "actualStart": "07:30",
  "actualEnd": "17:30",
  "hours": 10,
  "status": "approved",
  "approvedAt": "2026-01-15T18:02:00+10:00",
  "approvedBy": "user",
  "sourceRef": "chat:20260115-evening"
}
```

Status machine:

```
planned â†’ worked_pending â†’ approved â†’ locked
```

- `planned`: on the roster, contributes 0 to payroll.
- `worked_pending`: actual start/end entered, awaiting user approval. Contributes 0 to payroll.
- `approved`: user-confirmed actuals. Counted in earned. Editable only after an explicit user "unapprove" action, which is itself logged as a repair.
- `locked`: period closed/exported. Immutable without a versioned repair.

Hard rule: only the user can set `approved`. Migrations may create `planned`/`worked_pending` records or add `approved` records explicitly listed in a versioned repair; they may never change an existing record's status in any direction.

### 3.2 PaymentRecord

```json
{
  "id": "pay_20260112_staff_a_320",
  "staffId": "staff_a",
  "amount": 320,
  "paidOn": "2026-01-12",
  "allocation": [
    { "forWeekStart": "2026-01-05", "amount": 110 },
    { "forWeekStart": "prior-settlement", "amount": 210 }
  ],
  "method": "cash",
  "cashMovementId": "cm_20260112_payout_staff_a",
  "sourceRef": "screenshot:20260112-chat",
  "note": "Includes prior-period settlement"
}
```

- `allocation` is an array so one physical payment can settle multiple payroll weeks (Staff A case). Sum of allocation amounts must equal `amount`.
- `paidOn` defaults to today and is always an explicit draft field in the UI. It never inherits the previous approved payment's date.
- If the payment moved physical cash from the till, `cashMovementId` links to the corresponding CashMovementRecord (see 3.3). Bank transfers have `method: "transfer"` and no cash movement.

### 3.3 CashMovementRecord

```json
{
  "id": "cm_20260113_withdrawal",
  "date": "2026-01-13",
  "type": "external_withdrawal",
  "amount": 580,
  "direction": "out",
  "note": "External withdrawal after left balance, not operational sales",
  "sourceRef": "chat:20260113"
}
```

`type` enum:

| type | direction | counts toward cash sales? |
|---|---|---|
| `opening_count` | snapshot | baseline |
| `checkpoint_count` (after-shift) | snapshot | latest-known cash |
| `closing_count` | snapshot | end of day |
| `staff_payout` | out | added back when deriving sales |
| `external_withdrawal` | out | excluded from sales |
| `adjustment` | in/out | excluded from sales |

Snapshots record the counted amount at a checkpoint; flows record money entering/leaving for a reason. Derivations use both (see 4.2).

### 3.4 TerminalReportRecord

```json
{
  "id": "term_20260115_for_20260114",
  "forDate": "2026-01-14",
  "reportedOn": "2026-01-15",
  "kind": "closing",
  "amount": 2034.00,
  "evidence": "photo:20260115-morning",
  "sourceRef": "morning-check"
}
```

- `kind`: `after_shift` | `closing`.
- The morning "Previous terminal total" is stored with `forDate = yesterday`, `reportedOn = today`. Daily and weekly terminal totals are keyed by `forDate`, which makes roll-back automatic rather than a special case.
- Latest-known rule: a day's terminal figure = its `closing` report if present, else its `after_shift` report, else pending. Never render a filled `after_shift` as $0.

### 3.5 RepairRecord

```json
{
  "id": "repair_20260115_staff_a_payroll_v1",
  "guardFlag": "staff_aPayrollCorrection20260115v1",
  "appliedAt": "2026-01-15T12:51:00+10:00",
  "description": "Split 2026-01-12 $320 into $110 prior-week allocation + $210 settlement",
  "affects": ["pay_20260112_staff_a_320"],
  "before": { "...snapshot of affected records..." },
  "after":  { "...snapshot of affected records..." }
}
```

Every migration/import/repair produces one RepairRecord with before/after snapshots. This is the user-visible audit log. A repair without a `guardFlag` must not run.

## 4. Derivation rules

### 4.1 Payroll (per staff, per week)

```
approvedHours(staff, week) = Î£ hours of shifts with status âˆˆ {approved, locked}
                              and date âˆˆ week
earned      = approvedHours Ã— staff.rate
paidForWeek = Î£ allocation.amount over all payments
              where allocation.forWeekStart == week.start
toPay       = earned âˆ’ paidForWeek
```

- `paidOn` plays no role in payroll math. A payment paid 2026-01-12 allocated to week 2026-01-05 reduces that week's debt and only that week's.
- If `paidForWeek > earned`, render an audit warning; block silent save unless an allocation row is explicitly marked as a cross-period adjustment.

### 4.2 Cash sales (per day)

```
knownCashSales(day) = latestKnownCount(day)
                    âˆ’ openingCount(day)
                    + Î£ staff_payout(day)
                    + Î£ external_withdrawal(day)
                    Â± Î£ adjustment(day, sign-corrected)
```

where `latestKnownCount` = closing_count if present, else checkpoint_count, else derivation returns `pending` â€” never a fabricated 0, and never extended past the last known checkpoint (the 2026-01-13 rule: evening unknown â†’ count only through the $580 checkpoint).

### 4.3 Day status flags

A day is `incomplete` if any of: no opening_count, no closing_count, no terminal report (closing or after_shift), any shift still `worked_pending`. Incomplete days surface on the Today screen and in Summary as "days requiring review".

## 5. Invariants â†’ bugs made structurally impossible

| Historical bug | Model property that removes it |
|---|---|
| Startup repair resets approved hours | Status machine is forward-only for automated writers; repairs require guardFlag + before/after snapshot |
| Morning terminal not rolling back to previous day | TerminalReport keyed by `forDate`, not entry date |
| Report Period filters history but not money summary | Both views derive from the same ledger arrays through one period predicate |
| New payment reuses previous payment date | `paidOn` is a required explicit draft field, no inherited default |
| Prior-period payment disappears | Payment lives once; allocation array binds it to its week regardless of `paidOn` |
| Page copies drift | Not a data issue â€” removed by single-entry SPA (out of scope for this spec) |

## 6. Regression fixtures

The regression gate must assert derived values, not file contents:

```
Week 2026-01-05..2026-01-11:
  owner:    32.5h, earned 650, paid 650, toPay 0
  staff_a: 12.5h, earned 250, paid 250, toPay 0   // includes $110 of the 07-06 $320
  staff_b:  19.5h, earned 390, paid 0,   toPay 390

Week 2026-01-12..2026-01-18 (as of 2026-01-15):
  owner:    37.5h, earned 750, paid 550, toPay 200
  staff_a: 14.0h, earned 280, paid 130, toPay 150
  staff_b:   6.5h, earned 130, paid 0,   toPay 130

Cashflow:
  2026-01-12: cash 610,  terminal 1543.63
  2026-01-13: cash 340 (known-only), terminal 2242.77
  2026-01-14: cash 870,  terminal 2034.00, daily total 2904.00

Roster:
  2026-01-16, 2026-01-17 owner: status == planned (never approved by code)
```

## 7. Migration path from current state

1. Snapshot current localStorage to a dated backup entry (rule 8 of MONEY_AND_HOURS_RECONCILIATION_RULE applies).
2. One-time migration `ledgerModel_v2` (guarded): read existing schedule/payroll/cashflow objects, emit ShiftRecords, PaymentRecords (building `allocation` from the demo reconciliation tables), CashMovementRecords, TerminalReportRecords.
3. Run regression fixtures against the derived values. Mismatch â†’ abort, restore snapshot, report diff.
4. Write RepairRecord for the migration itself.
5. Renderers switch to derivation functions; legacy total fields are kept read-only for one version, then dropped.

## 8. Out of scope

UI layout, hash routing, module file split, service worker versioning. Covered by the architecture recommendations of 2026-01-21; this document is only the data contract they build on.



