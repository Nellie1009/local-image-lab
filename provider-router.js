(function initProviderRouter(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ProviderRouter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createProviderRouterApi() {
  function roundCurrency(value) {
    return Math.round((Number(value) + Number.EPSILON) * 1000000) / 1000000;
  }

  function estimatePrice(group, input) {
    const count = Math.max(1, Number(input.count) || 1);
    if (group.billingType === "per_request") {
      const multipliers = group.qualityMultipliers || {};
      const multiplier = Number(multipliers[input.quality]) || 1;
      return roundCurrency(Number(group.basePrice) * multiplier * count);
    }
    if (group.billingType === "per_image") {
      const references = Math.max(0, Number(input.referenceImageCount) || 0);
      const paidReferences = Math.max(0, references - (Number(group.freeReferenceImages) || 0));
      return roundCurrency(
        (Number(group.outputImagePrice) || 0) * count
        + (Number(group.referenceImagePrice) || 0) * paidReferences
      );
    }
    return null;
  }

  function buildCandidates(input = {}) {
    const catalog = input.catalog;
    const model = catalog?.modelsById?.get(input.modelId);
    if (!model) return [];
    const capability = input.isEdit ? "edit" : "generate";
    if (!model.capabilities?.[capability]) return [];

    const credentials = Array.isArray(input.credentials) ? input.credentials : [];
    const mappings = catalog.mappingsByModelId.get(input.modelId) || [];
    const candidates = [];

    mappings.forEach((mapping) => {
      const provider = catalog.providersById.get(mapping.providerId);
      if (!provider) return;
      credentials.forEach((credential, credentialOrder) => {
        if (credential.providerId !== provider.id || credential.status !== "active") return;
        const endpointId = credential.endpointId || provider.defaultEndpointId;
        const endpoint = provider.endpointsById.get(endpointId);
        const priceEntry = catalog.pricesByProviderModel.get(`${provider.id}:${model.id}`);
        const groupId = credential.priceGroupId || provider.defaultPriceGroupId || "default";
        const priceGroup = priceEntry?.groupsById.get(groupId);
        if (!endpoint || !priceGroup) return;
        candidates.push({
          provider,
          model,
          mapping,
          credential,
          endpoint,
          priceGroup,
          billingType: priceGroup.billingType,
          estimatedPrice: estimatePrice(priceGroup, input),
          availabilityPercent: priceGroup.availabilityPercent ?? null,
          credentialOrder
        });
      });
    });

    candidates.sort((a, b) => {
      const aUnavailable = a.availabilityPercent === 0 ? 1 : 0;
      const bUnavailable = b.availabilityPercent === 0 ? 1 : 0;
      if (aUnavailable !== bUnavailable) return aUnavailable - bUnavailable;

      const aKnownPrice = Number.isFinite(a.estimatedPrice) ? 0 : 1;
      const bKnownPrice = Number.isFinite(b.estimatedPrice) ? 0 : 1;
      if (aKnownPrice !== bKnownPrice) return aKnownPrice - bKnownPrice;
      if (!aKnownPrice && a.estimatedPrice !== b.estimatedPrice) {
        return a.estimatedPrice - b.estimatedPrice;
      }

      const aAvailability = Number.isFinite(a.availabilityPercent) ? a.availabilityPercent : -1;
      const bAvailability = Number.isFinite(b.availabilityPercent) ? b.availabilityPercent : -1;
      if (aAvailability !== bAvailability) return bAvailability - aAvailability;
      if (a.provider.providerOrder !== b.provider.providerOrder) {
        return a.provider.providerOrder - b.provider.providerOrder;
      }
      return a.credentialOrder - b.credentialOrder;
    });
    return candidates;
  }

  function classifyProviderError(error, provider = {}) {
    const config = provider.quotaErrors || {};
    const statuses = Array.isArray(config.statusCodes) ? config.statusCodes.map(Number) : [];
    if (statuses.includes(Number(error?.status))) return "quota";
    const message = String(error?.message || "").toLowerCase();
    const matches = (config.messagePatterns || []).some((pattern) =>
      message.includes(String(pattern).toLowerCase())
    );
    return matches ? "quota" : "other";
  }

  async function runWithCredentialFallback(candidates, requestCandidate, onExhausted) {
    const list = Array.isArray(candidates) ? candidates : [];
    if (!list.length) throw new Error("这个模型没有可用的 API Key。");
    const failedCandidates = [];
    let lastError;

    for (const candidate of list) {
      try {
        const value = await requestCandidate(candidate);
        return { value, candidate, failedCandidates };
      } catch (error) {
        lastError = error;
        if (classifyProviderError(error, candidate.provider) !== "quota") throw error;
        failedCandidates.push(candidate);
        await onExhausted?.(candidate.credential, error, candidate);
      }
    }

    if (lastError) {
      lastError.failedCandidates = failedCandidates;
      throw lastError;
    }
    throw new Error("这个模型没有可用的 API Key。");
  }

  return {
    buildCandidates,
    classifyProviderError,
    estimatePrice,
    runWithCredentialFallback
  };
});
