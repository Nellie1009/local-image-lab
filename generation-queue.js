(function initGenerationQueue(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GenerationQueue = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createGenerationQueueApi() {
  function snapshotGenerationTask(task = {}) {
    return {
      ...task,
      selectedModels: [...(task.selectedModels || [])],
      sourceImages: [...(task.sourceImages || [])],
      sharedPayload: { ...(task.sharedPayload || {}) },
      savedPromptMetadata: task.savedPromptMetadata
        ? { ...task.savedPromptMetadata }
        : null
    };
  }

  function createGenerationQueue(options = {}) {
    if (typeof options.worker !== "function") {
      throw new TypeError("generation queue requires a worker");
    }

    const pending = [];
    const idleWaiters = [];
    let running = false;
    let scheduled = false;

    const getState = () => ({
      running: running ? 1 : 0,
      pending: pending.length
    });

    const notify = () => options.onStateChange?.(getState());

    const resolveIdle = () => {
      if (running || pending.length) return;
      idleWaiters.splice(0).forEach((resolve) => resolve());
    };

    async function drain() {
      scheduled = false;
      if (running) return;
      const task = pending.shift();
      if (!task) {
        notify();
        resolveIdle();
        return;
      }

      running = true;
      notify();
      try {
        await options.worker(task);
      } catch (error) {
        options.onTaskError?.(error, task);
      } finally {
        running = false;
        notify();
        schedule();
      }
    }

    function schedule() {
      if (scheduled || running) return;
      scheduled = true;
      Promise.resolve().then(drain);
    }

    return {
      enqueue(task) {
        const snapshot = snapshotGenerationTask(task);
        pending.push(snapshot);
        notify();
        schedule();
        return snapshot;
      },
      getState,
      whenIdle() {
        if (!running && !pending.length) return Promise.resolve();
        return new Promise((resolve) => idleWaiters.push(resolve));
      }
    };
  }

  return { createGenerationQueue, snapshotGenerationTask };
});

