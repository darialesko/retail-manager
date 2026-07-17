const fs = require("fs");
const path = require("path");
const LedgerModel = require("../ledger-model.js");
const { runDataDependencyCheck } = require("./data-dependency-check.js");

const root = path.resolve(__dirname, "..");
const errors = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function fail(message) {
  errors.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function moneyEqual(actual, expected, message) {
  assert(Math.abs(Number(actual) - Number(expected)) < 0.005, `${message}: expected ${expected}, got ${actual}`);
}

function numberOrZero(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
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

function cacheVersion(source) {
  const match = source.match(/retail-shift-cashflow-tracker-v(\d+)/);
  return match ? Number(match[1]) : 0;
}

function byStaff(rows, staffId) {
  return rows.find((row) => row.staffId === staffId) || {};
}

function runLegacyBridgeParityFixture(inputState) {
  const sandbox = {
    state: JSON.parse(JSON.stringify(inputState)),
    LedgerModel,
    console,
    Date,
    setTimeout,
    clearTimeout
  };
  const prelude = `
    const state = sandbox.state;
    const LedgerModel = sandbox.LedgerModel;
    const closeTime = "00:00";
    const staff = [
      { id: "owner", name: "Owner", rate: 20 },
      { id: "staff_a", name: "Staff A", rate: 20 },
      { id: "staff_b", name: "Staff B", rate: 20 },
      { id: "staff_c", name: "Staff C", rate: 20 }
    ];
    function numberValue(value) {
      const parsed = Number(String(value ?? "").replace(",", "."));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    function hasNumberInput(value) {
      if (value === null || value === undefined || value === "") return false;
      return Number.isFinite(Number(String(value).replace(",", ".")));
    }
    function isoDate(date) {
      const value = date instanceof Date ? date : new Date(date);
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, "0");
      const d = String(value.getDate()).padStart(2, "0");
      return \`\${y}-\${m}-\${d}\`;
    }
    function addDays(date, days) {
      const copy = new Date(date);
      copy.setDate(copy.getDate() + days);
      return copy;
    }
    function scheduleKeyParts(key) {
      const parts = String(key || "").split("__");
      return { locationId: parts[0] || "main", weekStart: parts[1] || "" };
    }
    function minutesBetween(start, end) {
      const parse = (value) => {
        const [h, m] = String(value || "00:00").split(":").map(Number);
        return h * 60 + m;
      };
      let endMinutes = parse(end);
      const startMinutes = parse(start);
      if (endMinutes <= startMinutes) endMinutes += 24 * 60;
      return Math.max(0, endMinutes - startMinutes);
    }
    function effectiveShiftHours(entry) {
      return minutesBetween(entry.actualStart || entry.start, entry.actualEnd || entry.end) / 60;
    }
    function ensureLedgerShape() {
      state.ledger = state.ledger || {};
      state.ledger.shifts = Array.isArray(state.ledger.shifts) ? state.ledger.shifts : [];
      state.ledger.payments = Array.isArray(state.ledger.payments) ? state.ledger.payments : [];
      state.ledger.cashMovements = Array.isArray(state.ledger.cashMovements) ? state.ledger.cashMovements : [];
      state.ledger.terminalReports = Array.isArray(state.ledger.terminalReports) ? state.ledger.terminalReports : [];
      return state.ledger;
    }
    function ledger() {
      return ensureLedgerShape();
    }
    function normalizeCashflowDay(day = {}) {
      return { ...day };
    }
    function normalizePayroll(payroll = {}) {
      return {
        cashPaid: payroll.cashPaid || "",
        transferPaid: payroll.transferPaid || "",
        approvedCashPaid: payroll.approvedCashPaid || "",
        approvedTransferPaid: payroll.approvedTransferPaid || "",
        paymentDate: payroll.paymentDate || "",
        draftPaymentDate: payroll.draftPaymentDate || "",
        payments: Array.isArray(payroll.payments) ? payroll.payments : [],
        paymentApproved: Boolean(payroll.paymentApproved),
        paymentApprovedAt: payroll.paymentApprovedAt || "",
        draftUpdatedAt: payroll.draftUpdatedAt || ""
      };
    }
    function upsertLedgerShift(record) {
      const items = ledger().shifts;
      const index = items.findIndex((item) => item.id === record.id);
      if (index >= 0) items[index] = { ...items[index], ...record };
      else items.push(record);
    }
    function upsertLedgerPayment(record) {
      const items = ledger().payments;
      const index = items.findIndex((item) => item.id === record.id);
      if (index >= 0) items[index] = { ...items[index], ...record };
      else items.push(record);
    }
    function upsertCashMovement(record) {
      const items = ledger().cashMovements;
      const index = items.findIndex((item) => item.id === record.id);
      if (index >= 0) items[index] = { ...items[index], ...record };
      else items.push(record);
    }
    function upsertTerminalReport(record) {
      const items = ledger().terminalReports;
      const index = items.findIndex((item) => item.id === record.id);
      if (index >= 0) items[index] = { ...items[index], ...record };
      else items.push(record);
    }
  `;
  const names = [
    "ledgerPaymentEquivalentExists",
    "syncApprovedSchedulePaymentsToLedger",
    "ledgerShiftEquivalentExists",
    "legacyActualShiftRecord",
    "syncApprovedScheduleActualsToLedger",
    "syncLedgerCashflowField",
    "ledgerCashflowEquivalentExists",
    "syncLegacyCashflowToLedger"
  ];
  const body = `${prelude}\n${names.map((name) => extractFunction(managerScripts, name)).join("\n")}\nreturn {\n  actuals: syncApprovedScheduleActualsToLedger(),\n  payments: syncApprovedSchedulePaymentsToLedger(),\n  cashflow: syncLegacyCashflowToLedger(),\n  state\n};`;
  return new Function("sandbox", body)(sandbox);
}

const manager = read("manager.html");
const sw = read("sw.js");
const ledgerSource = read("ledger-model.js");
const businessRules = read("BUSINESS_RULES.md");
const managerScripts = extractScripts(manager);

for (const error of runDataDependencyCheck()) {
  fail(`data dependency: ${error}`);
}

const legacyBridgeFixture = {
  guards: {},
  repairs: [],
  schedules: {
    "main__2026-01-20": {
      roster: {
        "2026-01-20": [
          {
            staffId: "owner",
            start: "07:30",
            end: "17:30",
            actualStart: "08:00",
            actualEnd: "17:30",
            actualApproved: true,
            actualApprovedAt: "fixture approved"
          }
        ]
      },
      payroll: {
        owner: {
          paymentApproved: true,
          paymentDate: "2026-01-20",
          payments: [
            { id: "fixture-owner-payment", date: "2026-01-20", cash: "190", transfer: "25", approvedAt: "fixture approved" }
          ]
        }
      },
      cashflow: {
        "2026-01-20": {
          openingCash: "100",
          midCash: "250",
          closingCash: "400",
          previousTerminal: "123.45",
          midTerminal: "600.50",
          closingTerminal: "900.75"
        }
      }
    }
  },
  ledger: { shifts: [], payments: [], cashMovements: [], terminalReports: [] }
};
const bridgeFirstRun = runLegacyBridgeParityFixture(legacyBridgeFixture);
assert(bridgeFirstRun.actuals, "legacy actual-hours bridge must write stale approved actuals into ledger");
assert(bridgeFirstRun.payments, "legacy payroll bridge must write stale approved payments into ledger");
assert(bridgeFirstRun.cashflow, "legacy cashflow bridge must write stale cashflow into ledger");
moneyEqual(bridgeFirstRun.state.ledger.shifts.length, 1, "legacy bridge shift count");
moneyEqual(bridgeFirstRun.state.ledger.shifts[0].hours, 9.5, "legacy bridge approved actual hours");
moneyEqual(bridgeFirstRun.state.ledger.payments.length, 2, "legacy bridge payment allocation count");
moneyEqual(bridgeFirstRun.state.ledger.payments.reduce((sum, item) => sum + numberOrZero(item.amount), 0), 215, "legacy bridge payment total");
moneyEqual(bridgeFirstRun.state.ledger.cashMovements.length, 3, "legacy bridge cash movement count");
moneyEqual(bridgeFirstRun.state.ledger.cashMovements.find((item) => item.type === "opening_count")?.amount, 100, "legacy bridge opening cash");
moneyEqual(bridgeFirstRun.state.ledger.cashMovements.find((item) => item.type === "checkpoint_count")?.amount, 250, "legacy bridge checkpoint cash");
moneyEqual(bridgeFirstRun.state.ledger.cashMovements.find((item) => item.type === "closing_count")?.amount, 400, "legacy bridge closing cash");
moneyEqual(bridgeFirstRun.state.ledger.terminalReports.length, 3, "legacy bridge terminal report count");
moneyEqual(bridgeFirstRun.state.ledger.terminalReports.find((item) => item.forDate === "2026-01-19")?.amount, 123.45, "legacy bridge previous terminal");
moneyEqual(bridgeFirstRun.state.ledger.terminalReports.find((item) => item.kind === "after_shift")?.amount, 600.5, "legacy bridge after-shift terminal");
moneyEqual(bridgeFirstRun.state.ledger.terminalReports.find((item) => item.kind === "closing" && item.forDate === "2026-01-20")?.amount, 900.75, "legacy bridge closing terminal");
const bridgeSecondRun = runLegacyBridgeParityFixture(bridgeFirstRun.state);
assert(!bridgeSecondRun.actuals, "legacy actual-hours bridge must be idempotent on second run");
assert(!bridgeSecondRun.payments, "legacy payroll bridge must be idempotent on second run");
assert(!bridgeSecondRun.cashflow, "legacy cashflow bridge must be idempotent on second run");
moneyEqual(bridgeSecondRun.state.ledger.shifts.length, 1, "legacy bridge idempotent shift count");
moneyEqual(bridgeSecondRun.state.ledger.payments.length, 2, "legacy bridge idempotent payment count");
moneyEqual(bridgeSecondRun.state.ledger.cashMovements.length, 3, "legacy bridge idempotent cash count");
moneyEqual(bridgeSecondRun.state.ledger.terminalReports.length, 3, "legacy bridge idempotent terminal count");

assert(!manager.includes('type="module"'), "manager.html must run in file:// mode; do not use script type=module in the main app");
assert(!/^\s*import\s+.*from\s+["']\.\/router\.js["'];/m.test(manager), "manager.html must not use top-level module imports");

for (const file of ["manager.html", "roster.html", "payroll.html", "cashflow.html", "dashboard.html", "audit.html"]) {
  try {
    new Function(extractScripts(read(file)));
  } catch (error) {
    fail(`${file}: script syntax error: ${error.message}`);
  }
}

try {
  new Function(ledgerSource);
} catch (error) {
  fail(`ledger-model.js: script syntax error: ${error.message}`);
}

const migratedState = LedgerModel.migrateStateToLedgerV2({
  journalData20260115v1: true,
  rosterCorrection20260115v2: true,
  financeLedger20260115v1: true,
  payrollActualsCorrection20260115v1: true,
  staff_aPayrollCorrection20260115v1: true,
  ownerPayrollCorrection20260115v1: true
}, "manager test");
const ledger = migratedState.ledger;
const fixture = LedgerModel.fixtureResults(ledger, LedgerModel.staffRates);

const weekPrev = fixture.payroll["2026-01-05"];
moneyEqual(byStaff(weekPrev, "owner").hours, 61, "2026-01-05 Owner hours");
moneyEqual(byStaff(weekPrev, "owner").earned, 1220, "2026-01-05 Owner earned");
moneyEqual(byStaff(weekPrev, "owner").paid, 1220, "2026-01-05 Owner paid");
moneyEqual(byStaff(weekPrev, "owner").toPay, 0, "2026-01-05 Owner toPay");
moneyEqual(byStaff(weekPrev, "staff_a").hours, 23, "2026-01-05 Staff A hours");
moneyEqual(byStaff(weekPrev, "staff_a").earned, 460, "2026-01-05 Staff A earned");
moneyEqual(byStaff(weekPrev, "staff_a").paid, 460, "2026-01-05 Staff A paid");
moneyEqual(byStaff(weekPrev, "staff_a").toPay, 0, "2026-01-05 Staff A toPay");
moneyEqual(byStaff(weekPrev, "staff_b").hours, 29, "2026-01-05 Staff B hours");
moneyEqual(byStaff(weekPrev, "staff_b").earned, 580, "2026-01-05 Staff B earned");
moneyEqual(byStaff(weekPrev, "staff_b").paid, 0, "2026-01-05 Staff B paid");
moneyEqual(byStaff(weekPrev, "staff_b").toPay, 580, "2026-01-05 Staff B toPay");

const weekCurrent = fixture.payroll["2026-01-12"];
moneyEqual(byStaff(weekCurrent, "owner").hours, 37.5, "2026-01-12 Owner hours");
moneyEqual(byStaff(weekCurrent, "owner").earned, 750, "2026-01-12 Owner earned");
moneyEqual(byStaff(weekCurrent, "owner").paid, 550, "2026-01-12 Owner paid");
moneyEqual(byStaff(weekCurrent, "owner").toPay, 200, "2026-01-12 Owner toPay");
moneyEqual(byStaff(weekCurrent, "staff_a").hours, 14, "2026-01-12 Staff A hours");
moneyEqual(byStaff(weekCurrent, "staff_a").earned, 280, "2026-01-12 Staff A earned");
moneyEqual(byStaff(weekCurrent, "staff_a").paid, 130, "2026-01-12 Staff A paid");
moneyEqual(byStaff(weekCurrent, "staff_a").toPay, 150, "2026-01-12 Staff A toPay");
moneyEqual(byStaff(weekCurrent, "staff_b").hours, 6.5, "2026-01-12 Staff B hours");
moneyEqual(byStaff(weekCurrent, "staff_b").earned, 130, "2026-01-12 Staff B earned");
moneyEqual(byStaff(weekCurrent, "staff_b").paid, 0, "2026-01-12 Staff B paid");
moneyEqual(byStaff(weekCurrent, "staff_b").toPay, 130, "2026-01-12 Staff B toPay");

moneyEqual(fixture.cashflow["2026-01-12"].cash, 610, "2026-01-12 cash");
moneyEqual(fixture.cashflow["2026-01-12"].terminal, 1543.63, "2026-01-12 terminal");
moneyEqual(fixture.cashflow["2026-01-13"].cash, 340, "2026-01-13 known cash");
moneyEqual(fixture.cashflow["2026-01-13"].terminal, 2242.77, "2026-01-13 terminal");
moneyEqual(fixture.cashflow["2026-01-14"].cash, 870, "2026-01-14 cash");
moneyEqual(fixture.cashflow["2026-01-14"].terminal, 2034, "2026-01-14 terminal");
moneyEqual(fixture.cashflow["2026-01-14"].cash + fixture.cashflow["2026-01-14"].terminal, 2904, "2026-01-14 daily total");

assert(fixture.roster["2026-01-16:owner"] === "planned", "2026-01-16 Owner must remain planned");
assert(fixture.roster["2026-01-17:owner"] === "planned", "2026-01-17 Owner must remain planned");

for (const flag of [...LedgerModel.requiredGuards, "ledgerModel_v2"]) {
  assert(Boolean(migratedState.guards?.[flag]), `guard must round-trip: ${flag}`);
}

const approvedBefore = LedgerModel.baselineLedger().shifts.filter((shift) => shift.status === "approved").map((shift) => shift.id).sort();
const approvedAfter = migratedState.ledger.shifts.filter((shift) => ["approved", "locked"].includes(shift.status)).map((shift) => shift.id).sort();
assert(approvedBefore.every((id) => approvedAfter.includes(id)), "no approved ShiftRecord may be downgraded by migration");

const ledgerIdentity = ledger.payments;
const ledgerLength = ledger.payments.length;
LedgerModel.payrollSummary(ledger, LedgerModel.staffRates, "2026-01-05");
LedgerModel.knownCashSales(ledger, "2026-01-14");
assert(ledger.payments === ledgerIdentity && ledger.payments.length === ledgerLength, "derivation functions must not mutate ledger arrays");

const terminalAmountForDay = extractFunction(managerScripts, "terminalAmountForDay");
assert(terminalAmountForDay.includes("previousTerminal"), "legacy UI terminal total must still roll next-morning previousTerminal into prior day");

const setReportPeriod = extractFunction(managerScripts, "setReportPeriod");
assert(setReportPeriod.includes("renderHistory()"), "Report Period changes must refresh Period History");
assert(setReportPeriod.includes("renderSummary()"), "Report Period changes must refresh money summary");
assert(setReportPeriod.includes("renderAudit()"), "Report Period changes must refresh Audit Ledger");
assert(!manager.includes('type="number"'), "money/rate inputs must not use type=number because locale keyboards can block decimal points");
assert(managerScripts.includes("function normalizeDecimalText"), "decimal values must be normalized before parsing");
assert(managerScripts.includes('replace(",", ".")'), "decimal parser must accept comma input as dot");
assert(managerScripts.includes('document.addEventListener("beforeinput"'), "decimal inputs must normalize punctuation before browser-specific filtering");

assert(managerScripts.includes("paymentDateInput.value = payroll.draftPaymentDate || \"\""), "new payment date input must use only draftPaymentDate");
assert(managerScripts.includes("Choose payment date before approving payment."), "approving payroll must require an explicit payment date");
assert(managerScripts.includes("function ledgerPaymentTotalsForStaffWeek"), "payroll views must read approved payments from ledger allocations");
assert(managerScripts.includes("function ledgerCashPaidForDate"), "cashflow views must read physical cash payouts from ledger payments");
assert(managerScripts.includes("function syncLedgerCashflowField"), "Day and Cashflow inputs must share the same ledger sync path");
assert(extractFunction(managerScripts, "saveCashflowField").includes("syncLedgerCashflowField"), "Cashflow page input must write terminal/cash records to ledger");
assert(extractFunction(managerScripts, "saveTodayCashField").includes("syncLedgerCashflowField"), "Day page input must write terminal/cash records through shared ledger sync");
assert(extractFunction(managerScripts, "renderPayroll").includes("ledgerPaymentTotalsForStaffWeek"), "Payroll page must derive approved paid amounts from ledger");
assert(extractFunction(managerScripts, "staffPeriodTotals").includes("ledgerPaymentTotalsForStaffWeek"), "Summary/history staff totals must derive paid amounts from ledger");
assert(extractFunction(managerScripts, "cashflowTotalsForDay").includes("payrollCashPaidForDate"), "Cashflow totals must include payroll payouts through the shared helper");
assert(extractFunction(managerScripts, "payrollCashPaidForDate").includes("ledgerCashPaidForDate"), "Cashflow payout helper must read ledger payouts by paidOn date");
assert(manager.includes('id="todayActualsGrid"'), "Day page must include actual hours approval grid");
assert(managerScripts.includes("actualRowFor(entry, date)"), "Day page must render actual approval rows for selected date");
assert(managerScripts.includes("showStatus(`${person?.name || \"Shift\"} actual hours approved.`)"), "Actual approval must give user feedback");
assert(manager.includes('href="./manager.html#/audit"'), "manager navigation must expose the Audit page");
assert(manager.includes('id="auditGrid"'), "Audit page must include an audit grid");
assert(managerScripts.includes('"audit"'), "routePage must allow the Audit route");
assert(managerScripts.includes("function renderAudit()"), "Audit page must render ledger records");
assert(managerScripts.includes("function auditRows()"), "Audit page must derive rows from ledger evidence");
assert(managerScripts.includes("copyAuditButtonEl.addEventListener"), "Audit page must support copying evidence");
assert(businessRules.includes("Approved actual hours are the only hours that count into payroll."), "BUSINESS_RULES.md must protect approved-actual-hours payroll logic");
assert(businessRules.includes("The payment date and payroll allocation period may be different."), "BUSINESS_RULES.md must protect payment allocation semantics");
assert(businessRules.includes("Migration bridge code must have an automated parity test"), "BUSINESS_RULES.md must require bridge parity testing");
assert(businessRules.includes("does not create duplicates"), "BUSINESS_RULES.md must require bridge idempotency testing");
assert(managerScripts.includes("function syncApprovedScheduleActualsToLedger"), "legacy approved actuals bridge must exist");
assert(managerScripts.includes("function syncApprovedSchedulePaymentsToLedger"), "legacy payroll payments bridge must exist");
assert(managerScripts.includes("function syncLegacyCashflowToLedger"), "legacy cashflow bridge must exist");
assert(managerScripts.includes("legacyActualHoursLedgerSyncApplied || legacyPayrollPaymentsLedgerSyncApplied || legacyCashflowLedgerSyncApplied"), "startup must persist legacy bridge writes");
assert(managerScripts.includes("function repairPreviousWeekRosterActuals20260121"), "previous week protected roster actuals repair must exist");
assert(managerScripts.includes("repairPreviousWeekRosterActuals20260121()"), "previous week protected roster actuals repair must run on startup");
assert(managerScripts.includes("function repairPreviousWeekOwnerPayments20260121"), "previous week Owner payment repair must exist");
assert(managerScripts.includes("repairPreviousWeekOwnerPayments20260121()"), "previous week Owner payment repair must run on startup");
assert(managerScripts.includes("staff_aPriorPeriodPayment20260121v2"), "Staff A previous-week payment repair must be factual v2");
for (const expectedShift of [
  'approvedShift("owner", "07:30", "10:30"',
  'approvedShift("staff_a", "10:30", "17:30"',
  'approvedShift("staff_b", "17:30", closeTime',
  'approvedShift("owner", "09:00", "17:30"',
  'approvedShift("owner", "07:30", "18:30"',
  'approvedShift("staff_a", "18:30", closeTime',
  'approvedShift("owner", "07:30", "17:30"',
  'approvedShift("staff_b", "17:30", closeTime',
  'approvedShift("owner", "07:30", "10:00"',
  'plannedShift("", "10:00", "11:00")',
  'approvedShift("owner", "11:00", "21:00"',
  'approvedShift("staff_b", "21:00", closeTime',
  'approvedShift("owner", "07:30", "10:30"',
  'approvedShift("staff_a", "10:30", "21:00"',
  'approvedShift("owner", "21:00", closeTime'
]) {
  assert(managerScripts.includes(expectedShift), `previous week protected roster repair missing ${expectedShift}`);
}

assert(manager.includes("<script src=\"./ledger-model.js\"></script>"), "manager.html must load ledger-model.js");
assert(cacheVersion(sw) >= 64, "service worker cache version must be current");

for (const file of ["manager.html", "roster.html", "payroll.html", "cashflow.html", "dashboard.html", "audit.html", "ledger-model.js", "BUSINESS_RULES.md"]) {
  assert(sw.includes(`"./${file}"`), `sw.js must cache ${file}`);
}

if (errors.length) {
  console.error("Regression check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Regression check passed:");
console.log("- ledger fixtures match protected payroll and cashflow values");
console.log("- migration guards and approved shift statuses are preserved");
console.log("- derivation functions leave ledger arrays unchanged");
console.log("- Report Period refreshes Period History and money summary");
console.log("- Audit route and Business Rules are wired into regression checks");
console.log("- data dependency release gate is green");
console.log("- service worker cache includes ledger model, audit, rules, and app pages");



