const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const modulePath = path.join(__dirname, "..", "reference-images.js");

test("drag and clipboard inputs append supported images without replacing earlier files", () => {
  assert.equal(fs.existsSync(modulePath), true, "reference-images.js should exist");
  const { appendUniqueImages, extractImageFiles } = require(modulePath);
  const oldImage = { name: "old.png", type: "image/png", size: 10, lastModified: 1 };
  const newImage = { name: "new.webp", type: "image/webp", size: 20, lastModified: 2 };
  const textFile = { name: "notes.txt", type: "text/plain", size: 5, lastModified: 3 };
  const source = {
    items: [
      { kind: "file", type: "image/webp", getAsFile: () => newImage },
      { kind: "file", type: "text/plain", getAsFile: () => textFile },
      { kind: "string", type: "text/plain", getAsFile: () => null }
    ]
  };

  assert.deepEqual(extractImageFiles(source), [newImage]);
  const result = appendUniqueImages(
    [{ key: "old.png::10::1", file: oldImage }],
    [newImage, oldImage, textFile]
  );
  assert.deepEqual(result.map((entry) => entry.file.name), ["old.png", "new.webp"]);
});

