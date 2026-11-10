const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { filterRecords, getRangeStart } = require("../history-filter.js");

test("today and 7-day ranges start at local calendar midnight", () => {
  const now = new Date(2026, 10, 10, 15, 45, 30);

  assert.equal(getRangeStart("today", now), new Date(2026, 10, 10).getTime());
  assert.equal(getRangeStart("7days", now), new Date(2026, 10, 4).getTime());
});

test("one-month range clamps to the last day of the previous calendar month", () => {
  const now = new Date(2025, 2, 31, 12, 0);

  assert.equal(getRangeStart("1month", now), new Date(2025, 1, 28).getTime());
});

test("time filters include the exact cutoff and exclude invalid or older timestamps", () => {
  const cutoff = new Date(2026, 10, 4).getTime();
  const records = [
    { id: "new", createdAt: cutoff + 1 },
    { id: "cutoff", createdAt: cutoff },
    { id: "old", createdAt: cutoff - 1 },
    { id: "invalid", createdAt: "not-a-date" },
    { id: "missing" }
  ];

  assert.deepEqual(
    filterRecords(records, "7days", new Date(2026, 10, 10, 8, 0)).map((record) => record.id),
    ["new", "cutoff"]
  );
});

test("time filters exclude records after the current time", () => {
  const now = new Date(2026, 10, 10, 8, 0).getTime();
  const records = [
    { id: "now", createdAt: now },
    { id: "future", createdAt: now + 60 * 60 * 1000 }
  ];

  assert.deepEqual(filterRecords(records, "today", new Date(now)).map((record) => record.id), ["now"]);
});

test("all range returns every record unchanged and in its original order", () => {
  const records = [{ id: "invalid", createdAt: null }, { id: "new", createdAt: Date.now() }];

  assert.deepEqual(filterRecords(records, "all"), records);
  assert.equal(getRangeStart("all", new Date(2026, 10, 10)), null);
});

test("history page exposes all time ranges and loads filtering before the app script", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const filterScript = html.indexOf('<script src="history-filter.js"></script>');
  const appScript = html.indexOf("<script>\n    const form");

  assert.notEqual(filterScript, -1);
  assert.ok(filterScript < appScript);
  assert.match(html, /<select[^>]+id="history-time-filter"/);
  assert.match(html, /<option value="today">今天<\/option>/);
  assert.match(html, /<option value="7days">7天<\/option>/);
  assert.match(html, /<option value="1month">1个月<\/option>/);
  assert.match(html, /<option value="all" selected>全部<\/option>/);
  assert.match(html, /HistoryFilter\.filterRecords/);
});
