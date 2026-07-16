# Money And Hours Reconciliation Rule

This project tracks money and human hours. Treat every payroll/cashflow import as high-risk accounting work.

Before changing app data, always build and check a reconciliation table first:

1. Source ledger
   - List every source item separately: chat note, screenshot, manual correction, existing app state.
   - Keep dates explicit.
   - Mark whether the item is shift hours, payroll payment, cash sale, terminal amount, cash adjustment, or external withdrawal.

2. Payroll period boundaries
   - A payment stored inside a week must belong to that week's earned hours.
   - Payments for another period must not be stored in the current week's payroll just because they were paid during the current week.
   - Prior-period payments can appear in cashflow notes/manual staff cash paid, but not as current-week payroll paid.
   - Payment date is a cash movement date, not the payroll allocation date. If a payment is stored in a staff/week payroll record, payroll debt for that week must count it even when the cash was physically paid on the next week.

3. No silent upserts
   - Do not append imported payroll payments into existing localStorage records without first removing or reconciling old records.
   - For canonical recovery/imports, overwrite the staff member's payment list for that week with the confirmed canonical list.

4. Earned vs paid audit
   - For each staff member and week, calculate:
     - approved actual hours
     - earned = approved actual hours * rate
     - approved payments for that same payroll period
     - to pay = earned - approved payments
   - If approved payments exceed earned, stop and explain the mismatch unless the excess is explicitly marked as a cross-period adjustment.

5. Actual hours rule
   - Planned future shifts must never be marked as approved actuals.
   - Payroll must count only shifts with actualApproved = true.
   - Future roster entries can exist, but they must remain planned until confirmed.
   - Startup repairs, imports, and migrations must never downgrade an existing user approval. They may add confirmed approvals, but they must not set actualApproved to false or delete approvedDays for dates outside the explicitly corrected source range.

6. Cashflow rule
   - Cashflow can record real cash movement even when it is not current-period payroll.
   - External withdrawals and untracked till adjustments must be explicit notes/adjustments, not sales.

7. Final check before saying done
   - Print the expected totals for every affected staff member and day.
   - Confirm the app state matches those totals.
   - Bump the service worker cache after code/data migrations.

8. Mandatory daily backup rule
   - The app must create and refresh an automatic daily backup without relying on the user to remember a button.
   - Daily backups must be stored separately from the main state so a bad app write is not the only copy of the data.
   - Keep enough retention to recover from mistakes discovered later; do not remove this rule during UI or data migrations.

9. Migration guard persistence rule
   - loadState/saveState must preserve top-level guard flags and migration-complete flags.
   - A migration guard that is dropped during load is the same as no guard at all and can repeatedly overwrite user-approved data.
   - Legacy one-time migrations must not run over an existing working journal/payroll/cashflow dataset.

10. Schedule-scoped rendering rule
   - History and summary views must read cashflow/payroll from the schedule object they are rendering, not from global currentSchedule helpers.
   - After cashflow input changes, rerender all dependent summaries immediately so the visible totals cannot stay stale.
   - Cashflow analytics must use the latest known terminal amount for the day: closing terminal first, then after-shift terminal as fallback. A filled after-shift terminal must not render as a false $0 terminal.
   - A morning `Previous terminal total` entered on the next day is the checked terminal report for the previous day and must roll back into that previous day's terminal total and weekly terminal total.
   - For incomplete cash days, a filled after-shift cash count is the latest known cash amount and must not render as a false $0 cash line just because closing cash is not entered yet.

11. Regression gate rule
   - Before any change is called done, run `tools/regression-check.js` with Node.
   - A new feature must not change the stable contracts for cashflow, payroll, history, or summary unless the user explicitly approves the contract change first.
   - Report Period filters must narrow both Period History and the money summary/movement rows while preserving the established columns.
   - A new payroll payment date must be a separate explicit draft value. Do not reuse the last approved payment date as the default for a new payment.
   - The five app entry pages must stay synchronized unless the user explicitly asks for separate page implementations.



