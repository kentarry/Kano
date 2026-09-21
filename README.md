# Kano 模型問卷分析工具

> 適用平台：Antigravity.ai（React 環境）
> 使用語言：繁體中文

線上版：<https://kentarry.github.io/Kano/>

## GitHub Pages 發布

線上版使用根目錄的 `index.html`，不需要 Node.js 建置。`.github/workflows/pages.yml` 會在 `main` 分支的網頁或部署流程變更時：

1. 驗證 `index.html` 存在且內容正確。
2. 只封裝實際網站檔案，並加入 `.nojekyll`。
3. 部署到 GitHub Pages。
4. 從公開網址重新下載頁面，確認不是 404 且標題正確。

需要重新部署時，也可在 GitHub 的 **Actions → Deploy GitHub Pages → Run workflow** 手動執行。若網站顯示 404，先查看該工作流程的 `deploy` 與 `verify` 工作是否成功；這能區分部署失敗與瀏覽器快取／GitHub Pages 短暫傳播延遲。

---

## 📁 檔案結構

```
src/
├── constants.js              # 所有常數、設定資料、預設值
├── helpers.js                # 工具函式、API 呼叫、資料處理邏輯
├── components.jsx            # 共用 UI 元件（圖表、通知、卡片等）
├── KanoQuestionGenerator.jsx # 題目產生器主元件（含 AI 生成與匯出）
├── SurveyPreview.jsx         # 問卷填寫結果預覽元件
└── App.jsx                   # 主應用程式（路由、狀態管理、報告匯出）
```

---

## 🔧 Antigravity.ai 匯入方式

1. 在 Antigravity.ai 建立新專案（選擇 React 模板）
2. 將上述所有 `.jsx` 與 `.js` 檔案複製到專案的 `src/` 目錄
3. 確認 `package.json` 中已包含以下依賴：
   - `lucide-react`（^0.383.0）
   - `recharts`（^2.12.0）
4. 在 `main.jsx`（或 Antigravity 入口點）中引入 App：
   ```jsx
   import App from './App';
   export default App;
   ```

---

## 📦 外部套件說明

以下套件會在執行時**動態從 CDN 載入**，無需額外安裝：

| 套件 | 用途 | CDN 來源 |
|------|------|----------|
| SheetJS (XLSX) | Excel 讀寫 | cdn.sheetjs.com |
| html2canvas | 圖表截圖匯出 | cdnjs.cloudflare.com |
| docx | Word 文件產生 | unpkg.com |

## 🧭 公版問卷生成流程

新版產生器會依產品類型與研究目標，同時建立 Kano 題組、體驗評分題、行為題與開放題。AI 必須先列出已確認功能、待確認推測及資訊不足項目，避免把素材中不存在的廣告、付費或社交功能誤寫成現況題目。生成後也會自動檢查引導性措辭、重複題、過長題目與缺少證據來源。

圖片會在瀏覽器內縮圖後再送出；包含影片時，處理後附件安全上限為 14 MB，只有圖片時為 70 MB。超過限制會在送出 API 前顯示具體原因，不會只顯示籠統的生成錯誤。

若其他使用者無法生成，請依序：

1. 使用「測試連線」確認 API Key、模型權限及網站限制。工具會透過 Gemini `models.list` 讀取該 Key 真正支援 `generateContent` 的模型，並在原選項不可用時自動切換，不再假設所有專案都有相同模型。
2. 查看錯誤是否屬於額度用完、地區／付費設定、Key 被停用或公司網路阻擋。
3. 有影片時減少影片長度或解析度，必要時只上傳代表性截圖。
4. 額度較小時優先選擇清單中的 Flash-Lite；實際型號以該 API Key 回傳的可用模型為準。

---

## 🗂 各檔案職責說明

### `constants.js`
- `SYSTEM_PROMPT_V12`：Gemini AI 的系統提示詞
- `KANO_MATRIX`：Kano 屬性判斷矩陣
- `CATEGORY_COLORS` / `SHORT_NAMES`：各屬性顏色與短名稱
- `DEFAULT_GUIDE`：預設 Kano 判讀指南
- `DEMO_DATA`：範例數據（5 題遊戲功能測試）
- `RAW_CURVE_DATA`：Kano 曲線座標點

### `helpers.js`
- `callGeminiAPI()`：呼叫 Gemini API，含指數退避重試機制
- `normalizeAnswer()`：標準化各種填答文字（相容模糊輸入）
- `extractFeatureName()`：從題目文字萃取簡潔功能名稱
- `fileToBase64()`：File 轉 Base64（供圖片上傳使用）
- `getQuadrantCategory()`：依 SI/DSI 座標判斷 KANO 象限屬性
- `analyzeTextContext()`：依題目文字語意分析並給出情境化建議
- `getSuggestion()`：整合 AI 建議或自動生成優化策略

### `components.jsx`
- `NotificationToast`：右上角通知訊息元件
- `CustomScatterPoint`：Kano 散佈圖自訂標記點（含引線）
- `CustomTooltip`：圖表滑鼠懸停提示框
- `AmiorStatsSummary`：AMIOR 屬性統計摘要列
- `AmiorGuideSection`：Kano 判讀指南區塊
- `SharedKanoChart`：Kano 主圖（散佈圖 + 5 條屬性曲線）
- `StageSection`：三階段優化建議容器
- `SuggestionCard`：單題優化建議卡片
- `QuestionStatsTable`：題目統計資料表（左右分欄）

### `KanoQuestionGenerator.jsx`
- AI 題目生成（支援純文字 / 圖片 / 影片）
- 題目個別優化（單題 or 全體）
- 匯出 Excel（題目設計總覽）
- 匯出 Word（供 Microsoft Forms 匯入）
- 截圖用題目總覽 Modal

### `SurveyPreview.jsx`
- 顯示 Excel 解析後的問卷填寫結果
- 各題正/反向、SI/DSI、AMIOR 分佈統計

### `App.jsx`
- 五個頁籤：題目產生器 / 圖表看板 / 問卷填寫預覽 / 報告預覽 / API 數據
- Excel 上傳解析（從第 7 欄開始讀取，奇偶列對應正/反向題）
- Force Simulation（散佈圖標籤自動避開重疊）
- 自動生成報告摘要與分析原因
- HTML 報告匯出（含截圖圖表、可互動排序的題目列表）

---

## 🔑 API Key 設定

1. 前往 [Google AI Studio](https://aistudio.google.com/) 申請 Gemini API Key
2. 在工具介面「題目產生器」→「Gemini API Key」欄位中輸入
3. GitHub Pages 線上版只在目前分頁的記憶體中使用 Key；重新整理或關閉分頁後需再次輸入

請勿把 API Key 寫進 `index.html`、JavaScript、`.env` 或提交到 Git。GitHub Pages 的所有前端檔案都是公開的，無法安全保存私密 Key。

---

## 📊 Excel 格式要求

- **工作表**：預設讀取第 1 張工作表（Sheet1）
- **起始欄**：第 7 欄（index 6）開始為題目欄位（前 6 欄為受測者資料欄）
- **答題順序**：奇數題 = 正向題、偶數題 = 反向題
- **答案文字**：支援多種寫法，如「非常喜歡」、「喜歡」均可對應至標準選項
