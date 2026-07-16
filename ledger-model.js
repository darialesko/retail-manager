(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LedgerModel = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const dayMs = 24 * 60 * 60 * 1000;
  const requiredGuards = [
    "journalData20260115v1",
    "rosterCorrection20260115v2",
    "financeLedger20260115v1",
    "payrollActualsCorrection20260115v1",
    "staff_aPayrollCorrection20260115v1",
    "ownerPayrollCorrection20260115v1"
  ];

  const staffRates = {
    owner: { name: "Owner", rate: 20 },
    staff_a: { name: "Staff A", rate: 20 },
    staff_b: { name: "Staff B", rate: 20 },
    supplier: { name: "Supplier", rate: 20 }
  };

  function isoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDays(date, amount) {
    return new Date(date.getTime() + amount * dayMs);
  }

  function weekDates(weekStart) {
    const start = new Date(`${weekStart}T00:00:00`);
    return Array.from({ length: 7 }, (_, index) => isoDate(addDays(start, index)));
  }

  function moneyNumber(value) {
    const number = Number.parseFloat(value);
    return Number.isFinite(number) ? number : 0;
  }

  function recordId(prefix, parts) {
    return `${prefix}_${parts.join("_")}`.replace(/[^a-zA-Z0-9_:-]/g, "_");
  }

  function normalizeGuards(state) {
    const guards = { ...(state.guards || {}) };
    requiredGuards.forEach((flag) => {
      if (state[flag] && !guards[flag]) guards[flag] = state[flag] === true ? "legacy-true" : String(state[flag]);
    });
    return guards;
  }

  function createShift(id, staffId, date, start, end, status, sourceRef) {
    return {
      id,
      staffId,
      date,
      plannedStart: start,
      plannedEnd: end,
      actualStart: status === "approved" || status === "locked" ? start : "",
      actualEnd: status === "approved" || status === "locked" ? end : "",
      hours: shiftHours(start, end),
      status,
      approvedAt: status === "approved" ? sourceRef : "",
      approvedBy: status === "approved" ? "user" : "",
      sourceRef
    };
  }

  function shiftHours(start, end) {
    const [sh, sm] = start.split(":").map(Number);
    const [ehRaw, em] = end.split(":").map(Number);
    const eh = ehRaw === 24 ? 24 : ehRaw;
    let startMinutes = sh * 60 + sm;
    let endMinutes = eh * 60 + em;
    if (endMinutes <= startMinutes) endMinutes += 24 * 60;
    return (endMinutes - startMinutes) / 60;
  }

  function payment(id, staffId, amount, paidOn, allocation, method, note, sourceRef) {
    return {
      id,
      staffId,
      amount,
      paidOn,
      allocation,
      method,
      cashMovementId: method === "cash" ? `cm_${id}` : "",
      sourceRef,
      note
    };
  }

  function cashMovement(id, date, type, amount, direction, note, sourceRef) {
    return { id, date, type, amount, direction, note, sourceRef };
  }

  function terminalReport(id, forDate, reportedOn, kind, amount, evidence, sourceRef) {
    return { id, forDate, reportedOn, kind, amount, evidence, sourceRef };
  }

  function baselineLedger() {
    const shifts = [
      createShift("shift_20260105_owner", "owner", "2026-01-05", "07:30", "10:30", "approved", "demo-seed:v1"),
      createShift("shift_20260105_staff_a", "staff_a", "2026-01-05", "10:30", "17:30", "approved", "demo-seed:v1"),
      createShift("shift_20260105_staff_b", "staff_b", "2026-01-05", "17:30", "24:00", "approved", "demo-seed:v1"),
      createShift("shift_20260106_owner", "owner", "2026-01-06", "09:00", "17:30", "approved", "demo-seed:v1"),
      createShift("shift_20260106_staff_b", "staff_b", "2026-01-06", "17:30", "24:00", "approved", "demo-seed:v1"),
      createShift("shift_20260107_owner", "owner", "2026-01-07", "07:30", "18:30", "approved", "demo-seed:v1"),
      createShift("shift_20260107_staff_a", "staff_a", "2026-01-07", "18:30", "24:00", "approved", "demo-seed:v1"),
      createShift("shift_20260108_owner", "owner", "2026-01-08", "07:30", "17:30", "approved", "demo-seed:v1"),
      createShift("shift_20260108_staff_b", "staff_b", "2026-01-08", "17:30", "24:00", "approved", "demo-seed:v1"),
      createShift("shift_20260109_owner", "owner", "2026-01-09", "07:30", "17:30", "approved", "demo-seed:v2"),
      createShift("shift_20260109_staff_b", "staff_b", "2026-01-09", "17:30", "24:00", "approved", "demo-seed:v2"),
      createShift("shift_20260110_owner_morning", "owner", "2026-01-10", "07:30", "10:00", "approved", "demo-seed:v2"),
      createShift("shift_20260110_gap", "", "2026-01-10", "10:00", "11:00", "planned", "demo-seed:v2"),
      createShift("shift_20260110_owner_day", "owner", "2026-01-10", "11:00", "21:00", "approved", "demo-seed:v2"),
      createShift("shift_20260110_staff_b", "staff_b", "2026-01-10", "21:00", "24:00", "approved", "demo-seed:v2"),
      createShift("shift_20260111_owner_morning", "owner", "2026-01-11", "07:30", "10:30", "approved", "demo-seed:v2"),
      createShift("shift_20260111_staff_a", "staff_a", "2026-01-11", "10:30", "21:00", "approved", "demo-seed:v2"),
      createShift("shift_20260111_owner_evening", "owner", "2026-01-11", "21:00", "24:00", "approved", "demo-seed:v2"),
      createShift("shift_20260112_owner", "owner", "2026-01-12", "07:30", "17:30", "approved", "demo-seed:v1"),
      createShift("shift_20260112_staff_a", "staff_a", "2026-01-12", "17:30", "24:00", "approved", "demo-seed:v1"),
      createShift("shift_20260113_owner", "owner", "2026-01-13", "07:30", "17:30", "approved", "demo-seed:v1"),
      createShift("shift_20260113_staff_b", "staff_b", "2026-01-13", "17:30", "24:00", "approved", "demo-seed:v1"),
      createShift("shift_20260114_owner", "owner", "2026-01-14", "08:00", "15:30", "approved", "demo-seed:v1"),
      createShift("shift_20260114_staff_a", "staff_a", "2026-01-14", "16:30", "24:00", "approved", "demo-seed:v1"),
      createShift("shift_20260115_owner", "owner", "2026-01-15", "07:30", "17:30", "approved", "demo-seed:v1"),
      createShift("shift_20260115_staff_a", "staff_a", "2026-01-15", "17:30", "24:00", "planned", "demo-seed:v1"),
      createShift("shift_20260116_owner", "owner", "2026-01-16", "07:30", "24:00", "planned", "demo-seed:v1"),
      createShift("shift_20260117_owner", "owner", "2026-01-17", "07:30", "24:00", "planned", "demo-seed:v1")
    ];

    const payments = [
      payment("pay_20260105_owner_60", "owner", 60, "2026-01-05", [{ forWeekStart: "2026-01-05", amount: 60 }], "cash", "", "demo-seed:v1"),
      payment("pay_20260106_owner_170", "owner", 170, "2026-01-06", [{ forWeekStart: "2026-01-05", amount: 170 }], "cash", "", "demo-seed:v1"),
      payment("pay_20260107_owner_220", "owner", 220, "2026-01-07", [{ forWeekStart: "2026-01-05", amount: 220 }], "cash", "", "demo-seed:v1"),
      payment("pay_20260109_owner_200", "owner", 200, "2026-01-09", [{ forWeekStart: "2026-01-05", amount: 200 }], "cash", "", "demo-seed:v1"),
      payment("pay_20260111_owner_120", "owner", 120, "2026-01-11", [{ forWeekStart: "2026-01-05", amount: 120 }], "cash", "Confirmed with restored 2026-01-11 roster", "demo-seed:v2"),
      payment("pay_20260111_owner_prev_week_settlement_450", "owner", 450, "2026-01-11", [{ forWeekStart: "2026-01-05", amount: 450 }], "cash", "Confirmed by Owner: payroll week 2026-01-05 was fully paid within that week", "demo-seed:v2"),
      payment("pay_20260105_staff_a_140", "staff_a", 140, "2026-01-05", [{ forWeekStart: "2026-01-05", amount: 140 }], "cash", "", "demo-seed:v1"),
      payment("pay_20260112_staff_a_320", "staff_a", 320, "2026-01-12", [
        { forWeekStart: "2026-01-05", amount: 110 },
        { forWeekStart: "2026-01-05", amount: 210 }
      ], "cash", "Includes $110 for 2026-01-07 and $210 for 2026-01-11", "demo-seed:v2"),
      payment("pay_20260112_owner_200", "owner", 200, "2026-01-12", [{ forWeekStart: "2026-01-12", amount: 200 }], "cash", "", "demo-seed:v1"),
      payment("pay_20260113_owner_200", "owner", 200, "2026-01-13", [{ forWeekStart: "2026-01-12", amount: 200 }], "cash", "", "demo-seed:v1"),
      payment("pay_20260114_owner_150", "owner", 150, "2026-01-14", [{ forWeekStart: "2026-01-12", amount: 150 }], "cash", "", "demo-seed:v1"),
      payment("pay_20260114_staff_a_130", "staff_a", 130, "2026-01-14", [{ forWeekStart: "2026-01-12", amount: 130 }], "cash", "", "demo-seed:v1")
    ];

    const cashMovements = [
      cashMovement("cm_20260112_opening", "2026-01-12", "opening_count", 350, "snapshot", "", "demo-seed:v1"),
      cashMovement("cm_20260112_closing", "2026-01-12", "closing_count", 440, "snapshot", "", "demo-seed:v1"),
      cashMovement("cm_20260112_payout_owner", "2026-01-12", "staff_payout", 200, "out", "", "demo-seed:v1"),
      cashMovement("cm_20260112_payout_staff_a", "2026-01-12", "staff_payout", 320, "out", "prior-period and settlement payout", "demo-seed:v1"),
      cashMovement("cm_20260113_opening", "2026-01-13", "opening_count", 440, "snapshot", "", "demo-seed:v1"),
      cashMovement("cm_20260113_checkpoint", "2026-01-13", "checkpoint_count", 580, "snapshot", "known-only checkpoint", "demo-seed:v1"),
      cashMovement("cm_20260113_payout_owner", "2026-01-13", "staff_payout", 200, "out", "", "demo-seed:v1"),
      cashMovement("cm_20260113_withdrawal", "2026-01-13", "external_withdrawal", 580, "out", "External withdrawal after left balance, not operational sales", "demo-seed:v1"),
      cashMovement("cm_20260114_opening", "2026-01-14", "opening_count", 0, "snapshot", "", "demo-seed:v1"),
      cashMovement("cm_20260114_closing", "2026-01-14", "closing_count", 600, "snapshot", "", "demo-seed:v1"),
      cashMovement("cm_20260114_payout_owner", "2026-01-14", "staff_payout", 150, "out", "", "demo-seed:v1"),
      cashMovement("cm_20260114_payout_staff_a", "2026-01-14", "staff_payout", 130, "out", "", "demo-seed:v1"),
      cashMovement("cm_20260114_adjustment", "2026-01-14", "adjustment", 10, "in", "Untracked till cash excluded from sales", "demo-seed:v1")
    ];

    const terminalReports = [
      terminalReport("term_20260112_closing", "2026-01-12", "2026-01-12", "closing", 1543.63, "", "demo-seed:v1"),
      terminalReport("term_20260113_closing", "2026-01-13", "2026-01-13", "closing", 2242.77, "", "demo-seed:v1"),
      terminalReport("term_20260114_closing", "2026-01-14", "2026-01-15", "closing", 2034.00, "photo", "demo-seed:v1")
    ];

    return { shifts, payments, cashMovements, terminalReports };
  }

  function migrateStateToLedgerV2(state, appVersion = "") {
    const before = {
      schemaVersion: state.schemaVersion || 1,
      guardSnapshot: requiredGuards.reduce((result, flag) => {
        result[flag] = state[flag] || state.guards?.[flag] || false;
        return result;
      }, {}),
      existingLedgerCounts: state.ledger ? {
        shifts: state.ledger.shifts?.length || 0,
        payments: state.ledger.payments?.length || 0,
        cashMovements: state.ledger.cashMovements?.length || 0,
        terminalReports: state.ledger.terminalReports?.length || 0
      } : null
    };

    if (state.schemaVersion === 2 && state.guards?.ledgerModel_v2 && state.ledger) return state;

    const next = { ...state };
    next.schemaVersion = 2;
    next.ledger = baselineLedger();
    next.staffDirectory = { ...staffRates };
    next.guards = normalizeGuards(state);
    next.guards.ledgerModel_v2 = new Date().toISOString();
    next.repairs = Array.isArray(state.repairs) ? [...state.repairs] : [];
    next.repairs.push({
      id: "repair_ledgerModel_v2_20260121",
      guardFlag: "ledgerModel_v2",
      appliedAt: next.guards.ledgerModel_v2,
      description: "Migrated protected baseline payroll, shifts, cash movements, and terminal reports to append-only ledger v2. Staff A 2026-01-12 $320 is split into $110 for week 2026-01-05 and $210 prior-settlement.",
      affects: ["ledger.shifts", "ledger.payments", "ledger.cashMovements", "ledger.terminalReports", "pay_20260112_staff_a_320"],
      before,
      after: {
        schemaVersion: 2,
        guards: { ...next.guards },
        ledgerCounts: {
          shifts: next.ledger.shifts.length,
          payments: next.ledger.payments.length,
          cashMovements: next.ledger.cashMovements.length,
          terminalReports: next.ledger.terminalReports.length
        }
      }
    });
    next.meta = { ...(state.meta || {}), appVersion };
    return next;
  }

  function approvedHours(ledger, staffId, weekStart) {
    const dates = new Set(weekDates(weekStart));
    return (ledger.shifts || [])
      .filter((shift) => shift.staffId === staffId && dates.has(shift.date) && ["approved", "locked"].includes(shift.status))
      .reduce((total, shift) => total + moneyNumber(shift.hours), 0);
  }

  function earned(ledger, staff, staffId, weekStart) {
    const rate = staff?.[staffId]?.rate ?? staffRates[staffId]?.rate ?? 0;
    return approvedHours(ledger, staffId, weekStart) * moneyNumber(rate);
  }

  function paidForWeek(ledger, staffId, weekStart) {
    return (ledger.payments || [])
      .filter((paymentRecord) => paymentRecord.staffId === staffId)
      .flatMap((paymentRecord) => paymentRecord.allocation || [])
      .filter((allocation) => allocation.forWeekStart === weekStart)
      .reduce((total, allocation) => total + moneyNumber(allocation.amount), 0);
  }

  function toPay(ledger, staff, staffId, weekStart) {
    return earned(ledger, staff, staffId, weekStart) - paidForWeek(ledger, staffId, weekStart);
  }

  function payrollSummary(ledger, staff, weekStart) {
    return Object.keys(staffRates).map((staffId) => ({
      staffId,
      hours: approvedHours(ledger, staffId, weekStart),
      earned: earned(ledger, staff, staffId, weekStart),
      paid: paidForWeek(ledger, staffId, weekStart),
      toPay: toPay(ledger, staff, staffId, weekStart)
    }));
  }

  function latestKnownCount(ledger, date) {
    const records = (ledger.cashMovements || []).filter((record) => record.date === date);
    const closing = records.find((record) => record.type === "closing_count");
    if (closing) return { amount: moneyNumber(closing.amount), source: "closing_count" };
    const checkpoint = records.find((record) => record.type === "checkpoint_count");
    if (checkpoint) return { amount: moneyNumber(checkpoint.amount), source: "checkpoint_count" };
    return { amount: null, source: "pending" };
  }

  function knownCashSales(ledger, date) {
    const records = (ledger.cashMovements || []).filter((record) => record.date === date);
    const opening = records.find((record) => record.type === "opening_count");
    const latest = latestKnownCount(ledger, date);
    if (!opening || latest.amount === null) return { pending: true, amount: 0 };
    const staffPayouts = records
      .filter((record) => record.type === "staff_payout")
      .reduce((total, record) => total + moneyNumber(record.amount), 0);
    const adjustment = records
      .filter((record) => record.type === "adjustment")
      .reduce((total, record) => total + (record.direction === "in" ? -moneyNumber(record.amount) : moneyNumber(record.amount)), 0);
    return { pending: false, amount: latest.amount - moneyNumber(opening.amount) + staffPayouts + adjustment, latestSource: latest.source };
  }

  function terminalForDate(ledger, date) {
    const records = (ledger.terminalReports || []).filter((record) => record.forDate === date);
    const closing = records.find((record) => record.kind === "closing");
    if (closing) return moneyNumber(closing.amount);
    const afterShift = records.find((record) => record.kind === "after_shift");
    return afterShift ? moneyNumber(afterShift.amount) : 0;
  }

  function dayCompleteness(ledger, date) {
    const records = (ledger.cashMovements || []).filter((record) => record.date === date);
    const hasOpening = records.some((record) => record.type === "opening_count");
    const hasClosing = records.some((record) => record.type === "closing_count");
    const hasTerminal = (ledger.terminalReports || []).some((record) => record.forDate === date);
    const hasPendingShift = (ledger.shifts || []).some((shift) => shift.date === date && shift.status === "worked_pending");
    return {
      incomplete: !hasOpening || !hasClosing || !hasTerminal || hasPendingShift,
      hasOpening,
      hasClosing,
      hasTerminal,
      hasPendingShift
    };
  }

  function fixtureResults(ledger, staff = staffRates) {
    return {
      payroll: {
        "2026-01-05": payrollSummary(ledger, staff, "2026-01-05"),
        "2026-01-12": payrollSummary(ledger, staff, "2026-01-12")
      },
      cashflow: {
        "2026-01-12": { cash: knownCashSales(ledger, "2026-01-12").amount, terminal: terminalForDate(ledger, "2026-01-12") },
        "2026-01-13": { cash: knownCashSales(ledger, "2026-01-13").amount, terminal: terminalForDate(ledger, "2026-01-13") },
        "2026-01-14": { cash: knownCashSales(ledger, "2026-01-14").amount, terminal: terminalForDate(ledger, "2026-01-14") }
      },
      roster: {
        "2026-01-16:owner": (ledger.shifts || []).find((shift) => shift.date === "2026-01-16" && shift.staffId === "owner")?.status,
        "2026-01-17:owner": (ledger.shifts || []).find((shift) => shift.date === "2026-01-17" && shift.staffId === "owner")?.status
      }
    };
  }

  return {
    requiredGuards,
    staffRates,
    baselineLedger,
    migrateStateToLedgerV2,
    approvedHours,
    earned,
    paidForWeek,
    toPay,
    payrollSummary,
    latestKnownCount,
    knownCashSales,
    terminalForDate,
    dayCompleteness,
    fixtureResults,
    weekDates
  };
});



