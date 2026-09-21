# 多平台生图路由与 12API 目录设计

日期：2026-09-22

## 目标

把当前由用户直接填写单个 Base URL 和 API Key 的生图台，改成以模型为入口的本地路由：用户只选择生图模型，页面根据项目内的平台、模型与价格目录，为每个模型选择可用的平台和本地 API Key。

第一期只接入 12API。后续平台由用户提供接口规范后再增加明确的适配器，不自动猜测未知接口。

项目仍只有两个页面：生成配置和生图历史。平台与 API Key 设置位于生成配置页的可折叠区域，不新增管理页。

## 范围

第一期包括：

- 项目内三份 JSON：`providers.json`、`models.json`、`pricing.json`。
- 12API 的三条线路和九个生图模型。
- 一个 12API Key 的本地保存，以及未来保存多个平台、多个 Key 的数据结构。
- 按模型能力、价格与 Key 状态选择候选请求。
- 明确余额不足时自动换 Key；耗尽的 Key 置灰并可手动恢复。
- 生成配置页内查看可读价格表和原始 JSON。
- 历史记录保存实际平台、线路、模型、Key 标签、计费信息和切换记录。

第一期不包括：

- 后端或云端密钥存储。
- 抓取平台价格、查询实时余额或自动同步可用度。
- 文本、视频、音频或仅支持图片输入的理解模型。
- 在不同模型之间自动替换。例如选择 `gemini-3.1-flash-image` 时，不会改用 `gemini-2.5-flash-image`。
- 因超时而自动向另一线路重复提交同一任务。图片请求可能已经被上游处理，未知超时下重放可能重复扣费。

## 文件边界

三份 JSON 是整个项目共享的目录，固定放在 `data/providers.json`、`data/models.json` 和 `data/pricing.json`。新增平台时向现有文件追加数据，不为每个平台复制一套文件。

### `providers.json`

保存请求层信息，不含价格、模型能力或 API Key。

```json
{
  "schemaVersion": 1,
  "providers": [
    {
      "id": "12api",
      "name": "12API",
      "defaultEndpointId": "cdn",
      "defaultPriceGroupId": "default",
      "endpoints": [
        {
          "id": "cdn",
          "name": "CDN 线路",
          "origin": "https://cdn.12ai.org",
          "recommended": true,
          "note": "文本及生图任务优先推荐"
        },
        {
          "id": "main",
          "name": "主线路",
          "origin": "https://new.12ai.org",
          "recommended": false,
          "note": "默认主站地址，可能遇到 Cloudflare 超时"
        },
        {
          "id": "direct",
          "name": "直连线路",
          "origin": "https://api.12ai.org",
          "recommended": false,
          "note": "直连无超时优化线路"
        }
      ],
      "adapters": ["openai-images", "gemini-native"],
      "quotaErrors": {
        "statusCodes": [402],
        "messagePatterns": ["余额不足", "额度不足", "insufficient quota", "insufficient balance"]
      }
    }
  ]
}
```

线路只确定请求的网络入口。12API 三条线路共享账户余额，因此线路切换不能解决余额不足。默认使用 CDN 线路；未知结果的超时不自动改线重放。

### `models.json`

保存模型身份、请求协议、参数能力和限制，不保存价格。

每个模型至少包含：

- `id`：页面和历史记录使用的稳定标识。
- `requestModel`：发送给 12API 的模型名。
- `providerId`：第一期均为 `12api`。
- `vendor`：OpenAI 或 Google。
- `adapter`：`openai-images` 或 `gemini-native`。
- `capabilities`：文生图、图生图、多参考图、透明背景等。
- `options`：质量、尺寸或宽高比、分辨率、数量。
- `limits`：参考图数量、类型和请求大小。
- `releaseDate`：仅记录用户提供的已知日期，未知时为 `null`。

第一期模型清单：

