"use strict";

// Run with: node --test
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateExpense, toCents, formatRand, formatDate, todayString, totalCents,
  categoryTotals, sortNewestFirst, isValidExpense, parseStoredExpenses,
  formatMonth, availableMonths, filterByMonth, csvCell, toCsv,
} = require("./js/logic.js");

const TODAY = "2026-11-26";

function expense(overrides = {}) {
  return {
    id: "abc123",
    description: "Taxi",
    amountCents: 4550,
    category: "Transport",
    date: "2026-11-20",
    ...overrides,
  };
}

function form(overrides = {}) {
  return { description: "Taxi", amount: "45.50", date: "2026-11-20", ...overrides };
}

// ---------- Form validation ----------

test("a valid form has no problems", () => {
  assert.deepEqual(validateExpense(form(), TODAY), {});
});

test("description: empty and too short are rejected", () => {
  assert.ok(validateExpense(form({ description: "   " }), TODAY).description);
  assert.ok(validateExpense(form({ description: "a" }), TODAY).description);
});

test("amount: empty, zero, negative, text and scientific notation are rejected", () => {
  for (const amount of ["", "0", "-5", "abc", "1e3", "1.234", "1,50", "4 5"]) {
    assert.ok(validateExpense(form({ amount }), TODAY).amount, `"${amount}" should fail`);
  }
});

test("amount: normal values and the maximum are accepted", () => {
  for (const amount of ["0.01", "45", "45.5", "45.50", "1000000"]) {
    assert.equal(validateExpense(form({ amount }), TODAY).amount, undefined, amount);
  }
});

test("amount: above R1,000,000 is rejected", () => {
  assert.ok(validateExpense(form({ amount: "1000000.01" }), TODAY).amount);
  assert.ok(validateExpense(form({ amount: "1000001" }), TODAY).amount);
});

test("date: empty and future dates are rejected, today is accepted", () => {
  assert.ok(validateExpense(form({ date: "" }), TODAY).date);
  assert.ok(validateExpense(form({ date: "2026-11-27" }), TODAY).date);
  assert.equal(validateExpense(form({ date: TODAY }), TODAY).date, undefined);
});

test("several problems are all reported at once", () => {
  const problems = validateExpense({ description: "", amount: "", date: "" }, TODAY);
  assert.deepEqual(Object.keys(problems).sort(), ["amount", "date", "description"]);
});

// ---------- Money and dates ----------

test("toCents avoids decimal rounding errors", () => {
  assert.equal(toCents("45.50"), 4550);
  assert.equal(toCents("0.29"), 29);
  assert.equal(toCents("19.99"), 1999);
  assert.equal(toCents("1234.56"), 123456);
});

test("formatRand adds the R sign, thousands separators and two decimals", () => {
  assert.equal(formatRand(4550), "R45.50");
  assert.equal(formatRand(123456), "R1,234.56");
  assert.equal(formatRand(5), "R0.05");
  assert.equal(formatRand(0), "R0.00");
});

test("formatDate and formatMonth", () => {
  assert.equal(formatDate("2026-11-05"), "5 Nov 2026");
  assert.equal(formatDate("2026-01-20"), "20 Jan 2026");
  assert.equal(formatMonth("2026-11"), "November 2026");
});

