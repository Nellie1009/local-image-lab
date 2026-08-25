# Local Image Lab

本地浏览器直连的多模型生图、历史管理与 Excel 对比导出工具。

## 功能

- 同时调用多个图片模型，并在同一轮中对比结果。
- 支持 OpenAI Images 与 Gemini Generate Content 兼容接口。
- 可上传、排序、预览和删除参考图。
- 保存常用提示词，并与主提示词拼接使用。
- 在浏览器本地保存生成历史，支持下载、放大查看和勾选导出 Excel。

## 使用

直接用浏览器打开 `index.html`，或在该目录运行静态文件服务器后访问页面。填写 API Base URL 和 API Key，选择模型并生成即可。

API Key 仅按页面设置保存在当前浏览器本地。请勿将含有真实 API Key 的浏览器配置或截图提交到仓库。

## 本地检查

```bash
node --test tests/*.test.js
node -e "new Function(require('fs').readFileSync('index.html', 'utf8').match(/<script>([\\s\\S]*)<\\/script>/)[1])"
```
