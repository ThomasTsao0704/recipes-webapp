# 雞尾酒譜 PWA 部署指南

## 📁 檔案結構

創建以下檔案結構：

```
cocktail-pwa/
├── index.html          # 主要 HTML 檔案
├── manifest.json       # PWA 配置檔案
├── sw.js              # Service Worker
├── icons/             # 應用程式圖示（可選）
│   ├── icon-72.png
│   ├── icon-96.png
│   ├── icon-128.png
│   ├── icon-144.png
│   ├── icon-152.png
│   ├── icon-192.png
│   ├── icon-384.png
│   └── icon-512.png
└── README.md          # 說明文件
```

## 🚀 快速部署

### 方法 1：使用 GitHub Pages（推薦）

1. **建立 GitHub Repository**
   ```bash
   git init
   git add .
   git commit -m "Initial PWA setup"
   git remote add origin https://github.com/你的用戶名/cocktail-pwa.git
   git push -u origin main
   ```

2. **啟用 GitHub Pages**
   - 進入 Repository Settings
   - 找到 "Pages" 設定
   - Source 選擇 "Deploy from a branch"
   - Branch 選擇 "main"
   - 點擊 Save

3. **訪問你的 PWA**
   - URL：`https://你的用戶名.github.io/cocktail-pwa/`

### 方法 2：使用 Netlify

1. **拖拽部署**
   - 訪問 [netlify.com](https://netlify.com)
   - 將整個資料夾拖拽到部署區域
   - 獲得隨機 URL，可自訂域名

2. **Git 整合**
   - 連接 GitHub repository
   - 自動部署更新

### 方法 3：使用 Vercel

1. **安裝 Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **部署**
   ```bash
   vercel
   ```

## 📱 本地測試

### 使用 Python（推薦）
```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```

### 使用 Node.js
```bash
npx serve .
# 或
npm install -g http-server
http-server
```

### 測試 PWA 功能

1. **在 Chrome 中測試**
   - 開啟 DevTools（F12）
   - 切換到 "Application" 分頁
   - 檢查：
     - Manifest
     - Service Workers
     - Storage (IndexedDB)

2. **手機測試**
   - 使用手機瀏覽器訪問
   - 測試 "加入主畫面" 功能
   - 測試離線功能（關閉網路）

## 🎨 自訂圖示（可選）

如果你想要真實的圖示而不是 SVG 佔位符：

### 在線圖示生成器
1. 訪問 [PWA Builder](https://www.pwabuilder.com/imageGenerator)
2. 上傳 512x512 的原始圖片
3. 下載生成的圖示包
4. 替換 manifest.json 中的圖示路徑

### 手動創建
使用任何圖像編輯軟體創建以下尺寸：
- 72x72, 96x96, 128x128, 144x144
- 152x152, 192x192, 384x384, 512x512

## ⚙️ 進階配置

### 啟用推送通知（可選）
在 sw.js 中已包含基本框架，如需啟用：

```javascript
// 請求通知權限
if ('Notification' in window) {
  Notification.requestPermission();
}

// 發送測試通知
function sendTestNotification() {
  if ('serviceWorker' in navigator && 'Notification' in window) {
    navigator.serviceWorker.ready.then(registration => {
      registration.showNotification('雞尾酒譜', {
        body: '新的酒譜推薦！',
        icon: './icons/icon-192.png',
        badge: './icons/icon-72.png'
      });
    });
  }
}
```

### 背景同步（可選）
已在 Service Worker 中預留框架，可用於離線時的資料同步。

### 自動更新檢測
```javascript
// 在主 HTML 檔案中添加
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}
```

## 🔍 SEO 優化

在 `<head>` 中添加：

```html
<!-- SEO Meta Tags -->
<meta name="description" content="探索經典調酒，享受品味時光。收藏與分享雞尾酒譜">
<meta name="keywords" content="雞尾酒,調酒,酒譜,cocktail,recipes">
<meta name="author" content="Your Name">

<!-- Open Graph -->
<meta property="og:title" content="雞尾酒譜瀏覽器">
<meta property="og:description" content="探索經典調酒，享受品味時光">
<meta property="og:image" content="./icons/icon-512.png">
<meta property="og:url" content="https://yourdomain.com">
<meta property="og:type" content="website">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="雞尾酒譜瀏覽器">
<meta name="twitter:description" content="探索經典調酒，享受品味時光">
<meta name="twitter:image" content="./icons/icon-512.png">
```

## 📊 性能監控

### 使用 Lighthouse
1. Chrome DevTools > Lighthouse
2. 選擇 "Progressive Web App"
3. 檢查評分和建議

### 關鍵指標
- Performance: >90
- Accessibility: >90
- Best Practices: >90
- SEO: >90
- PWA: ✅ 所有檢查項目

## 🛠️ 故障排除

### 常見問題

1. **Service Worker 不工作**
   - 確保使用 HTTPS 或 localhost
   - 檢查控制台錯誤訊息
   - 清除瀏覽器快取

2. **離線功能失效**
   - 檢查 Service Worker 註冊
   - 驗證快取策略
   - 測試網路中斷情況

3. **PWA 無法安裝**
   - 檢查 manifest.json 格式
   - 確保所有必需圖示存在
   - 驗證 HTTPS 協議

4. **圖片無法顯示**
   - 檢查 IndexedDB 資料
   - 驗證圖片儲存邏輯
   - 測試圖片讀取功能

### 調試指令

```javascript
// 在瀏覽器控制台執行

// 清除所有快取
caches.keys().then(names => names.forEach(name => caches.delete(name)));

// 檢查 IndexedDB
indexedDB.databases().then(console.log);

// 重新註冊 Service Worker
navigator.serviceWorker.getRegistrations()
  .then(registrations => registrations.forEach(r => r.unregister()));
```

## 📈 後續升級

### 版本管理
1. 更新 sw.js 中的 CACHE_NAME
2. 修改 manifest.json 版本號
3. 測試升級流程

### 功能擴展
- 雲端同步（Firebase、Supabase）
- 社交分享功能
- 酒譜評分系統
- 個人化推薦
- 多語言支援

## 🔒 安全考量

1. **HTTPS 必需**
   - PWA 需要安全連線
   - 使用 Let's Encrypt 免費憑證

2. **資料驗證**
   - 匯入 CSV 時驗證格式
   - 防止 XSS 攻擊

3. **隱私保護**
   - 本地儲存，無伺服器
   - 用戶完全控制資料

## 📞 支援

遇到問題時：
1. 檢查瀏覽器控制台錯誤
2. 驗證檔案結構完整性
3. 測試基本 HTML 功能
4. 逐步啟用 PWA 功能

---

**恭喜！** 你現在擁有一個功能完整的雞尾酒譜 PWA，支援：
- ✅ 離線瀏覽
- ✅ 本地儲存
- ✅ 圖片管理
- ✅ 資料匯出入
- ✅ 響應式設計
- ✅ 可安裝應用程式