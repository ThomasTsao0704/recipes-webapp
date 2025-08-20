# 食譜 WebApp（PWA + GitHub Pages）

已加上 PWA：支援「加到主畫面」、離線瀏覽。
- `manifest.json`：App 名稱、圖示、顏色與 scope
- `sw.js`：Service Worker，安裝時快取 App Shell 與資料（含 `recipes.csv`），採 **stale-while-revalidate**
- `index.html`：已連結 manifest 與註冊 SW
- `icon-192.png`, `icon-512.png`：安裝圖示
- `.nojekyll`：避免 Pages 處理檔案

## 部署（GitHub Pages）
1. 上傳整個資料夾內容到 GitHub 儲存庫根目錄（main branch）。
2. 設定 **Settings → Pages → Deploy from a branch**，Branch 選 **main / root**。
3. 重新整理頁面一次，並在瀏覽器網址列點「安裝」或在 Chrome → 三點 → 安裝 App。

## 更新與版本
- 每次我都會在 `sw.js` 內嵌新版本號（v20250820035521）。若修改檔案並重新部署，使用者重新載入即會更新快取。
- 若看到舊畫面，請嘗試強制重新整理（Ctrl+F5）。

## 離線行為
- 首次開啟必須連網以安裝快取；之後離線可開啟上次的內容（搜尋與瀏覽仍可用，新增資料依你實作儲存方式而定）。

生成時間：2025-08-20 03:55:21