| 模型 ID | 协议 | 文生图 | 图生图 | 已知发布日期 |
| --- | --- | --- | --- | --- |
| `gpt-image-2.5-flare` | OpenAI Images | 是 | 是 | 2026-09-08 |
| `gpt-image-2.5-sunburst` | OpenAI Images | 是 | 是 | 2026-09-08 |
| `gpt-image-2` | OpenAI Images | 是 | 是 | 未提供 |
| `gemini-3.1-flash-lite-image` | Gemini Native | 是 | 是 | 2026-06-30 |
| `gemini-2.5-flash-image` | Gemini Native | 是 | 是 | 未提供 |
| `gemini-3-pro-image` | Gemini Native | 是 | 是 | 未提供 |
| `gemini-3-pro-image-preview` | Gemini Native | 是 | 是 | 未提供 |
| `gemini-3.1-flash-image` | Gemini Native | 是 | 是 | 未提供 |
| `gemini-3.1-flash-image-preview` | Gemini Native | 是 | 是 | 未提供 |

稳定版与 Preview 版是不同模型，不自动合并，也不在目录中互相改写。请求使用与模型 ID 相同的 `requestModel`，除非后续接口规范明确要求别名。

GPT Image 2.5 两个模型支持 `auto`、`low`、`medium`、`high`、`xhigh`、`max`。`gpt-image-2` 支持 `auto`、`low`、`medium`、`high`。三个 GPT Image 模型支持自定义尺寸、每次 1 至 8 张结果和最多 16 张参考图。

Gemini 模型能力沿用已经验证的 12API 接口约束：

- `gemini-3.1-flash-lite-image`：约 1K，最多 14 张参考图。
- `gemini-2.5-flash-image`：约 1K，最多 3 张参考图。
- `gemini-3-pro-image` 与 `gemini-3-pro-image-preview`：1K、2K、4K，最多 14 张参考图。
- `gemini-3.1-flash-image` 与 `gemini-3.1-flash-image-preview`：512px、1K、2K、4K，最多 14 张参考图。
- 通用宽高比为 1:1、3:2、2:3、4:3、3:4、4:5、5:4、9:16、16:9、21:9；Pro 模型额外保留现有页面支持的 1:4、4:1、1:8、8:1。

### `pricing.json`

保存人工整理的价格快照。它是页面价格弹窗和路由器共用的数据源。

顶层字段：

```json
{
  "schemaVersion": 1,
  "currency": "CNY",
  "updatedAt": "2026-09-22",
  "sources": [
    {
      "providerId": "12api",
      "source": "12API pricing page supplied by the user",
      "models": []
    }
  ]
}
```

每个价格分组包含：

- `id`：`official`、`discount`、`stable` 或 `default`。
- `name`：平台展示名称。
- `billingType`：`per_request` 或 `per_token`。
- `availabilityPercent`：数字或 `null`；页面中的 `--` 和未提供均为 `null`。
- `basePrice`：按次基础价格。
- `qualityMultipliers`：质量倍率；没有倍率时省略。
- `inputPerMillion`、`outputPerMillion`、`cachedInputPerMillion`：按 token 价格。
- `priceIsFrom`：页面标为“起”时为 `true`。

## 12API 价格快照

以下数据全部写入 `pricing.json`。路由器当前只读取 `default` 分组；其他分组用于价格查看和以后为 Key 指定分组。

### `gpt-image-2.5-flare`

质量倍率：`low`、`medium`、`high` 为 1；`xhigh` 为 1.5；`max` 为 2。

| 分组 ID | 名称 | 基础价格/次 | 可用度 | high | xhigh | max |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `official` | 纯 Azure 来源分组，官 Key 兜底 | ¥0.300 | 未提供 | ¥0.300 | ¥0.450 | ¥0.600 |
| `discount` | 特惠-混合分组 | ¥0.150 | 100% | ¥0.150 | ¥0.225 | ¥0.300 |
| `stable` | 标准-稳定分组 | ¥0.225 | 未提供 | ¥0.225 | ¥0.337 | ¥0.450 |
| `default` | 默认（含全模型推荐） | ¥0.150 | 99% | ¥0.150 | ¥0.225 | ¥0.300 |

### `gpt-image-2.5-sunburst`

质量倍率与 Flare 相同。

