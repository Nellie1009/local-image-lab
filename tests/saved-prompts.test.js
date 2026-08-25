const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  BUILT_IN_SAVED_PROMPTS,
  composeSavedPrompt,
  createSavedPromptRecord,
  migrateLegacyPromptEntries
} = require("../prompt-library.js");

test("combines a saved prompt before the user's prompt", () => {
  assert.equal(
    composeSavedPrompt("  保存内容  ", "  用户补充  "),
    "保存内容\n\n用户补充要求：\n用户补充"
  );
});

test("uses either prompt by itself and returns empty when neither exists", () => {
  assert.equal(composeSavedPrompt("保存内容", ""), "保存内容");
  assert.equal(composeSavedPrompt("", "用户内容"), "用户内容");
  assert.equal(composeSavedPrompt("", ""), "");
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
  assert.doesNotMatch(html, /handleAddPromptSkillFromGithub/);
  assert.doesNotMatch(html, /buildPromptWithSkill/);
});
