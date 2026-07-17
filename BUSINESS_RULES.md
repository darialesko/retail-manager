# Retail Shop Business Rules

This file is the current product contract for money, hours, payroll, and cash
flow. Code changes must preserve these rules unless Owner explicitly changes
the business meaning.

## Core Data Rules

- Approved actual hours are the only hours that count into payroll.
- Planned shifts are visible in roster views but must not affect payroll debt.
- A payroll week runs Monday through Sunday.
- A payment date is the physical cash or transfer movement date.
- A payroll allocation period is the week the payment belongs to.
- The payment date and payroll allocation period may be different.
- Cross-period payments must be explicit. They must not silently reduce the
  wrong week.

## Payroll Rules

- `earned = approved actual hours * staff hourly rate`.
- `paid` is the sum of approved payments allocated to that payroll week.
- `to pay = earned - paid` for that staff member and week.
- The app may show `to pay` as positive debt; overpayments or cross-period
  settlements must be labeled explicitly rather than hidden.
- Future planned shifts must never become approved actuals through a generic
  migration or UI refresh.
- Startup repairs must add missing confirmed data only when the actual rows or
  payments are absent or wrong. A guard flag alone is not proof that data exists.

## Cash Flow Rules

- Cash flow is physical money movement.
- Payroll is staff entitlement by payroll period.
- Cash paid to staff can affect both cash flow and payroll, but the two meanings
  must remain separate.
- Terminal amount means amount collected, not net sales.
- A next-morning previous terminal report belongs to the previous business day.
- External cash withdrawals are physical cash movements but are not operational
  sales.
- Untracked till adjustments must be recorded as adjustments and not counted as
  sales unless explicitly confirmed.

## Audit Rules

- Every money or hour number shown in a summary should be explainable from
  source records: shift, payment, cash movement, or terminal report.
- The app should prefer append-only ledger records for new facts.
- After a structural data change, release is blocked unless
  `tools/data-dependency-check.js` and `tools/regression-check.js` both pass.
- Migration bridge code must have an automated parity test. The test must run
  the real bridge functions against stale legacy state, prove that ledger totals
  match legacy hours/payments/cash/terminal facts, and prove that a second run
  does not create duplicates.
- Active manager views must read approved hours, approved payments, cash
  movements, and terminal totals from ledger-first derivations. Legacy schedule
  fields are allowed only for drafts, form state, and guarded baseline
  recovery.
- Legacy repair functions are allowed only to recover confirmed baseline
  data and must be protected by regression checks.
- If UI totals and arithmetic look inconsistent, the audit view must help show
  whether the difference comes from week allocation, cross-period payment, or
  missing actual approvals.

## Protected Current Facts

- Week `2026-01-05`:
  - Owner: `61h`, earned `$1220`, paid `$1220`, to pay `$0`.
  - Staff A: `23h`, earned `$460`, paid `$460`, to pay `$0`.
  - Staff B: `29h`, earned `$580`, paid `$0`, to pay `$580`.
- Week `2026-01-12`:
  - Owner: protected current-week approved baseline remains regression-guarded.
  - Staff A and Staff B current-week payroll debt must stay guarded.
- Summary can include previous weeks when the selected period includes them.
- The active management app is `manager.html`; old payroll/roster/cashflow pages
  are redirect stubs.



