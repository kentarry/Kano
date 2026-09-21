# Kano 模型問卷分析工具（Codex 版）

這是一套從產品描述、遊戲截圖與影片代表影格產生 Kano 問卷，並匯入回覆資料完成分析與報告的工具。

## 為什麼改成本機 Codex

舊版由瀏覽器直接呼叫固定的 Gemini 模型，因此不同帳戶可能遇到「找不到模型」、模型退役、API Key 權限或網站來源限制。新版改用 Codex CLI 的 App Server：

- 使用 ChatGPT 登入，不把 API Key 寫進網頁或專案。
- 由本機 Codex 動態回報目前帳戶真正可用的模型，不硬編碼模型名稱。
- 選定模型無法建立工作階段時，服務會依可用清單自動改用其他模型。
- 圖片可直接分析；影片會在瀏覽器擷取 3 張代表影格，避免把不支援的影片格式直接交給模型。
- Codex 工作階段固定為 `read-only`、`approvalPolicy: never`、`ephemeral: true`，只做分析，不修改檔案。

## 使用方式

### 1. 先安裝必要工具

- [Node.js](https://nodejs.org/) 20 以上版本
- [OpenAI Codex CLI](https://developers.openai.com/codex/cli/)

若尚未安裝 Codex CLI：

```powershell
npm install -g @openai/codex
```

### 2. 啟動

在專案資料夾雙擊 `啟動 Kano Codex.cmd`。服務會開啟：

```text
http://127.0.0.1:3210
```

首次使用時按「登入 ChatGPT」，完成登入後模型清單會自動更新。也可在終端執行：

```powershell
npm run codex
```

### 3. 既有專案

工具仍可讀取舊版匯出的 `Kano_Project_*.json`。舊專案儲存的 Gemini 模型名稱若不在 Codex 清單中會被忽略，題目、判讀指南、描述與研究目標仍會載入，可直接進行後續分析。

頁面也提供「下載串燒遊戲範例專案」，下載後按「讀取專案」即可先體驗題目檢查、回覆匯入與分析流程。

## GitHub Pages 說明

[公開頁面](https://kentarry.github.io/Kano/)仍可查看介面與讀取既有專案，但 GitHub Pages 只能託管靜態檔案，無法啟動 Codex App Server。要生成或重新優化題目，請下載／clone 專案並用上述啟動檔開啟本機版。

這項限制是刻意的安全設計：不應把 OpenAI 或其他服務的秘密金鑰放在公開 HTML 中。

## 測試

```powershell
npm test
```

測試會確認：

- 主要前端功能與 Codex 連線程式存在。
- 前端 JavaScript 可解析。
- 專案沒有提交 Google／OpenAI API Key 或舊 Gemini API 呼叫。
- `server.mjs` 語法正確。

## 主要檔案

- `index.html`：問卷生成、回覆分析與報告介面
- `server.mjs`：只綁定 `127.0.0.1` 的 Codex App Server 橋接服務
- `啟動 Kano Codex.cmd`：Windows 一鍵啟動與環境檢查
- `scripts/test-static.mjs`：靜態安全與回歸檢查

## 官方參考

- [Codex App Server](https://developers.openai.com/codex/app-server/)
- [Codex CLI](https://developers.openai.com/codex/cli/)
- [OpenAI 模型](https://developers.openai.com/api/docs/models)
