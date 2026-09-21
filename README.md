# Local Image Lab

本地浏览器直连的多模型生图、历史管理与 Excel 对比导出工具。

在线体验：[local-image-lab-dpbpftgxl8na.edgeone.cool](https://local-image-lab-dpbpftgxl8na.edgeone.cool)

## 功能

- 同时调用多个图片模型，并在同一轮中对比结果。
- 支持 12API 的 GPT Images、Gemini Generate Content，以及火山方舟 Ark 的 Seedream Images 接口。
- 在浏览器保存多个平台、多个 API Key；按精确模型、默认分组价格和可用度选择来源。
- 明确遇到额度不足时自动停用该 Key 并尝试下一个来源，可手动恢复。
- 页面内查看人工维护的模型价格、计费方式和可用度快照。
- 可上传、排序、预览和删除参考图。
- 保存常用提示词，并与主提示词拼接使用。
- 在浏览器本地保存生成历史，支持下载、放大查看和勾选导出带平台/价格信息的 Excel。

## 本地运行

项目启动时会读取 `data/*.json`，不能直接通过 `file://` 打开。请在项目目录运行：

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

然后访问 [http://127.0.0.1:8765/](http://127.0.0.1:8765/)，在“API 来源”中分别添加 12API 或火山方舟 Ark 的 Key，再选择模型生成。

API Key 只保存在当前浏览器的 `localStorage`，不会写入项目 JSON 或生图历史。请勿将含真实 API Key 的浏览器配置、开发者工具内容或截图提交到仓库。

价格只用于本地选择请求来源和展示预计费用，不会查询真实余额。只有接口明确返回 `HTTP 402` 或目录中配置的余额不足消息时，当前 Key 才会被标记为额度耗尽；超时、`401`、参数错误和其他故障不会自动换 Key。

## 更新平台数据

- `data/providers.json`：平台线路、模型请求名、适配器和额度错误规则。
- `data/models.json`：生图模型能力、选项和参考图限制。
- `data/pricing.json`：人工维护的价格与可用度快照，当前使用各平台的 `default` 分组。

新增平台时，需要同时添加平台映射、模型能力和价格记录；前端会在启动时校验三份目录之间的引用关系。

## 当前目录

- 12API：9 个生图模型。
- 火山方舟 Ark：3 个 Seedream 生图模型。
- 价格快照日期：`2026-09-22`。

## 本地检查

```bash
node --test tests/*.test.js
node -e "const fs=require('fs');const h=fs.readFileSync('index.html','utf8');const s=[...h.matchAll(/<script>([\\s\\S]*?)<\\/script>/g)].at(-1)[1];new Function(s);console.log('inline script syntax ok')"
```
