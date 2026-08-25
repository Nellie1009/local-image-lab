const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildComparisonExportTable,
  getExportRecordKey
} = require("../comparison-export.js");

test("uses the persistent result id as the cross-page selection key", () => {
  assert.equal(getExportRecordKey({ resultId: "result-42", id: 7 }), "result-42");
  assert.equal(getExportRecordKey({ id: 7 }), "history-7");
});

test("aligns selected model outputs by generation batch and image index", () => {
  const table = buildComparisonExportTable([
    {
      resultId: "gpt-1",
      comparisonId: "batch-a",
      prompt: "一只猫",
      model: "gpt-image-2",
      batchIndex: 0,
      src: "data:image/png;base64,gpt1",
      createdAt: 1
    },
    {
      resultId: "gemini-1",
      comparisonId: "batch-a",
      prompt: "一只猫",
      model: "gemini-3-pro-image-preview",
      batchIndex: 0,
      src: "data:image/png;base64,gemini1",
      createdAt: 2
    },
    {
      resultId: "gpt-2",
      comparisonId: "batch-a",
      prompt: "一只猫",
      model: "gpt-image-2",
      batchIndex: 1,
      src: "data:image/png;base64,gpt2",
      createdAt: 3
    },
    {
      resultId: "other-1",
      comparisonId: "batch-b",
      prompt: "一片海",
      model: "gpt-image-2",
      batchIndex: 0,
      src: "data:image/png;base64,other1",
      createdAt: 4
    }
  ]);

  assert.deepEqual(table.models, ["gpt-image-2", "gemini-3-pro-image-preview"]);
  assert.equal(table.rows.length, 3);
  assert.deepEqual(
    table.rows.map((row) => ({
      prompt: row.prompt,
      index: row.index,
      gpt: row.images["gpt-image-2"]?.resultId,
      gemini: row.images["gemini-3-pro-image-preview"]?.resultId
    })),
    [
      { prompt: "一只猫", index: 1, gpt: "gpt-1", gemini: "gemini-1" },
      { prompt: "一只猫", index: 2, gpt: "gpt-2", gemini: undefined },
      { prompt: "一片海", index: 1, gpt: "other-1", gemini: undefined }
    ]
  );
});

test("keeps legacy history records with the same prompt in one export group", () => {
  const table = buildComparisonExportTable([
    { id: 1, prompt: "旧记录", model: "dall-e-3", batchIndex: 0, createdAt: 1 },
    { id: 2, prompt: "旧记录", model: "gemini-2.5-flash-image", batchIndex: 0, createdAt: 2 }
  ]);

  assert.equal(table.rows.length, 1);
  assert.equal(table.rows[0].images["dall-e-3"].id, 1);
  assert.equal(table.rows[0].images["gemini-2.5-flash-image"].id, 2);
});

test("the page preserves selection data in history and wires the Excel exporter", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

  assert.match(html, /<script src="comparison-export\.js"><\/script>/);
  assert.match(html, /<script src="vendor\/exceljs\.min\.js"><\/script>/);
  assert.match(html, /resultId:/);
  assert.match(html, /comparisonId:/);
  assert.match(html, /exportSelectedImagesToExcel/);
  assert.match(html, /createExportSelectionToggle/);
  assert.match(html, /id="export-selection-history"/);
  assert.doesNotMatch(html, /id="export-selection-home"/);
});
