const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  BUILT_IN_SAVED_PROMPTS,
  createSavedPromptRecord,
  migrateLegacyPromptEntries,
  resolveSavedPromptSelection
} = require("../prompt-library.js");

test("choosing a saved prompt fills the editable input and clicking it again deselects without clearing text", () => {
  const selected = resolveSavedPromptSelection("", "y2k", "用户补充", "保存模板");
  assert.deepEqual(selected, { selectedPromptId: "y2k", prompt: "保存模板" });

  const deselected = resolveSavedPromptSelection(
    selected.selectedPromptId,
    "y2k",
    "保存模板\n\n用户自行补充并编辑",
    "保存模板"
  );
  assert.deepEqual(deselected, {
    selectedPromptId: "",
    prompt: "保存模板\n\n用户自行补充并编辑"
  });
});

test("choosing another saved prompt replaces the editable input with its text", () => {
  assert.deepEqual(
    resolveSavedPromptSelection("y2k", "travel", "已编辑的文本", "旅行模板"),
    { selectedPromptId: "travel", prompt: "旅行模板" }
  );
});

test("ships four direct image prompts without skill frontmatter", () => {
  const prompts = Object.values(BUILT_IN_SAVED_PROMPTS);
  assert.equal(prompts.length, 4);
  prompts.forEach((prompt) => {
    assert.ok(prompt.name);
    assert.ok(prompt.description);
    assert.ok(prompt.content.length > 300);
    assert.equal(/^---\s*\nname:/m.test(prompt.content), false);
    assert.equal(/请按以下 skill 指令|Skill:/i.test(prompt.content), false);
  });
});

test("migrates browser-saved custom skills without deleting their content", () => {
  const migrated = migrateLegacyPromptEntries({
    "old-prompt": {
      name: "old-prompt",
      label: "旧样式",
      description: "旧说明",
      content: "保留这段旧内容",
      sourceUrl: "https://example.com/source",
      isCustom: true
    }
  });

  assert.deepEqual(migrated, {
    "old-prompt": {
      id: "old-prompt",
      name: "old-prompt",
      label: "旧样式",
      description: "旧说明",
      content: "保留这段旧内容",
      sourceUrl: "https://example.com/source",
      isCustom: true,
      migratedFromSkill: true
    }
  });
});

test("creates a named browser-saved prompt with stable metadata", () => {
  assert.deepEqual(
    createSavedPromptRecord("  夜景海报  ", "  霓虹城市夜景  ", "custom-123", "2026-08-21T00:00:00.000Z"),
    {
      id: "custom-123",
      name: "夜景海报",
      label: "自定义",
      description: "霓虹城市夜景",
      previewText: "霓虹城市夜景",
      content: "霓虹城市夜景",
      isCustom: true,
      addedAt: "2026-08-21T00:00:00.000Z"
    }
  );
});

test("the page uses saved prompts in the generation request", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

  assert.match(html, /<script src="prompt-library\.js"><\/script>/);
  assert.match(html, /保存的 Prompt/);
  assert.match(html, /saved_prompt:/);
  assert.match(html, /resolveSavedPromptSelection/);
  assert.match(html, /const prompt = String\(userPrompt \|\| ""\)\.trim\(\)/);
  assert.match(html, /prompt,\s*metadata: savedPrompt/);
  assert.match(html, /const selection = PromptLibrary\.resolveSavedPromptSelection/);
  assert.match(html, /promptInput\.value = selection\.prompt/);
  assert.doesNotMatch(html, /handleAddPromptSkillFromGithub/);
  assert.doesNotMatch(html, /buildPromptWithSkill/);
});
