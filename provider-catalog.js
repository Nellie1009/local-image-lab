(function initProviderCatalog(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ProviderCatalog = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createProviderCatalogApi() {
  const ADAPTER_IDS = new Set(["openai-images", "gemini-native", "ark-images"]);

  async function loadCatalogs(fetchImpl = globalThis.fetch, rootPath = "data") {
    if (typeof fetchImpl !== "function") throw new Error("当前环境不支持加载目录文件。");
    const names = ["providers", "models", "pricing"];
    const values = await Promise.all(names.map(async (name) => {
      const response = await fetchImpl(`${rootPath}/${name}.json`, { cache: "no-store" });
      if (!response.ok) throw new Error(`${name}.json 加载失败：HTTP ${response.status}`);
      try {
        return await response.json();
      } catch (error) {
        throw new Error(`${name}.json 解析失败：${error?.message || error}`);
      }
    }));
    const raw = Object.fromEntries(names.map((name, index) => [name, values[index]]));
    const errors = validateCatalogs(raw);
    if (errors.length) throw new Error(errors.join("\n"));
    return createCatalogIndex(raw);
  }

  function validateCatalogs(raw) {
    const errors = [];
    for (const name of ["providers", "models", "pricing"]) {
      if (raw?.[name]?.schemaVersion !== 1) {
        errors.push(`${name}.json: schemaVersion 必须为 1`);
      }
    }

    const providers = Array.isArray(raw?.providers?.providers) ? raw.providers.providers : [];
    const models = Array.isArray(raw?.models?.models) ? raw.models.models : [];
    const providerIds = new Set();
    const modelIds = new Set();

    for (const provider of providers) {
      if (!provider.id || providerIds.has(provider.id)) {
        errors.push(`providers.json: 平台 ID 缺失或重复：${provider.id || "(empty)"}`);
      }
      providerIds.add(provider.id);
    }

    for (const model of models) {
      if (!model.id || modelIds.has(model.id)) {
        errors.push(`models.json: 模型 ID 缺失或重复：${model.id || "(empty)"}`);
      }
      modelIds.add(model.id);
    }

    const mappedModelIds = new Set();
    for (const provider of providers) {
      const endpointIds = new Set();
      for (const endpoint of provider.endpoints || []) {
        if (!endpoint.id || endpointIds.has(endpoint.id)) {
          errors.push(`providers.json: ${provider.id} 的线路 ID 缺失或重复`);
        }
        endpointIds.add(endpoint.id);
      }
      if (!endpointIds.has(provider.defaultEndpointId)) {
        errors.push(`providers.json: ${provider.id} 缺少默认线路 ${provider.defaultEndpointId}`);
      }

      const mappingIds = new Set();
      for (const mapping of provider.modelMappings || []) {
        if (!modelIds.has(mapping.modelId)) {
          errors.push(`providers.json: ${provider.id} 引用了不存在的模型 ${mapping.modelId}`);
        }
        if (mappingIds.has(mapping.modelId)) {
          errors.push(`providers.json: ${provider.id} 重复映射模型 ${mapping.modelId}`);
        }
        if (!mapping.requestModel || !ADAPTER_IDS.has(mapping.adapter)) {
          errors.push(`providers.json: ${provider.id}/${mapping.modelId} 的请求映射无效`);
        }
        mappingIds.add(mapping.modelId);
        mappedModelIds.add(mapping.modelId);
      }
    }

    const pricedKeys = new Set();
    for (const source of raw?.pricing?.sources || []) {
      if (!providerIds.has(source.providerId)) {
        errors.push(`pricing.json: 引用了不存在的平台 ${source.providerId}`);
      }
      for (const pricedModel of source.models || []) {
        if (!modelIds.has(pricedModel.modelId)) {
          errors.push(`pricing.json: 引用了不存在的模型 ${pricedModel.modelId}`);
        }
        const priceKey = `${source.providerId}:${pricedModel.modelId}`;
        if (pricedKeys.has(priceKey)) {
          errors.push(`pricing.json: 重复价格条目 ${priceKey}`);
        }
        pricedKeys.add(priceKey);
        const groupIds = new Set();
        for (const group of pricedModel.groups || []) {
          if (!group.id || groupIds.has(group.id)) {
            errors.push(`pricing.json: ${pricedModel.modelId} 的价格分组缺失或重复`);
          }
          groupIds.add(group.id);
        }
        if (!groupIds.has("default")) {
          errors.push(`pricing.json: ${pricedModel.modelId} 缺少 default 分组`);
        }
      }
    }

    for (const modelId of modelIds) {
      if (!mappedModelIds.has(modelId)) errors.push(`providers.json: 模型 ${modelId} 没有平台映射`);
      const hasPrice = [...pricedKeys].some((key) => key.endsWith(`:${modelId}`));
      if (!hasPrice) errors.push(`pricing.json: 模型 ${modelId} 没有价格条目`);
    }
    return errors;
  }

  function createCatalogIndex(raw) {
    const providersById = new Map();
    const modelsById = new Map();
    const mappingsByModelId = new Map();
    const pricesByProviderModel = new Map();

    (raw.providers.providers || []).forEach((provider, providerOrder) => {
      const endpointsById = new Map((provider.endpoints || []).map((endpoint) => [endpoint.id, endpoint]));
      const indexedProvider = { ...provider, providerOrder, endpointsById };
      providersById.set(provider.id, indexedProvider);
      (provider.modelMappings || []).forEach((mapping, mappingOrder) => {
        const indexedMapping = { ...mapping, providerId: provider.id, providerOrder, mappingOrder };
        if (!mappingsByModelId.has(mapping.modelId)) mappingsByModelId.set(mapping.modelId, []);
        mappingsByModelId.get(mapping.modelId).push(indexedMapping);
      });
    });

    (raw.models.models || []).forEach((model, modelOrder) => {
      modelsById.set(model.id, { ...model, modelOrder });
    });

    (raw.pricing.sources || []).forEach((source) => {
      (source.models || []).forEach((pricedModel) => {
        const groupsById = new Map((pricedModel.groups || []).map((group) => [group.id, group]));
        pricesByProviderModel.set(`${source.providerId}:${pricedModel.modelId}`, {
          ...pricedModel,
          providerId: source.providerId,
          groupsById
        });
      });
    });

    return {
      raw,
      currency: raw.pricing.currency,
      updatedAt: raw.pricing.updatedAt,
      providersById,
      modelsById,
      mappingsByModelId,
      pricesByProviderModel
    };
  }

  function createModelConfigMap(index) {
    const configs = {};
    index.modelsById.forEach((model, modelId) => {
      const options = model.options || {};
      const limits = model.limits || {};
      configs[modelId] = {
        sizes: [...(options.sizes || [])],
        qualities: [...(options.qualities || [])],
        formats: [...(options.formats || [])],
        backgrounds: [...(options.backgrounds || [])],
        styles: [...(options.styles || [])],
        geminiResolutions: [...(options.geminiResolutions || [])],
        counts: [...(options.counts || ["1"])],
        supportsEdit: Boolean(model.capabilities?.edit),
        editMaxImages: Number(limits.editMaxImages || 0),
        editTypes: [...(limits.editTypes || [])],
        editMaxSizeMb: Number(limits.editMaxSizeMb || 0)
      };
    });
    return configs;
  }

  function getPriceRows(index, modelIds) {
    const selected = new Set(Array.isArray(modelIds) ? modelIds : []);
    const rows = [];
    index.mappingsByModelId.forEach((mappings, modelId) => {
      if (selected.size && !selected.has(modelId)) return;
      mappings.forEach((mapping) => {
        const provider = index.providersById.get(mapping.providerId);
        const model = index.modelsById.get(modelId);
        const priceEntry = index.pricesByProviderModel.get(`${mapping.providerId}:${modelId}`);
        priceEntry?.groupsById.forEach((group) => {
          rows.push({
            providerId: mapping.providerId,
            providerName: provider?.name || mapping.providerId,
            modelId,
            modelName: model?.displayName || modelId,
            groupId: group.id,
            groupName: group.name,
            billingType: group.billingType,
            availabilityPercent: group.availabilityPercent ?? null,
            estimatedPerRequest: group.billingType === "per_request"
              ? Number(group.basePrice)
              : group.billingType === "per_image"
                ? Number(group.outputImagePrice)
                : null,
            currency: index.currency,
            raw: group
          });
        });
      });
    });
    return rows;
  }

  return {
    createCatalogIndex,
    createModelConfigMap,
    getPriceRows,
    loadCatalogs,
    validateCatalogs
  };
});