test("todayString uses the local date with zero padding", () => {
  assert.equal(todayString(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(todayString(new Date(2026, 11, 31)), "2026-12-31");
});

// ---------- Totals, sorting and filtering ----------

test("totalCents adds everything and handles an empty list", () => {
  assert.equal(totalCents([]), 0);
  assert.equal(totalCents([expense({ amountCents: 100 }), expense({ amountCents: 250 })]), 350);
});

test("categoryTotals groups, sorts biggest first and gives percentages", () => {
  const rows = categoryTotals([
    expense({ category: "Food", amountCents: 5000 }),
    expense({ category: "Transport", amountCents: 2500 }),
    expense({ category: "Food", amountCents: 2500 }),
    expense({ category: "Health", amountCents: 10000 }),
  ]);
  assert.deepEqual(
    rows.map((r) => [r.category, r.cents, r.percent]),
    [["Health", 10000, 50], ["Food", 7500, 38], ["Transport", 2500, 13]]
  );
});

test("categoryTotals leaves out empty categories and handles no expenses", () => {
  assert.deepEqual(categoryTotals([]), []);
  assert.equal(categoryTotals([expense({ category: "Food" })]).length, 1);
});

test("sortNewestFirst orders by date, then by most recently added", () => {
  const list = [
    expense({ id: "1", date: "2026-11-01" }),
    expense({ id: "2", date: "2026-11-20" }),
    expense({ id: "3", date: "2026-11-20" }),
  ];
  assert.deepEqual(sortNewestFirst(list).map((e) => e.id), ["3", "2", "1"]);
});

test("sortNewestFirst does not change the original list", () => {
  const list = [expense({ id: "1", date: "2026-11-01" }), expense({ id: "2", date: "2026-11-20" })];
  sortNewestFirst(list);
  assert.deepEqual(list.map((e) => e.id), ["1", "2"]);
});

test("availableMonths lists each month once, newest first", () => {
  const list = [
    expense({ date: "2026-10-30" }),
    expense({ date: "2026-11-20" }),
    expense({ date: "2026-11-02" }),
  ];
  assert.deepEqual(availableMonths(list), ["2026-11", "2026-10"]);
});

test("filterByMonth keeps one month, or everything for 'all'", () => {
  const list = [
    expense({ id: "1", date: "2026-10-30" }),
    expense({ id: "2", date: "2026-11-20" }),
    expense({ id: "3", date: "2026-11-02" }),
  ];
  assert.deepEqual(filterByMonth(list, "2026-11").map((e) => e.id), ["2", "3"]);
  assert.equal(filterByMonth(list, "all").length, 3);
  assert.equal(filterByMonth(list, "2025-01").length, 0);
});

// ---------- Saved data is untrusted ----------

test("a well-formed expense is accepted", () => {
  assert.equal(isValidExpense(expense()), true);
});

test("tampered or broken expenses are all rejected", () => {
  const bad = [
    expense({ amountCents: -5 }),
    expense({ amountCents: 45.5 }),
    expense({ amountCents: "100" }),
    expense({ amountCents: 1e12 }),
    expense({ category: "Hacking" }),
    expense({ date: "2026-13-40" }),
    expense({ date: "20-11-2026" }),
    expense({ description: "x" }),
    expense({ description: "a".repeat(61) }),
    expense({ id: "" }),
    expense({ id: 5 }),
    null,
    7,
    "text",
  ];
  for (const item of bad) {
    assert.equal(isValidExpense(item), false, JSON.stringify(item));
  }
});

test("parseStoredExpenses handles empty, broken and wrong-shaped data", () => {
  assert.deepEqual(parseStoredExpenses(null), []);
  assert.deepEqual(parseStoredExpenses(""), []);
  assert.deepEqual(parseStoredExpenses("{not json"), []);
  assert.deepEqual(parseStoredExpenses('{"a":1}'), []);
});

test("parseStoredExpenses keeps good entries and drops bad ones", () => {
  const text = JSON.stringify([expense(), expense({ amountCents: -1 }), null]);
  assert.equal(parseStoredExpenses(text).length, 1);
});

test("HTML typed in a description is kept as plain text, never executed", () => {
  const text = JSON.stringify([expense({ description: "<img src=x onerror=alert(1)>" })]);
  assert.equal(parseStoredExpenses(text)[0].description, "<img src=x onerror=alert(1)>");
});

// ---------- CSV export ----------

test("csvCell leaves ordinary text alone", () => {
  assert.equal(csvCell("Lunch"), "Lunch");
  assert.equal(csvCell("Café"), "Café");
});

test("csvCell neutralises spreadsheet formulas (CSV injection)", () => {
  for (const text of ["=1+1", "+27 82", "-5 refund", "@SUM(A1)", "\tTab"]) {
    assert.ok(csvCell(text).startsWith("'"), text);
  }
  assert.equal(csvCell('=HYPERLINK("http://x","c")'), "\"'=HYPERLINK(\"\"http://x\"\",\"\"c\"\")\"");
});

test("csvCell wraps commas, quotes and line breaks so they stay in one cell", () => {
  assert.equal(csvCell("Hello, world"), '"Hello, world"');
  assert.equal(csvCell('She said "hi"'), '"She said ""hi"""');
  assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
});

test("toCsv writes a header, newest first, with amounts in rands", () => {
  const csv = toCsv([
    expense({ id: "1", date: "2026-10-30", description: "Lunch", category: "Food", amountCents: 5000 }),
    expense({ id: "2", date: "2026-11-20", description: "Taxi", category: "Transport", amountCents: 4550 }),
  ]);
  assert.equal(
    csv,
    "Date,Description,Category,Amount (R)\r\n" +
      "2026-11-20,Taxi,Transport,45.50\r\n" +
      "2026-10-30,Lunch,Food,50.00\r\n"
  );
});

test("toCsv with no expenses is just the header", () => {
  assert.equal(toCsv([]), "Date,Description,Category,Amount (R)\r\n");
});