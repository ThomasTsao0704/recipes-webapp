// app.js — IndexedDB 版（手機單機可用）
// 功能總攬：
// - 主要資料來源：IndexedDB（RecipesDB / store: recipes）
// - 匯入/匯出：CSV（備份/搬家用）
// - 登入後才可看到 ✏️ 編輯（body.logged-in）
// - Modal：管理者登入 / 編輯（Esc 可關閉；開啟時鎖背景捲動）
// - 排序：分類→名稱（預設，空分類最後）、名稱、總時長、熱量、份量（支援反向 & 穩定排序）

(() => {
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ====== 狀態 ======
  const state = {
    recipes: [],                 // 畫面要顯示的資料（從 IndexedDB 載入）
    currentEditId: null,         // 目前編輯中的 id
    loggedIn: false,             // 登入狀態
    sort: { key: "cat_title", reverse: false },
    storageMode: "idb"           // 統一走 IndexedDB；下方仍保留 CSV 匯入/出
  };

  // ====== 能力偵測 ======
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const hasFSAccess = !!(window.showDirectoryPicker && window.isSecureContext); // 只在桌面 Chrome/Edge 有用

  // ====== DOM ======
  const el = {
    stats: $("#stats"),
    recipesContainer: $("#recipesContainer"),
    categorySelect: $("#categorySelect"),
    searchInput: $("#searchInput"),
    sortSelect: $("#sortSelect"),
    sortReverse: $("#sortReverse"),

    addForm: $("#addRecipeForm"),
    successMessage: $("#successMessage"),
    tagsInput: $("#tagsInput"),
    tagsDisplay: $("#tagsDisplay"),
    ingredientsList: $("#ingredientsList"),
    stepsList: $("#stepsList"),

    btnPickFolder: $("#btnPickFolder"),
    btnWriteCSV: $("#btnWriteCSV"),
    btnExport: $("#btnExport"),
    btnImport: $("#btnImport"),
    fileInput: $("#fileInput"),
    navBtns: $$(".nav-btn"),
    pages: { browse: $("#browsePage"), add: $("#addPage") },
    viewBtns: $$(".view-btn"),

    // 登入
    btnLogin: $("#btnLogin"),
    btnLogout: $("#btnLogout"),
    loginModal: $("#loginModal"),
    loginForm: $("#loginForm"),

    // 編輯 Modal
    editBackdrop: $("#editBackdrop"),
    editModal: $("#editModal"),
    editForm: $("#editForm")
  };

  // ====== CSV 欄位定義（沿用 data.js 的 SCHEMA） ======
  const CSV_FILE = "recipes.csv";
  const FIELDS = window.CSV_SCHEMA || [
    "id","title","category","tags","ingredients","steps",
    "prep_minutes","cook_minutes","servings","calories","image_url"
  ];

  // ====== 本地化排序（中英文自然排序） ======
  const collator = new Intl.Collator("zh-Hant", { sensitivity: "base", numeric: true });

  // ====== IndexedDB 基礎 ======
  const IDB = {
    db: null,
    NAME: "RecipesDB",
    STORE: "recipes",

    async open(){
      if (this.db) return this.db;
      this.db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(this.NAME, 1);
        req.onerror = () => reject(req.error || new Error("無法開啟資料庫"));
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(this.STORE)) {
            // 使用字串型 id（沿用 CSV 的 id 規則）；若沒有就自動產生
            db.createObjectStore(this.STORE, { keyPath: "id" });
          }
        };
        req.onsuccess = () => resolve(req.result);
      });
      return this.db;
    },

    async getAll(){
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE, "readonly");
        const st = tx.objectStore(this.STORE);
        const req = st.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error || new Error("讀取失敗"));
      });
    },

    async put(recipe){ // 新增或更新
      const db = await this.open();
      if (!recipe.id) recipe.id = genId();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE, "readwrite");
        const st = tx.objectStore(this.STORE);
        const req = st.put(recipe);
        req.onsuccess = () => resolve(recipe.id);
        req.onerror = () => reject(req.error || new Error("寫入失敗"));
      });
    },

    async delete(id){
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE, "readwrite");
        const st = tx.objectStore(this.STORE);
        const req = st.delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error || new Error("刪除失敗"));
      });
    },

    async bulkReplace(list){ // 匯入 CSV 後整批覆蓋
      const db = await this.open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE, "readwrite");
        const st = tx.objectStore(this.STORE);
        const clearReq = st.clear();
        clearReq.onsuccess = () => resolve(true);
        clearReq.onerror = () => reject(clearReq.error);
      });
      for (const r of list) await this.put(r);
      return true;
    }
  };

  // ====== 啟動 ======
  document.addEventListener("DOMContentLoaded", init);

  async function init(){
    bindNav();
    bindViewToggle();
    bindTopbarButtons();
    bindForm();
    bindEditModal();
    bindLogin();
    guardMobileButtons();

    await loadFromIDB();
    if (!state.recipes.length) await tryLoadInitialFromNetworkThenSeedIDB();

    renderAll();
    flashStats();

    // PWA 的 service worker 在 index.html 會註冊，這裡不重覆
  }

  // 行動裝置：停用「選擇資料夾/寫入 CSV」避免權限錯誤
  function guardMobileButtons(){
    if (isMobile || !hasFSAccess) {
      el.btnPickFolder?.setAttribute("disabled", "true");
      el.btnWriteCSV?.setAttribute("disabled", "true");
      el.btnPickFolder?.classList.add("disabled");
      el.btnWriteCSV?.classList.add("disabled");
      el.btnPickFolder?.setAttribute("title", "行動瀏覽器不支援資料夾授權，請改用『匯出 CSV』備份");
      el.btnWriteCSV?.setAttribute("title", "行動瀏覽器不支援直接寫檔，請改用『匯出 CSV』備份");
    }
  }

  // ====== 從 IndexedDB 載入 ======
  async function loadFromIDB(){
    try {
      const rows = await IDB.getAll();
      state.recipes = normalizeRows(rows);
    } catch (e) {
      console.warn("讀取 IndexedDB 失敗：", e);
      state.recipes = [];
    }
  }

  // 首次使用：若同站有 recipes.csv，讀一次並寫進 IDB（可選）
  async function tryLoadInitialFromNetworkThenSeedIDB(){
    try {
      const resp = await fetch(CSV_FILE, { cache: "no-store" });
      if (!resp.ok) return;
      const text = await resp.text();
      const { rows } = await window.csvTextToArray(text);
      const normalized = normalizeRows(rows);
      if (normalized.length){
        await IDB.bulkReplace(normalized);
        state.recipes = normalized;
        flashStats("已從預設 recipes.csv 載入並保存到本機");
      }
    } catch (e) {
      // 沒檔就算了
    }
  }

  /** 欄位正規化 */
  function normalizeRows(rows){
    return rows.map(r => ({
      id: r.id && String(r.id).trim() ? String(r.id).trim() : genId(),
      title: r.title ?? "",
      category: r.category ?? "",
      tags: r.tags ?? "",
      ingredients: r.ingredients ?? "",
      steps: r.steps ?? "",
      prep_minutes: toNumOrEmpty(r.prep_minutes),
      cook_minutes: toNumOrEmpty(r.cook_minutes),
      servings: toNumOrEmpty(r.servings),
      calories: toNumOrEmpty(r.calories),
      image_url: r.image_url ?? ""
    }));
  }
  function toNumOrEmpty(v){ const n = Number(v); return Number.isFinite(n) ? n : ""; }

  // ====== 導覽與視圖 ======
  function bindNav(){
    el.navBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        el.navBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const page = btn.dataset.page;
        $$(".page").forEach(p => p.classList.remove("active"));
        el.pages[page].classList.add("active");
      });
    });
  }

  function bindViewToggle(){
    el.viewBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        el.viewBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const v = btn.dataset.view;
        if (v === "grid") {
          el.recipesContainer.classList.remove("recipes-list");
          el.recipesContainer.classList.add("recipes-grid");
        } else {
          el.recipesContainer.classList.remove("recipes-grid");
          el.recipesContainer.classList.add("recipes-list");
        }
      });
    });
  }

  // ====== Topbar 事件 ======
  function bindTopbarButtons(){
    // 桌面專用：選擇資料夾 / 寫入 CSV（行動會停用）
    el.btnPickFolder?.addEventListener("click", () => {
      alert("此版本以 IndexedDB 為主；在行動裝置或不支援的瀏覽器，請改用『匯出 CSV』備份。");
    });
    el.btnWriteCSV?.addEventListener("click", () => {
      alert("此版本以 IndexedDB 為主；請使用『匯出 CSV』下載備份檔。");
    });

    // 匯出 / 匯入（跨平台可用）
    el.btnExport?.addEventListener("click", onExportCSV);
    el.btnImport?.addEventListener("click", () => el.fileInput.click());
    el.fileInput?.addEventListener("change", onImportCSV);

    // 搜尋 / 分類 / 排序
    el.searchInput?.addEventListener("input", renderAll);
    el.categorySelect?.addEventListener("change", renderAll);
    el.sortSelect?.addEventListener("change", () => { state.sort.key = el.sortSelect.value; renderAll(); });
    el.sortReverse?.addEventListener("click", () => { state.sort.reverse = !state.sort.reverse; renderAll(); });
  }

  // ====== 新增表單 ======
  function bindForm(){
    // 標籤輸入：Enter 轉 chip
    el.tagsInput?.addEventListener("keydown", e => {
      if (e.key === "Enter"){
        e.preventDefault();
        const v = el.tagsInput.value.trim();
        if (!v) return;
        addTagChip(v, el.tagsDisplay);
        el.tagsInput.value = "";
      }
    });

    el.addForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const rec = readFormToRecipe();
      await IDB.put(rec);
      await loadFromIDB();
      renderAll();
      showSuccess("✅ 食譜新增成功（已存到本機）！");
      clearForm();
    });
  }

  function addTagChip(text, container){
    const div = document.createElement("span");
    div.className = "tag-chip";
    div.textContent = text;
    div.title = "點擊移除";
    div.addEventListener("click", () => div.remove());
    container.appendChild(div);
  }

  function readFormToRecipe(){
    const ingredients = Array.from(el.ingredientsList?.querySelectorAll("input") || [])
      .map(i => i.value.trim()).filter(Boolean).join(" | ");
    const steps = Array.from(el.stepsList?.querySelectorAll("input") || [])
      .map(i => i.value.trim()).filter(Boolean).join("\n");
    const tags = Array.from(el.tagsDisplay?.querySelectorAll(".tag-chip") || [])
      .map(ch => ch.textContent.trim()).join(";");

    return {
      id: genId(),
      title: $("#recipeTitle")?.value.trim() || "",
      category: $("#recipeCategory")?.value || "",
      tags,
      ingredients,
      steps,
      prep_minutes: $("#prepTime")?.value || "",
      cook_minutes: $("#cookTime")?.value || "",
      servings: $("#recipeServings")?.value || "",
      calories: $("#calories")?.value || "",
      image_url: $("#imageUrl")?.value.trim() || ""
    };
  }

  function clearForm(){
    el.addForm?.reset();
    el.tagsDisplay && (el.tagsDisplay.innerHTML = "");
    if (el.ingredientsList) {
      el.ingredientsList.innerHTML = `
        <div class="ingredient-item">
          <input type="text" placeholder="例如：義大利麵 200g" required />
          <button type="button" class="remove-btn" onclick="app.removeIngredient(this)">移除</button>
        </div>`;
    }
    if (el.stepsList){
      el.stepsList.innerHTML = `
        <div class="step-item">
          <span style="font-weight: bold; min-width: 30px;">1.</span>
          <input type="text" placeholder="詳細描述第一個步驟" required />
          <button type="button" class="remove-btn" onclick="app.removeStep(this)">移除</button>
        </div>`;
    }
  }

  // ====== 編輯 Modal ======
  function bindEditModal(){
    // 事件委派：卡片上的「✏️ 編輯」
    el.recipesContainer.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".edit-btn");
      if (!btn) return;
      if (!state.loggedIn) { alert("請先登入管理者帳號"); return; }
      const id = btn.dataset.id;
      const rec = state.recipes.find(r => r.id === id);
      if (!rec) return;
      openEditModal(rec);
    });

    // 關閉（背景或關閉鈕）
    [el.editBackdrop, ...$$('[data-close]', el.editModal)].forEach(node => {
      node.addEventListener("click", (e) => {
        if (e.target === el.editBackdrop || e.currentTarget.hasAttribute("data-close")) closeEditModal();
      });
    });

    // 儲存
    el.editForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!state.currentEditId) return;
      const idx = state.recipes.findIndex(r => r.id === state.currentEditId);
      if (idx === -1) return;

      const form = new FormData(el.editForm);
      const r = { ...state.recipes[idx] };
      r.id = form.get("id") || r.id;
      r.title = (form.get("title") || "").trim();
      r.category = (form.get("category") || "").trim();
      r.tags = (form.get("tags") || "").trim();
      r.ingredients = (form.get("ingredients") || "").trim();
      r.steps = (form.get("steps") || "").trim();
      r.prep_minutes = form.get("prep_minutes") || "";
      r.cook_minutes = form.get("cook_minutes") || "";
      r.servings = form.get("servings") || "";
      r.calories = form.get("calories") || "";
      r.image_url = (form.get("image_url") || "").trim();

      await IDB.put(r);
      await loadFromIDB();
      renderAll();
      closeEditModal();
      alert("✅ 已更新（本機 IndexedDB）");
    });

    // 刪除
    el.editForm.querySelector("[data-delete]").addEventListener("click", async (e) => {
      e.preventDefault();
      if (!state.currentEditId) return;
      if (!confirm("確定要刪除這筆食譜嗎？此動作無法還原。")) return;

      await IDB.delete(state.currentEditId);
      await loadFromIDB();
      renderAll();
      closeEditModal();
      alert("🗑️ 已刪除（本機 IndexedDB）");
    });

    // Esc 關閉
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.editModal.getAttribute("aria-hidden") === "false") {
        closeEditModal();
      }
    });
  }

  function openEditModal(rec){
    state.currentEditId = rec.id;
    el.editForm.reset();
    el.editForm.querySelector("[name='id']").value = rec.id || "";
    el.editForm.querySelector("[name='title']").value = rec.title || "";
    el.editForm.querySelector("[name='category']").value = rec.category || "";
    el.editForm.querySelector("[name='tags']").value = rec.tags || "";
    el.editForm.querySelector("[name='ingredients']").value = rec.ingredients || "";
    el.editForm.querySelector("[name='steps']").value = rec.steps || "";
    el.editForm.querySelector("[name='prep_minutes']").value = rec.prep_minutes || "";
    el.editForm.querySelector("[name='cook_minutes']").value = rec.cook_minutes || "";
    el.editForm.querySelector("[name='servings']").value = rec.servings || "";
    el.editForm.querySelector("[name='calories']").value = rec.calories || "";
    el.editForm.querySelector("[name='image_url']").value = rec.image_url || "";

    el.editBackdrop.setAttribute("aria-hidden", "false");
    el.editModal.setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden";
  }
  function closeEditModal(){
    state.currentEditId = null;
    el.editBackdrop.setAttribute("aria-hidden", "true");
    el.editModal.setAttribute("aria-hidden", "true");
    document.documentElement.style.overflow = "";
  }

  // ====== Render（搜尋 / 篩選 / 排序） ======
  function renderAll(){
    const q = (el.searchInput?.value || "").trim().toLowerCase();
    const cat = el.categorySelect?.value || "";

    // 篩選
    let list = state.recipes.filter(r => {
      const hay = (r.title + " " + r.ingredients + " " + r.tags).toLowerCase();
      const hitText = !q || hay.includes(q);
      const hitCat = !cat || r.category === cat;
      return hitText && hitCat;
    });

    // 排序
    list = stableSort(list, comparatorFor(state.sort.key));
    if (state.sort.reverse) list.reverse();

    // 分類下拉（保留當前選擇）
    const cats = Array.from(new Set(state.recipes.map(r => r.category).filter(Boolean))).sort(collator.compare);
    const prev = el.categorySelect.value;
    el.categorySelect.innerHTML = `<option value="">📋 全部分類</option>` + cats.map(c => `<option value="${c}">${c}</option>`).join("");
    if (prev) el.categorySelect.value = prev;

    // 清單
    el.recipesContainer.innerHTML = list.map(renderCard).join("");
  }

  function comparatorFor(key){
    switch(key){
      case "title":
        return (a,b) => collator.compare(a.title || "", b.title || "") || collator.compare(a.id, b.id);
      case "mins": {
        const mins = r => (Number(r.prep_minutes)||0) + (Number(r.cook_minutes)||0);
        return (a,b) => (mins(a) - mins(b)) || collator.compare(a.title, b.title);
      }
      case "calories":
        return (a,b) => (num(a.calories) - num(b.calories)) || collator.compare(a.title, b.title);
      case "servings":
        return (a,b) => (num(a.servings) - num(b.servings)) || collator.compare(a.title, b.title);
      case "cat_title":
      default:
        return (a,b) => {
          const ac = a.category || "～～"; // 空分類排最後
          const bc = b.category || "～～";
          return collator.compare(ac, bc) || collator.compare(a.title || "", b.title || "") || collator.compare(a.id, b.id);
        };
    }
  }
  function num(v){ const n = Number(v); return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY; }
  function stableSort(arr, cmp){
    return arr.map((v,i)=>[v,i]).sort((a,b)=>cmp(a[0],b[0]) || (a[1]-b[1])).map(([v])=>v);
  }

  function renderCard(r){
    const tagHtml = (r.tags || "").split(/[;,；]/).map(t => t.trim()).filter(Boolean).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("");
    const hasImg = !!r.image_url;
    const img = hasImg ? `<img src="${escapeHtml(r.image_url)}" alt="${escapeHtml(r.title)}">` : `<span>🍽️</span>`;
    const mins = (Number(r.prep_minutes) || 0) + (Number(r.cook_minutes) || 0);
    return `
      <div class="recipe-card">
        <div class="recipe-image">${img}</div>
        <div class="recipe-content">
          <div class="recipe-title">${escapeHtml(r.title)}</div>
          <div class="recipe-meta">
            <div class="meta-item">⏱️ ${mins || 0} 分</div>
            <div class="meta-item">🍽️ ${r.servings || "-"} 人</div>
            <div class="meta-item">🔥 ${r.calories || "-"} 卡</div>
          </div>
          <div class="recipe-tags">${tagHtml}</div>
          <div class="recipe-details">
            <details><summary>食材</summary><div class="ingredients-list">${escapeHtml((r.ingredients||"").replace(/\|/g,"｜"))}</div></details>
            <details><summary>步驟</summary><div class="steps-list">${escapeHtml((r.steps||"").replace(/\n/g,"<br>"))}</div></details>
          </div>
          <div style="margin-top:12px; display:flex; gap:8px;">
            <button class="btn btn-secondary edit-btn" data-id="${r.id}">✏️ 編輯</button>
          </div>
        </div>
      </div>
    `;
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  // ====== Login / Logout ======
  function bindLogin(){
    function openLoginModal(){
      el.loginModal.setAttribute("aria-hidden","false");
      const inner = el.loginModal.querySelector(".modal");
      if (inner) inner.setAttribute("aria-hidden","false");
      document.documentElement.style.overflow = "hidden";
    }
    function closeLoginModal(){
      el.loginModal.setAttribute("aria-hidden","true");
      const inner = el.loginModal.querySelector(".modal");
      if (inner) inner.setAttribute("aria-hidden","true");
      document.documentElement.style.overflow = "";
    }

    el.btnLogin?.addEventListener("click", openLoginModal);
    $("[data-close]", el.loginModal)?.addEventListener("click", closeLoginModal);
    el.loginModal?.addEventListener("click", (e) => { if (e.target === el.loginModal) closeLoginModal(); });

    el.loginForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      const user = $("#adminUser")?.value.trim();
      const pass = $("#adminPass")?.value;
      if (user === "admin" && pass === "recipes123"){
        state.loggedIn = true;
        document.body.classList.add("logged-in");
        el.btnLogin?.classList.add("hidden");
        el.btnLogout?.classList.remove("hidden");
        closeLoginModal();
      } else {
        alert("帳號或密碼錯誤");
      }
    });

    el.btnLogout?.addEventListener("click", () => {
      state.loggedIn = false;
      document.body.classList.remove("logged-in");
      el.btnLogin?.classList.remove("hidden");
      el.btnLogout?.classList.add("hidden");
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.loginModal?.getAttribute("aria-hidden") === "false") {
        closeLoginModal();
      }
    });
  }

  // ====== 匯出 / 匯入 CSV ======
  async function onExportCSV(){
    const csvText = window.arrayToCSV(state.recipes, FIELDS);
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = CSV_FILE;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  async function onImportCSV(e){
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const { rows } = await window.csvTextToArray(text);
      const normalized = normalizeRows(rows);
      await IDB.bulkReplace(normalized);
      await loadFromIDB();
      renderAll();
      flashStats("✅ 已匯入 CSV 並寫入本機 IndexedDB");
    } catch (err) {
      alert("匯入失敗：" + err.message);
    } finally {
      e.target.value = "";
    }
  }

  // ====== 小工具 ======
  function genId(){ return "R" + Math.random().toString(36).slice(2, 8).toUpperCase(); }

  function showSuccess(msg){
    if (!el.successMessage) return;
    el.successMessage.textContent = msg;
    el.successMessage.style.display = "block";
    setTimeout(() => el.successMessage.style.display = "none", 1600);
  }

  function flashStats(msg){
    if (!el.stats) return;
    if (!msg) msg = `目前共有 ${state.recipes.length} 道食譜`;
    el.stats.textContent = msg;
    setTimeout(() => { el.stats.textContent = `目前共有 ${state.recipes.length} 道食譜`; }, 1500);
  }

  // 提供給 HTML 的 inline 事件
  window.app = {
    addIngredient(){
      if (!el.ingredientsList) return;
      const row = document.createElement("div");
      row.className = "ingredient-item";
      row.innerHTML = `
        <input type="text" placeholder="例如：雞胸肉 200g" required />
        <button type="button" class="remove-btn" onclick="app.removeIngredient(this)">移除</button>`;
      el.ingredientsList.appendChild(row);
    },
    removeIngredient(btn){ btn.closest(".ingredient-item")?.remove(); },
    addStep(){
      if (!el.stepsList) return;
      const row = document.createElement("div");
      row.className = "step-item";
      row.innerHTML = `
        <span style="font-weight: bold; min-width: 30px;">•</span>
        <input type="text" placeholder="下一個步驟" required />
        <button type="button" class="remove-btn" onclick="app.removeStep(this)">移除</button>`;
      el.stepsList.appendChild(row);
    },
    removeStep(btn){ btn.closest(".step-item")?.remove(); },
    clearForm
  };
})();