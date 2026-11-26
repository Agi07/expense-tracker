"use strict";

const STORAGE_KEY = "expense-tracker:v1";

const form = document.getElementById("expense-form");
const status = document.getElementById("form-status");
const list = document.getElementById("expense-list");
const emptyMessage = document.getElementById("empty-message");
const totalBox = document.getElementById("total");
const categoryList = document.getElementById("category-totals");
const monthFilter = document.getElementById("month-filter");
const exportButton = document.getElementById("export-btn");

const fields = {
  description: document.getElementById("description"),
  amount: document.getElementById("amount"),
  category: document.getElementById("category"),
  date: document.getElementById("date"),
};

const errorBoxes = {
  description: document.getElementById("description-error"),
  amount: document.getElementById("amount-error"),
  date: document.getElementById("date-error"),
};

// ---------- Saving and loading ----------

function loadExpenses() {
  try {
    return parseStoredExpenses(localStorage.getItem(STORAGE_KEY));
  } catch (error) {
    return []; // storage can be blocked, for example in private browsing
  }
}

function saveExpenses() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
  } catch (error) {
    status.textContent = "Could not save to this browser. Your changes will be lost on refresh.";
  }
}

let expenses = loadExpenses();
let selectedMonth = "all"; // "all" or a month like "2026-11"

function visibleExpenses() {
  return filterByMonth(expenses, selectedMonth);
}

// ---------- Showing everything ----------

function renderMonthOptions() {
  const months = availableMonths(expenses);
  if (selectedMonth !== "all" && !months.includes(selectedMonth)) {
    selectedMonth = "all"; // that month has no expenses left
  }

  monthFilter.replaceChildren();
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = "All months";
  monthFilter.append(all);

  for (const month of months) {
    const option = document.createElement("option");
    option.value = month;
    option.textContent = formatMonth(month);
    monthFilter.append(option);
  }
  monthFilter.value = selectedMonth;
  monthFilter.disabled = months.length === 0;
}

function renderCategories(shown) {
  categoryList.replaceChildren();
  const rows = categoryTotals(shown);

  if (rows.length === 0) {
    const hint = document.createElement("li");
    hint.className = "empty";
    hint.textContent = "Add an expense to see where your money goes.";
    categoryList.append(hint);
    return;
  }

  for (const row of rows) {
    const item = document.createElement("li");
    item.className = "cat";

    const head = document.createElement("div");
    head.className = "cat__head";
    const name = document.createElement("span");
    name.textContent = row.category;
    const value = document.createElement("span");
    const share = row.percent === 0 ? "<1" : row.percent;
    value.textContent = `${formatRand(row.cents)} (${share}%)`;
    head.append(name, value);

    // The bar is decorative: the numbers above already say the same thing.
    const track = document.createElement("div");
    track.className = "cat__track";
    track.setAttribute("aria-hidden", "true");
    const fill = document.createElement("div");
    fill.className = "cat__fill";
    fill.style.width = `${Math.max(row.percent, 2)}%`;
    track.append(fill);

    item.append(head, track);
    categoryList.append(item);
  }
}

function render() {
  renderMonthOptions();
  const shown = visibleExpenses();

  list.replaceChildren();
  emptyMessage.hidden = expenses.length > 0;
  totalBox.textContent = formatRand(totalCents(shown));
  exportButton.disabled = shown.length === 0;
  renderCategories(shown);

  for (const expense of sortNewestFirst(shown)) {
    const item = document.createElement("li");
    item.className = "expense";

    const info = document.createElement("div");
    info.className = "expense__info";

    // textContent treats everything as plain text, so typed HTML or scripts
    // can never run. This prevents XSS (cross-site scripting).
    const title = document.createElement("strong");
    title.textContent = expense.description;

    const meta = document.createElement("span");
    meta.textContent = `${expense.category} \u00b7 ${formatDate(expense.date)}`;

    info.append(title, meta);

    const amount = document.createElement("span");
    amount.className = "expense__amount";
    amount.textContent = formatRand(expense.amountCents);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "expense__delete";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Delete ${expense.description}`);
    remove.addEventListener("click", () => removeExpense(expense.id));

    item.append(info, amount, remove);
    list.append(item);
  }
}

function removeExpense(id) {
  if (!window.confirm("Delete this expense?")) return;
  expenses = expenses.filter((expense) => expense.id !== id);
  saveExpenses();
  render();
  status.textContent = "Expense deleted.";
}

// ---------- Month filter and CSV export ----------

monthFilter.addEventListener("change", () => {
  selectedMonth = monthFilter.value;
  render();
});

function exportCsv() {
  const shown = visibleExpenses();
  if (shown.length === 0) return;

  // The leading \uFEFF lets Excel read accented characters correctly.
  const blob = new Blob(["\uFEFF", toCsv(shown)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `expenses-${selectedMonth}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  status.textContent = `Exported ${shown.length} expense${shown.length === 1 ? "" : "s"} to CSV.`;
}

exportButton.addEventListener("click", exportCsv);

// ---------- The form ----------

// Start with today's date, and do not allow future dates.
fields.date.value = todayString();
fields.date.max = todayString();

function showErrors(problems) {
  for (const name of Object.keys(errorBoxes)) {
    const message = problems[name] || "";
    errorBoxes[name].textContent = message;
    fields[name].classList.toggle("invalid", message !== "");
    fields[name].setAttribute("aria-invalid", message !== "" ? "true" : "false");
  }
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

form.addEventListener("submit", (event) => {
  event.preventDefault(); // stop the page from reloading

  const values = {
    description: fields.description.value,
    amount: fields.amount.value,
    date: fields.date.value,
  };

  const problems = validateExpense(values);
  showErrors(problems);

  const firstProblem = Object.keys(problems)[0];
  if (firstProblem) {
    status.textContent = "";
    fields[firstProblem].focus();
    return;
  }

  const expense = {
    id: makeId(),
    description: values.description.trim(),
    amountCents: toCents(values.amount),
    category: fields.category.value,
    date: values.date,
  };

  expenses.push(expense);
  saveExpenses();
  render();

  status.textContent = `Added: ${expense.description} (${formatRand(expense.amountCents)})`;
  fields.description.value = "";
  fields.amount.value = "";
  fields.description.focus();
});

// Clear a field's error as soon as the user starts fixing it.
for (const name of Object.keys(errorBoxes)) {
  fields[name].addEventListener("input", () => {
    errorBoxes[name].textContent = "";
    fields[name].classList.remove("invalid");
    fields[name].setAttribute("aria-invalid", "false");
  });
}

render();