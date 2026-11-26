"use strict";

// Pure functions with no page code in them, so they are easy to test.

const MAX_AMOUNT = 1000000;

const CATEGORIES = [
  "Food", "Transport", "Airtime & data", "Education",
  "Entertainment", "Health", "Other",
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Today's date as YYYY-MM-DD, in the user's own time zone. */
function todayString(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Check the form values. Returns an object of error messages (empty = all good). */
function validateExpense(values, today = todayString()) {
  const problems = {};

  const description = values.description.trim();
  if (description === "") {
    problems.description = "Please enter a description.";
  } else if (description.length < 2) {
    problems.description = "The description must be at least 2 characters.";
  }

  const amountText = values.amount.trim();
  if (amountText === "") {
    problems.amount = "Please enter an amount.";
  } else if (!/^\d+(\.\d{1,2})?$/.test(amountText)) {
    problems.amount = "Use a positive amount with at most two decimals, like 45.50.";
  } else if (Number(amountText) === 0) {
    problems.amount = "The amount must be more than zero.";
  } else if (Number(amountText) > MAX_AMOUNT) {
    problems.amount = "The amount cannot be more than R1,000,000.";
  }

  if (values.date === "") {
    problems.date = "Please choose a date.";
  } else if (values.date > today) {
    problems.date = "The date cannot be in the future.";
  }

  return problems;
}

/** Money is stored in cents (whole numbers) to avoid decimal rounding errors. */
function toCents(amountText) {
  return Math.round(Number(amountText.trim()) * 100);
}

/** 123456 -> "R1,234.56" */
function formatRand(cents) {
  const rands = cents / 100;
  return "R" + rands.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "2026-11-20" -> "20 Nov 2026" */
function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

/** Sum of all expenses, in cents. */
function totalCents(expenses) {
  return expenses.reduce((sum, expense) => sum + expense.amountCents, 0);
}

/** Newest date first. For the same date, the expense added last comes first. */
function sortNewestFirst(expenses) {
  return expenses
    .map((expense, index) => ({ expense, index }))
    .sort((a, b) => b.expense.date.localeCompare(a.expense.date) || b.index - a.index)
    .map((entry) => entry.expense);
}

/** Is this object a well-formed expense? Stored data is untrusted, so check it all. */
function isValidExpense(item) {
  return (
    item !== null &&
    typeof item === "object" &&
    typeof item.id === "string" && item.id.length > 0 && item.id.length <= 40 &&
    typeof item.description === "string" &&
    item.description.trim().length >= 2 && item.description.length <= 60 &&
    Number.isInteger(item.amountCents) &&
    item.amountCents > 0 && item.amountCents <= MAX_AMOUNT * 100 &&
    CATEGORIES.includes(item.category) &&
    typeof item.date === "string" && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(item.date)
  );
}

/** Turn saved text back into expenses, dropping anything broken or tampered with. */
function parseStoredExpenses(text) {
  if (!text) return [];
  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) return [];
    return data.filter(isValidExpense).map((item) => ({
      id: item.id,
      description: item.description.trim(),
      amountCents: item.amountCents,
      category: item.category,
      date: item.date,
    }));
  } catch (error) {
    return [];
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    validateExpense, toCents, formatRand, todayString, formatDate, totalCents,
    sortNewestFirst, isValidExpense, parseStoredExpenses, MAX_AMOUNT, CATEGORIES,
  };
}