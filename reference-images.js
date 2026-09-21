(function initReferenceImages(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ReferenceImages = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createReferenceImagesApi() {
  const SUPPORTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

  function isSupportedImage(file) {
    return Boolean(file && SUPPORTED_TYPES.has(String(file.type || "").toLowerCase()));
  }

  function extractImageFiles(source = {}) {
    if (source.items) {
      return [...source.items]
        .filter((item) => item.kind === "file" && String(item.type || "").startsWith("image/"))
        .map((item) => item.getAsFile?.())
        .filter(isSupportedImage);
    }
    return [...(source.files || [])].filter(isSupportedImage);
  }

  function createFileKey(file) {
    return `${file.name || "clipboard-image"}::${file.size || 0}::${file.lastModified || 0}`;
  }

  function appendUniqueImages(currentEntries = [], incomingFiles = []) {
    const next = [...currentEntries];
    const keys = new Set(next.map((entry) => entry.key));
    incomingFiles.filter(isSupportedImage).forEach((file) => {
      const key = createFileKey(file);
      if (keys.has(key)) return;
      keys.add(key);
      next.push({ key, file });
    });
    return next;
  }

  return { appendUniqueImages, createFileKey, extractImageFiles, isSupportedImage };
});

