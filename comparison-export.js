(function initComparisonExport(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ComparisonExport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createComparisonExportApi() {
  function getExportRecordKey(record) {
    if (record?.resultId) return String(record.resultId);
    if (record?.id != null) return `history-${record.id}`;
    return "";
  }

  function getGroupKey(record) {
    if (record?.comparisonId) return `batch:${record.comparisonId}`;
    return `legacy:${String(record?.prompt || "")}`;
  }

  function getSafeIndex(value) {
    const index = Number(value);
    return Number.isInteger(index) && index >= 0 ? index : 0;
  }

  function sanitizeRecord(record) {
    const {
      secret: _secret,
      apiKey: _apiKey,
      credentialSecret: _credentialSecret,
      routingAttempts: _routingAttempts,
      ...safe
    } = record;
    return safe;
  }

  function joinUnique(values) {
    return [...new Set(values.filter(Boolean).map(String))].join(" / ");
  }

  function formatEstimatedPrice(record) {
    if (Number.isFinite(record.estimatedPrice)) {
      return `¥${Number(record.estimatedPrice).toFixed(3)}`;
    }
    if (record.billingType === "per_token") return "按 token 计费";
    return "";
  }

  function summarizeImages(images) {
    const records = Object.values(images || {});
    return {
      platforms: joinUnique(records.map((record) =>
        record.providerName || record.provider || record.providerId
      )),
      priceGroups: joinUnique(records.map((record) => record.priceGroupId)),
      estimatedPrices: joinUnique(records.map(formatEstimatedPrice))
    };
  }

  function buildComparisonExportTable(records) {
    const models = [];
    const seenModels = new Set();
    const groups = new Map();

    (Array.isArray(records) ? records : []).forEach((record) => {
      if (!record?.model) return;
      if (!seenModels.has(record.model)) {
        seenModels.add(record.model);
        models.push(record.model);
      }

      const groupKey = getGroupKey(record);
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          prompt: String(record.prompt || ""),
          rowsByIndex: new Map()
        });
      }
      const group = groups.get(groupKey);
      let index = getSafeIndex(record.batchIndex);
      while (group.rowsByIndex.get(index)?.[record.model]) index += 1;
      if (!group.rowsByIndex.has(index)) group.rowsByIndex.set(index, {});
      group.rowsByIndex.get(index)[record.model] = sanitizeRecord(record);
    });

    const rows = [];
    groups.forEach((group) => {
      [...group.rowsByIndex.keys()]
        .sort((a, b) => a - b)
        .forEach((index) => {
          const images = group.rowsByIndex.get(index);
          rows.push({
            prompt: group.prompt,
            index: index + 1,
            images,
            ...summarizeImages(images)
          });
        });
    });

    return { models, rows };
  }

  return {
    buildComparisonExportTable,
    getExportRecordKey
  };
});