| 分组 ID | 名称 | 基础价格/次 | 可用度 | high | xhigh | max |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `official` | 纯 Azure 来源分组，官 Key 兜底 | ¥0.300 | 未提供 | ¥0.300 | ¥0.450 | ¥0.600 |
| `discount` | 特惠-混合分组 | ¥0.150 | 99.9% | ¥0.150 | ¥0.225 | ¥0.300 |
| `stable` | 标准-稳定分组 | ¥0.225 | 未提供 | ¥0.225 | ¥0.337 | ¥0.450 |
| `default` | 默认（含全模型推荐） | ¥0.150 | 99.7% | ¥0.150 | ¥0.225 | ¥0.300 |

### `gpt-image-2`

| 分组 ID | 计费 | 价格 | 可用度 |
| --- | --- | --- | ---: |
| `official` | 按 token | 输入 ¥25/M；输出 ¥150/M；缓存输入 ¥10/M | 未提供 |
| `discount` | 按次 | ¥0.150/次 | 100% |
| `stable` | 按 token | 输入 ¥18.75/M；输出 ¥112.50/M；缓存输入 ¥7.50/M | 未提供 |
| `default` | 按 token | 输入 ¥12.50/M；输出 ¥75/M；缓存输入 ¥5/M | 99.9% |

按 token 计费无法在请求前得出准确的每张成本，因此页面展示费率，不伪造预计单价。未来同一模型有多个平台候选且计费单位不可比较时，明确按平台优先级排序。

### `gemini-3.1-flash-lite-image`

| 分组 ID | 价格/次 | 可用度 |
| --- | ---: | ---: |
| `official` | ¥0.050 | 100% |
| `discount` | ¥0.030 | 100% |
| `stable` | ¥0.075 | 未提供 |
| `default` | ¥0.050 | 100% |

### `gemini-2.5-flash-image`

| 分组 ID | 价格/次 | 可用度 |
| --- | ---: | ---: |
| `official` | ¥0.060 | 未提供 |
| `discount` | ¥0.054 | 0% |
| `stable` | ¥0.090 | 未提供 |
| `default` | ¥0.060 | 0% |

### `gemini-3-pro-image`

| 分组 ID | 价格/次 | 可用度 |
| --- | ---: | ---: |
| `official` | ¥0.350 | 未提供 |
| `discount` | ¥0.180 | 100% |
| `stable` | ¥0.750 | 未提供 |
| `default` | ¥0.250 | 100% |

### `gemini-3-pro-image-preview`

| 分组 ID | 价格/次 | 可用度 |
| --- | ---: | ---: |
| `official` | ¥0.350 | 100% |
| `discount` | ¥0.180 | 99.7% |
| `stable` | ¥0.750 | 未提供 |
| `default` | ¥0.250 | 99.9% |

### `gemini-3.1-flash-image`

| 分组 ID | 价格/次 | 可用度 |
| --- | ---: | ---: |
| `official` | ¥0.200 | 100% |
| `discount` | ¥0.130 | 100% |
| `stable` | ¥0.390 | 未提供 |
| `default` | ¥0.130 | 99.8% |

### `gemini-3.1-flash-image-preview`

| 分组 ID | 价格/次 | 可用度 |
| --- | ---: | ---: |
| `official` | ¥0.200 | 100% |
| `discount` | ¥0.130 | 99.9% |
| `stable` | ¥0.390 | 未提供 |
| `default` | ¥0.130 | 100% |

## 本地 API Key 状态

API Key 不进入任何项目文件。浏览器本地保存的数据形状为：

```json
{
  "id": "credential-local-id",
  "providerId": "12api",
  "label": "12API 默认 Key",
  "secret": "stored-only-in-this-browser",
  "priceGroupId": "default",
  "endpointId": "cdn",
  "status": "active",
  "lastFailure": null
}
```

`status` 可为：

- `active`：参与路由。
- `exhausted`：明确余额不足，行置灰且不参与路由。
- `disabled`：用户手动禁用。

“恢复”按钮只把 `exhausted` 改回 `active`，不验证余额。完整 Key 不进入请求诊断、历史、Excel、日志或页面价格弹窗。

## 路由规则

每个被选中的模型独立路由；多模型比较仍按现有并发上限执行。

