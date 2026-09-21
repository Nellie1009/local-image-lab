const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const modulePath = path.join(__dirname, "..", "generation-queue.js");

test("generation submissions keep their own snapshot and run one batch at a time", async () => {
  assert.equal(fs.existsSync(modulePath), true, "generation-queue.js should exist");
  const { createGenerationQueue } = require(modulePath);
  const seen = [];
  const states = [];
  let active = 0;
  let maxActive = 0;
  let releaseFirst;

  const queue = createGenerationQueue({
    worker: async (task) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      seen.push({
        prompt: task.sharedPayload.prompt,
        model: task.selectedModels[0],
        image: task.sourceImages[0].name
      });
      if (seen.length === 1) {
        await new Promise((resolve) => { releaseFirst = resolve; });
      }
      active -= 1;
    },
    onStateChange: (state) => states.push({ ...state })
  });

  const first = {
    selectedModels: ["model-a"],
    sourceImages: [{ name: "first.png" }],
    sharedPayload: { prompt: "first prompt" }
  };
  const second = {
    selectedModels: ["model-b"],
    sourceImages: [{ name: "second.png" }],
    sharedPayload: { prompt: "second prompt" }
  };

  queue.enqueue(first);
  queue.enqueue(second);
  first.selectedModels[0] = "changed-model";
  first.sourceImages[0] = { name: "changed.png" };
  first.sharedPayload.prompt = "changed prompt";

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(seen, [{ prompt: "first prompt", model: "model-a", image: "first.png" }]);
  assert.deepEqual(queue.getState(), { running: 1, pending: 1 });

  releaseFirst();
  await queue.whenIdle();

  assert.equal(maxActive, 1);
  assert.deepEqual(seen, [
    { prompt: "first prompt", model: "model-a", image: "first.png" },
    { prompt: "second prompt", model: "model-b", image: "second.png" }
  ]);
  assert.deepEqual(queue.getState(), { running: 0, pending: 0 });
  assert.ok(states.some((state) => state.running === 1 && state.pending === 1));
});

