(function initHistoryDetails(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HistoryDetails = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createHistoryDetailsApi() {
  function valueOrMissing(value) {
    return value === undefined || value === null || value === "" ? "未记录" : String(value);
  }

  function formatSavedPrompt(savedPrompt) {
    if (!savedPrompt) return "";
    const name = savedPrompt.name || savedPrompt.id || "保存的 Prompt";
    return savedPrompt.content ? `${name}\n${savedPrompt.content}` : name;
  }

  function buildHistoryDetails(record = {}, options = {}) {
    const parameters = record.generation_parameters || {};
    const date = Number.isFinite(record.createdAt) ? new Date(record.createdAt) : null;
    const dateOptions = options.timeZone ? { timeZone: options.timeZone, hour12: false } : undefined;
    const details = [
      { label: "模型", value: valueOrMissing(record.model) },
      { label: "平台", value: valueOrMissing(record.providerName || record.provider || record.providerId) },
      { label: "接口线路", value: valueOrMissing(record.endpointName || record.endpointId) }
    ];

    if (record.user_prompt) {
      details.push({ label: "主 Prompt", value: String(record.user_prompt), multiline: true });
    }
    if (record.saved_prompt) {
      details.push({ label: "保存的 Prompt", value: formatSavedPrompt(record.saved_prompt), multiline: true });
    }

    details.push(
      { label: "完整 Prompt", value: valueOrMissing(record.prompt), multiline: true },
      { label: "尺寸 / 比例", value: valueOrMissing(parameters.size) },
      { label: "质量", value: valueOrMissing(parameters.quality) },
      { label: "输出格式", value: valueOrMissing(parameters.output_format) }
    );
    if (parameters.style) details.push({ label: "风格", value: String(parameters.style) });
    details.push(
      { label: "背景", value: valueOrMissing(parameters.background) },
      { label: "Gemini 分辨率", value: valueOrMissing(parameters.gemini_resolution) },
      { label: "生成数量", value: valueOrMissing(parameters.n) },
      {
        label: "参考图",
        value: parameters.reference_images?.length ? parameters.reference_images.join("\n") : "未记录",
        multiline: true
      }
    );
    if (Number.isFinite(record.estimatedPrice)) {
      details.push({ label: "预计价格", value: `¥${Number(record.estimatedPrice).toFixed(3)}` });
    }
    details.push({
      label: "生成时间",
      value: date ? date.toLocaleString(options.locale || "zh-CN", dateOptions) : "未记录"
    });
    return details;
  }

  return { buildHistoryDetails };
});

