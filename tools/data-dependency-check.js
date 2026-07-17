const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function extractScripts(html) {
  return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1].replace(/^\s*import\s+.*?;\s*$/gm, ""))
    .join("\n");
}

function extractFunction(source, name) {
  const needle = `function ${name}`;
  const start = source.indexOf(needle);
  if (start === -1) return "";
  const paramsStart = source.indexOf("(", start);
  if (paramsStart === -1) return "";
  let parenDepth = 0;
  let braceStart = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (parenDepth === 0) {
      braceStart = source.indexOf("{", index);
      break;
    }
  }
  if (braceStart === -1) return "";
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  return "";
}

function runDataDependencyCheck() {
  const errors = [];
  const manager = read("manager.html");
  const scripts = extractScripts(manager);

  function assert(condition, message) {
    if (!condition) errors.push(message);
  }

  const saveTodayCashField = extractFunction(scripts, "saveTodayCashField");
  const saveCashflowField = extractFunction(scripts, "saveCashflowField");
  const actualRowFor = extractFunction(scripts, "actualRowFor");
  const renderPayroll = extractFunction(scripts, "renderPayroll");
  const staffPeriodTotals = extractFunction(scripts, "staffPeriodTotals");
  const renderSummary = extractFunction(scripts, "renderSummary");
  const renderCashflowAnalytics = extractFunction(scripts, "renderCashflowAnalytics");
  const cashflowReportText = extractFunction(scripts, "cashflowReportText");
  const cashflowTotalsForDay = extractFunction(scripts, "cashflowTotalsForDay");
  const payrollCashPaidForDate = extractFunction(scripts, "payrollCashPaidForDate");
  const terminalAmountForDay = extractFunction(scripts, "terminalAmountForDay");
  const syncApprovedScheduleActualsToLedger = extractFunction(scripts, "syncApprovedScheduleActualsToLedger");
  const syncApprovedSchedulePaymentsToLedger = extractFunction(scripts, "syncApprovedSchedulePaymentsToLedger");
  const syncLegacyCashflowToLedger = extractFunction(scripts, "syncLegacyCashflowToLedger");

  assert(!manager.includes('type="number"'), "Money/rate inputs must not use type=number; decimal entry must be locale-safe.");
  assert(scripts.includes("function normalizeDecimalText"), "Decimal parsing must be centralized.");
  assert(saveTodayCashField.includes("syncLedgerCashflowField"), "Day cash/terminal input must sync through ledger.");
  assert(saveCashflowField.includes("syncLedgerCashflowField"), "Cashflow input must sync through ledger.");
  assert(actualRowFor.includes("syncActualShiftToLedger"), "Approved actual hours must create/update ledger shift records.");

  assert(renderPayroll.includes("ledgerPaymentTotalsForStaffWeek"), "Payroll screen must derive approved paid totals from ledger allocations.");
  assert(staffPeriodTotals.includes("ledgerPaymentTotalsForStaffWeek"), "History/Summary staff totals must derive paid totals from ledger allocations.");
  assert(!renderPayroll.includes("approvedCashPaid = ledgerTotals.cash ||"), "Payroll must not fall back to legacy approvedCashPaid for approved totals.");
  assert(!staffPeriodTotals.includes("payroll.approvedCashPaid"), "Summary/history must not read legacy payroll.approvedCashPaid for approved totals.");
  assert(!staffPeriodTotals.includes("payroll.approvedTransferPaid"), "Summary/history must not read legacy payroll.approvedTransferPaid for approved totals.");

  assert(renderSummary.includes("cashflowDayView"), "Summary money rows must use ledger-first cashflow day view.");
  assert(renderCashflowAnalytics.includes("cashflowDayView"), "Cashflow analytics must use ledger-first cashflow day view.");
  assert(cashflowReportText.includes("cashflowDayView"), "Copied cashflow report must use ledger-first cashflow day view.");
  assert(cashflowTotalsForDay.includes("payrollCashPaidForDate"), "Cashflow totals must read staff payouts through the shared helper.");
  assert(payrollCashPaidForDate.includes("ledgerCashPaidForDate"), "Staff payout helper must read ledger payments by paidOn date.");
  assert(!payrollCashPaidForDate.includes("schedule.payroll"), "Staff payout helper must not fall back to legacy schedule.payroll.");
  assert(terminalAmountForDay.includes("LedgerModel.terminalForDate"), "Terminal totals must prefer ledger terminal reports.");
  assert(syncApprovedScheduleActualsToLedger.includes("schedule.roster"), "Legacy approved actuals bridge must read stale schedule.roster rows.");
  assert(syncApprovedScheduleActualsToLedger.includes("ledgerShiftEquivalentExists"), "Legacy approved actuals bridge must dedupe equivalent shift records.");
  assert(syncApprovedSchedulePaymentsToLedger.includes("schedule.payroll"), "Legacy payroll bridge must read stale schedule.payroll rows.");
  assert(syncApprovedSchedulePaymentsToLedger.includes("ledgerPaymentEquivalentExists"), "Legacy payroll bridge must dedupe equivalent payment records.");
  assert(syncLegacyCashflowToLedger.includes("schedule.cashflow"), "Legacy cashflow bridge must read stale schedule.cashflow rows.");
  assert(syncLegacyCashflowToLedger.includes("ledgerCashflowEquivalentExists"), "Legacy cashflow bridge must dedupe equivalent cashflow records.");
  assert(scripts.includes("const legacyActualHoursLedgerSyncApplied = syncApprovedScheduleActualsToLedger();"), "Startup must run approved actuals bridge.");
  assert(scripts.includes("const legacyPayrollPaymentsLedgerSyncApplied = syncApprovedSchedulePaymentsToLedger();"), "Startup must run payroll payments bridge.");
  assert(scripts.includes("const legacyCashflowLedgerSyncApplied = syncLegacyCashflowToLedger();"), "Startup must run cashflow bridge.");
  assert(scripts.includes("legacyActualHoursLedgerSyncApplied || legacyPayrollPaymentsLedgerSyncApplied || legacyCashflowLedgerSyncApplied"), "Startup must save state when any legacy bridge writes data.");

  return errors;
}

if (require.main === module) {
  const errors = runDataDependencyCheck();
  if (errors.length) {
    console.error("Data dependency check failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log("Data dependency check passed:");
  console.log("- inputs write to ledger");
  console.log("- payroll/cashflow/summary read ledger-first");
  console.log("- legacy payroll approved totals are not release sources");
}

module.exports = { runDataDependencyCheck };