1. 根据 `models.json` 找到精确模型，不做跨模型替换。
2. 根据是否上传参考图筛选支持文生图或图生图的平台模型。
3. 找出该平台所有 `active` Key。
4. 读取 Key 的 `priceGroupId`；第一期为 `default`。
5. 计算可比较的按次价格。质量倍率只用于明确提供倍率的模型。
6. 同一模型有多个平台候选时，先把静态可用度为 `0%` 的候选移到非零和未知候选之后；每一组内优先选择可估算的按次价格，价格低者在前；同价时可用度高者在前；无法与按次价格比较的按 token 候选按平台目录顺序排列。
7. 静态可用度是人工价格快照，只影响排序。已知正数与未知值均可正常尝试，`0%` 只作为最后候选且不永久禁用；真正禁用 Key 只依据请求返回。
8. 明确返回 HTTP 402 或匹配余额不足消息时，将当前 Key 标记为 `exhausted`，立即尝试下一个候选 Key。
9. HTTP 400、401、403 等错误不自动切换。429 和 5xx 继续使用现有有限重试；重试结束后显示错误，不跨线路盲目重放。
10. 成功后记录实际平台、线路、模型、Key 标签、价格分组、预计按次价格和尝试次数。

若所有 Key 都耗尽，当前模型结果框显示“没有可用额度”，并在生成配置页将相关 Key 行置灰。其他并行模型继续运行。

## 页面交互

生成配置页中，原来的单个 API Key 和 Base URL 区域改为可折叠的“API 来源”：

- 添加 12API Key，保存时默认绑定 `default` 分组和 `cdn` 线路。
- Key 只显示标签和末尾四位。
- 可用 Key 显示状态；耗尽 Key 整行置灰并显示“恢复”按钮。
- 保留删除、显示/隐藏和手动禁用操作。
- 默认线路固定为 CDN；在 Key 行展开高级设置后可手动选择主线路或直连线路。
- “查看价格”按钮打开弹窗，默认只显示当前选择模型，也可查看全部九个模型。
- 价格弹窗可切换分组、查看更新时间，并可展开原始 `pricing.json`。

模型选择器由 `models.json` 渲染。12API 第一批只展示上述九个生图模型。

## 历史记录

每张生成结果新增：

- `providerId` 与平台名称。
- `endpointId` 与线路名称。
- `credentialLabel`，不保存完整 Key。
- `priceGroupId`。
- `billingType`。
- `estimatedPrice`；按 token 或无法估算时为 `null`。
- `routingAttempts`，只记录候选标签、状态码和切换原因，不记录密钥。

历史页继续支持图片下载、选择记录和 Excel 导出。Excel 可增加“平台”“价格分组”“预计价格”列，不改变现有图片列结构。

## 失败处理

- 三份 JSON 任意一份无法加载或校验失败：禁用生成按钮并指出具体文件和字段。
- 模型没有价格：允许生成，但标记“价格未知”，排在已知价格候选之后。
- 模型没有可用 Key：只让该模型失败，不影响同轮其他模型。
- 生成成功但历史保存失败：保留当前结果并给出警告。
- Key 存储失败：不声称已保存，提示浏览器存储不可用。
- 未知网络失败和超时：不把 Key 标记为耗尽。

## 校验与测试

- JSON Schema 或等价运行时校验覆盖三个目录文件。
- 测试九个模型均能关联到 12API 和价格条目。
- 测试所有价格分组 ID 唯一，默认分组存在。
- 测试 Flare/Sunburst 的质量倍率计算。
- 测试按 token 价格不会伪造每张预计价格。
- 测试 402 会耗尽当前 Key 并选择下一候选。
- 测试 400、401、403、超时不会误标额度耗尽。
- 测试恢复按钮重新激活 Key。
- 测试历史记录和 Excel 不包含完整 API Key。
- 在 `http://127.0.0.1` 和 EdgeOne 部署环境中验证 JSON 加载、价格弹窗和一次不消耗额度的请求构造流程。

## 安全说明

这是纯前端个人工具。API Key 保存在浏览器本地，任何能访问该浏览器配置或页面脚本的人都有可能读取它。项目文件、Git 历史、EdgeOne 静态资源和导出文件中不得出现 API Key。

用户曾在对话中提供的 Key 不用于实现、测试或提交；应在平台后台作废并重新生成后，再由用户自行录入页面。
