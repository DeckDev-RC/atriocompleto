/**
 * Tests for SQL sanitization helpers used in query-functions and dashboard.
 * Uses Node.js built-in test runner (node:test).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Replicate sanitization helpers from query-functions.ts ──
// These are pure functions extracted for testing.

function escapeSQL(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function escapeLike(value: string): string {
  return escapeSQL(value).replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function isSafeIdentifier(value: string): boolean {
  return /^[\p{L}\p{N}\s\-_.,()]+$/u.test(value) && value.length <= 100;
}

function safeDate(dateStr: string): string {
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return dateStr;
  const lastDay = new Date(year, month, 0).getDate();
  const clampedDay = Math.min(day, lastDay);
  return `${yearStr}-${monthStr}-${String(clampedDay).padStart(2, "0")}`;
}

// ── Tests ────────────────────────────────────────────────

describe("escapeSQL", () => {
  it("should escape single quotes", () => {
    assert.equal(escapeSQL("O'Reilly"), "O''Reilly");
  });

  it("should escape backslashes", () => {
    assert.equal(escapeSQL("path\\to"), "path\\\\to");
  });

  it("should handle combined escapes", () => {
    assert.equal(escapeSQL("it's a\\test"), "it''s a\\\\test");
  });

  it("should pass through safe strings", () => {
    assert.equal(escapeSQL("simple text"), "simple text");
  });
});

describe("escapeLike", () => {
  it("should escape LIKE wildcards", () => {
    assert.equal(escapeLike("100%"), "100\\%");
    assert.equal(escapeLike("test_value"), "test\\_value");
  });

  it("should escape quotes AND wildcards combined", () => {
    assert.equal(escapeLike("O'Brien_100%"), "O''Brien\\_100\\%");
  });
});

describe("isSafeIdentifier", () => {
  it("should accept normal marketplace/status names", () => {
    assert.equal(isSafeIdentifier("Mercado Livre"), true);
    assert.equal(isSafeIdentifier("paid"), true);
    assert.equal(isSafeIdentifier("Shopee Brasil"), true);
    assert.equal(isSafeIdentifier("cancelled"), true);
  });

  it("should accept accented characters", () => {
    assert.equal(isSafeIdentifier("São Paulo"), true);
    assert.equal(isSafeIdentifier("Próximo Nível"), true);
  });

  it("should reject SQL injection patterns", () => {
    assert.equal(isSafeIdentifier("'; DROP TABLE orders;--"), false);
    assert.equal(isSafeIdentifier("1' OR '1'='1"), false);
    assert.equal(isSafeIdentifier("admin'--"), false);
  });

  it("should reject strings with special SQL characters", () => {
    assert.equal(isSafeIdentifier("test;select"), false);
    assert.equal(isSafeIdentifier("name=value"), false);
    assert.equal(isSafeIdentifier("test\x00null"), false);
  });

  it("should reject strings over 100 characters", () => {
    const longString = "a".repeat(101);
    assert.equal(isSafeIdentifier(longString), false);
  });

  it("should accept strings of exactly 100 characters", () => {
    const exact100 = "a".repeat(100);
    assert.equal(isSafeIdentifier(exact100), true);
  });
});

describe("safeDate", () => {
  it("should pass through valid dates", () => {
    assert.equal(safeDate("2025-01-15"), "2025-01-15");
    assert.equal(safeDate("2024-12-31"), "2024-12-31");
  });

  it("should clamp invalid day to last day of month", () => {
    assert.equal(safeDate("2025-02-30"), "2025-02-28");
    assert.equal(safeDate("2024-02-30"), "2024-02-29"); // leap year
    assert.equal(safeDate("2025-04-31"), "2025-04-30");
  });

  it("should handle leap year correctly", () => {
    assert.equal(safeDate("2024-02-29"), "2024-02-29"); // valid leap
    assert.equal(safeDate("2025-02-29"), "2025-02-28"); // not a leap year
  });
});
