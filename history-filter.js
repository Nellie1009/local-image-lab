(function initHistoryFilter(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HistoryFilter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createHistoryFilterApi() {
  function getValidDate(now) {
    const date = now instanceof Date ? new Date(now.getTime()) : new Date(now ?? Date.now());
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getRangeStart(range, now = new Date()) {
    if (range === "all") return null;
    const date = getValidDate(now);
    if (!date) return null;

    let year = date.getFullYear();
    let month = date.getMonth();
    let day = date.getDate();
    if (range === "7days") {
      const start = new Date(year, month, day);
      start.setDate(start.getDate() - 6);
      return start.getTime();
    }
    if (range === "1month") {
      month -= 1;
      if (month < 0) {
        month = 11;
        year -= 1;
      }
      day = Math.min(day, new Date(year, month + 1, 0).getDate());
    } else if (range !== "today") {
      return null;
    }

    return new Date(year, month, day).getTime();
  }

  function filterRecords(records, range = "all", now = new Date()) {
    const list = Array.isArray(records) ? records : [];
    if (range === "all") return list.slice();
    const start = getRangeStart(range, now);
    if (start == null) return list.slice();
    const end = getValidDate(now)?.getTime();
    if (end == null) return list.slice();
    return list.filter((record) => {
      if (record?.createdAt == null) return false;
      const timestamp = new Date(record.createdAt).getTime();
      return Number.isFinite(timestamp) && timestamp >= start && timestamp <= end;
    });
  }

  return { filterRecords, getRangeStart };
});
