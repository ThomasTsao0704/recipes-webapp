// app.js
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ====== 狀態 ======
  const state = {
    recipes: [],
    pickedDirHandle: null, // 使用者選的資料夾（Android/桌面 Chrome）
    fileHandle: null,      // recipes.csv
    storageMode: "none",   // "fs-access" | "opfs" | "none"
    // 編輯狀態
    currentEditId: null,
    opfsUrlCache: new Map(), // 若之後擴充 OPFS 圖片，可用來快取 blob URL
  };

  // ====== 環境偵測 ======
  const hasFSAccess = !!(window.showDirectoryPicker && window.isSecureContext);
  const hasOPFS = !!(navigator.storage && navigator.storage.getDirectory);

  // ====== DOM 參考 ======
  const el = {
    stats: $("#stats"),
    recipesContainer: $("#recipesContainer"),
    categorySelect: $("#categorySelect"),
    searchInput: $("#searchInput"),
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
    pages: {
      browse: $("#browsePage"),
      add: $("#addPage"),
    },
    viewBtns: $$(".view-btn"),

    // 編輯抽屜
    drawer: $("#editDrawer"),
    closeDrawer: $("#closeDrawer"),
    editForm: $("#editForm"),
    edit: {
      title: $("#editForm [name='title']"),
      category: $("#editForm [name='category']"),
      tags: $("#editForm [name='tags']"),
      ingredients: $("#editForm [name='ingredients']"),
      steps: $("#editForm [name='steps']"),
      prep: $("#editForm [name='prep_minutes']"),
      cook: $("#editForm [name='cook_minutes']"),
      servings: $("#editForm [name='servings']"),
      calories: $("#editForm [name='calories']"),
      imageFile: $("#imageFile"),
      imagePreview: $("#imagePreview"),
      saveBtn: $("#saveRecipe"),
      delBtn: $("#deleteRecipe"),
    },
  };

  // ====== CSV 檔名 & 欄位 ======
  const CSV_FILE = "recipes.csv";
  const FIELDS = window.CSV_SCHEMA || [
    "id","title","category","tags","ingredients","steps",
    "prep_minutes","cook_minutes","servings","calories","image_url"
  ];

  // ====== 啟動 ======
  document.addEventListener("DOMContentLoaded", init);

  async function init(){
    bindNav();
    bindViewToggle();
    bindTopbarButtons();
    bindForm();
    bindEditDrawer();

    // 優先策略
    if (hasFSAccess) state.storageMode = "fs-access";
    else if (hasOPFS) state.storageMode = "opfs";
    else state.storageMode = "none";

    await tryLoadInitialFromNetwork();
    renderAll();
    flashStats();
  }

  // ====== 初始載入（同站 CSV，若存在） ======
  async function tryLoadInitialFromNetwork(){
    try {
      const resp = await fetch(CSV_FILE, { cache: "no-store" });
      if (!resp.ok) return;
      const text = await resp.text();
      const { rows } = await window.csvTextToArray(text);
      state.recipes = normalizeRows(rows);
    } catch (e) {
      console.warn("初始載入 recipes.csv 失敗，可忽略：", e);
    }
  }

  function normalizeRows(rows){
    return rows.map(r => ({
      id: r.id ?? genId(),
      title: r.title ?? "",
      category: r.category ?? "",
      tags: r.tags ?? "",
      ingredients: r.ingredients ?? "",
      steps: r.steps ?? "",
      prep_minutes: num(r.prep_minutes),
      cook_minutes: num(r.cook_minutes),
      servings: num(r.servings),
      calories: num(r.calories),
      image_url: r.image_url ?? ""
    }));
  }
  function num(v){ const n = Number(v); return Number.isFinite(n) ? n : ""; }

  // ====== 導覽切換 ======
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

  // ====== 視圖切換 ======
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

  // ====== Topbar 按鈕 ======
  function bindTopbarButtons(){
    el.btnPickFolder.addEventListener("click", onPickFolder);
    el.btnWriteCSV.addEventListener("click", onWriteCSV);
    el.btnExport.addEventListener("click", onExportCSV);
    el.btnImport.addEventListener("click", () => el.fileInput.click());
    el.fileInput.addEventListener("change", onImportCSV);

    el.searchInput.addEventListener("input", renderAll);
    el.categorySelect.addEventListener("change", renderAll);
  }

  // ====== 新增表單 ======
  function bindForm(){
    // 標籤輸入 → Enter 轉 chip
    const tagsInput = $("#tagsInput");
    const tagsDisplay = $("#tagsDisplay");
    tagsInput.addEventListener("keydown", e => {
      if (e.key === "Enter"){
        e.preventDefault();
        const v = tagsInput.value.trim();
        if (!v) return;
        addTagChip(v, tagsDisplay);
        tagsInput.value = "";
      }
    });

    el.addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const rec = readFormToRecipe();
      state.recipes.push(rec);
      renderAll();
      showSuccess("✅ 食譜新增成功！");

      try {
        await persistRecipes();
        flashStats("已自動儲存");
      } catch (err) {
        console.warn("自動儲存失敗：", err);
        flashStats("未能自動儲存，請用『匯出 CSV』備份");
      }

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
    const ingredients = Array.from(el.ingredientsList.querySelectorAll("input"))
      .map(i => i.value.trim()).filter(Boolean).join(" | ");
    const steps = Array.from(el.stepsList.querySelectorAll("input"))
      .map(i => i.value.trim()).filter(Boolean).join("\n");
    const tags = Array.from($("#tagsDisplay").querySelectorAll(".tag-chip"))
      .map(ch => ch.textContent.trim()).join(";");

    return {
      id: genId(),
      title: $("#recipeTitle").value.trim(),
      category: $("#recipeCategory").value,
      tags,
      ingredients,
      steps,
      prep_minutes: $("#prepTime").value || "",
      cook_minutes: $("#cookTime").value || "",
      servings: $("#recipeServings").value || "",
      calories: $("#calories").value || "",
      image_url: $("#imageUrl").value.trim()
    };
  }

  function clearForm(){
    el.addForm.reset();
    $("#tagsDisplay").innerHTML = "";
    el.ingredientsList.innerHTML = `
      <div class="ingredient-item">
        <input type="text" placeholder="例如：義大利麵 200g" required />
        <button type="button" class="remove-btn" onclick="app.removeIngredient(this)">移除</button>
      </div>`;
    el.stepsList.innerHTML = `
      <div class="step-item">
        <span style="font-weight: bold; min-width: 30px;">1.</span>
        <input type="text" placeholder="詳細描述第一個步驟" required />
        <button type="button" class="remove-btn" onclick="app.removeStep(this)">移除</button>
      </div>`;
  }

  // ====== 編輯抽屜 ======
  function bindEditDrawer(){
    // 卡片上的「編輯」按鈕事件（事件委派）
    el.recipesContainer.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".edit-btn");
      if (!btn) return;
      const id = btn.dataset.id;
      const rec = state.recipes.find(r => r.id === id);
      if (!rec) return;
      openEditDrawer(rec);
    });

    el.closeDrawer.addEventListener("click", closeEditDrawer);

    // 即時預覽所選圖片
    el.edit.imageFile.addEventListener("change", () => {
      const file = el.edit.imageFile.files?.[0];
      el.edit.imagePreview.innerHTML = "";
      if (!file) return;
      const url = URL.createObjectURL(file);
      const img = document.createElement("img");
      img.src = url;
      img.onload = () => URL.revokeObjectURL(url);
      el.edit.imagePreview.appendChild(img);
    });

    // 儲存（更新）
    el.edit.saveBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!state.currentEditId) return;
      const idx = state.recipes.findIndex(r => r.id === state.currentEditId);
      if (idx === -1) return;

      // 更新文字欄位
      const r = state.recipes[idx];
      r.title = el.edit.title.value.trim();
      r.category = el.edit.category.value.trim();
      r.tags = el.edit.tags.value.trim();
      r.ingredients = el.edit.ingredients.value.trim();
      r.steps = el.edit.steps.value.trim();
      r.prep_minutes = el.edit.prep.value || "";
      r.cook_minutes = el.edit.cook.value || "";
      r.servings = el.edit.servings.value || "";
      r.calories = el.edit.calories.value || "";

      // 圖片：僅在 FS Access + 已選資料夾時嘗試寫入 images/
      const file = el.edit.imageFile.files?.[0];
      if (file && state.storageMode === "fs-access" && state.pickedDirHandle) {
        try {
          const imgUrl = await saveImageToImagesFolder(file);
          if (imgUrl) r.image_url = imgUrl; // 例如 "images/xxx.png"
        } catch (err) {
          console.warn("保存圖片失敗（已忽略）：", err);
        }
      }
      // 若未選資料夾或 iOS/OPFS 環境：不儲存圖檔，只保留原本 image_url

      try {
        await persistRecipes();
        renderAll();
        closeEditDrawer();
        alert("✅ 已更新並寫入 recipes.csv");
      } catch (err) {
        console.error(err);
        alert("寫入失敗：" + err.message);
      }
    });

    // 刪除
    el.edit.delBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!state.currentEditId) return;
      const idx = state.recipes.findIndex(r => r.id === state.currentEditId);
      if (idx === -1) return;

      const ok = confirm("確定要刪除這筆食譜嗎？此動作無法還原。");
      if (!ok) return;

      state.recipes.splice(idx, 1);
      try {
        await persistRecipes();
        renderAll();
        closeEditDrawer();
        alert("🗑️ 已刪除並寫入 recipes.csv");
      } catch (err) {
        console.error(err);
        alert("寫入失敗：" + err.message);
      }
    });
  }

  function openEditDrawer(rec){
    state.currentEditId = rec.id;
    el.edit.title.value = rec.title || "";
    el.edit.category.value = rec.category || "";
    el.edit.tags.value = rec.tags || "";
    el.edit.ingredients.value = rec.ingredients || "";
    el.edit.steps.value = rec.steps || "";
    el.edit.prep.value = rec.prep_minutes || "";
    el.edit.cook.value = rec.cook_minutes || "";
    el.edit.servings.value = rec.servings || "";
    el.edit.calories.value = rec.calories || "";
    el.edit.imageFile.value = "";
    el.edit.imagePreview.innerHTML = rec.image_url
      ? `<img src="${escapeHtml(rec.image_url)}" alt="image" />`
      : "";
    el.drawer.classList.remove("hidden");
    el.drawer.setAttribute("aria-hidden", "false");
  }

  function closeEditDrawer(){
    state.currentEditId = null;
    el.drawer.classList.add("hidden");
    el.drawer.setAttribute("aria-hidden", "true");
  }

  // ====== Render ======
  function renderAll(){
    const q = el.searchInput.value.trim().toLowerCase();
    const cat = el.categorySelect.value;
    const list = state.recipes.filter(r => {
      const hitText = (r.title + " " + r.ingredients + " " + r.tags).toLowerCase().includes(q);
      const hitCat = !cat || r.category === cat;
      return hitText && hitCat;
    });

    // 分類下拉
    const cats = Array.from(new Set(state.recipes.map(r => r.category).filter(Boolean)));
    el.categorySelect.innerHTML = `<option value="">📋 全部分類</option>` + cats.map(c => `<option value="${c}">${c}</option>`).join("");
    if (cat) el.categorySelect.value = cat;

    // 清單
    el.recipesContainer.innerHTML = list.map(renderCard).join("");
  }

  function renderCard(r){
    const tagHtml = (r.tags || "").split(";").filter(Boolean).map(t => `<span class="tag">${t}</span>`).join("");
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
            <details>
              <summary>食材</summary>
              <div class="ingredients-list">${escapeHtml((r.ingredients||"").replace(/\|/g, "｜"))}</div>
            </details>
            <details>
              <summary>步驟</summary>
              <div class="steps-list">${escapeHtml((r.steps||"").replace(/\n/g,"<br>"))}</div>
            </details>
          </div>
          <div style="margin-top:12px; display:flex; gap:8px;">
            <button class="btn btn-secondary edit-btn" data-id="${r.id}">✏️ 編輯</button>
          </div>
        </div>
      </div>
    `;
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  // ====== Topbar：FS/OPFS/匯出/匯入 ======
  async function onPickFolder(){
    if (!hasFSAccess) {
      alert("此瀏覽器不支援選擇資料夾（File System Access）。可改用 OPFS 或按『匯出 CSV』保存。");
      return;
    }
    try {
      const dirHandle = await window.showDirectoryPicker();
      const perm = await dirHandle.requestPermission({ mode: "readwrite" });
      if (perm !== "granted") throw new Error("未授權寫入資料夾");
      state.pickedDirHandle = dirHandle;
      state.fileHandle = await dirHandle.getFileHandle(CSV_FILE, { create: true });

      // 若資料夾中已有舊檔，讀入
      try {
        const file = await state.fileHandle.getFile();
        const text = await file.text();
        const { rows } = await window.csvTextToArray(text);
        state.recipes = normalizeRows(rows);
        renderAll();
        flashStats("已載入資料夾現有 recipes.csv");
      } catch {}
      alert("✅ 已選擇資料夾並定位 recipes.csv");
    } catch (err) {
      console.error(err);
      alert("無法選擇資料夾或授權失敗：" + err.message);
    }
  }

  async function onWriteCSV(){
    try {
      await persistRecipes(true);
      alert("💾 已寫入 recipes.csv！");
    } catch (err) {
      console.error(err);
      alert("寫入失敗：" + err.message + "。請改用『匯出 CSV』備份。");
    }
  }

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
      state.recipes = normalizeRows(rows);
      renderAll();
      flashStats("已匯入 CSV");
    } catch (err) {
      alert("匯入失敗：" + err.message);
    } finally {
      e.target.value = "";
    }
  }

  // ====== 實際保存：FS Access -> OPFS -> 下載備援 ======
  async function persistRecipes(force = false){
    const csvText = window.arrayToCSV(state.recipes, FIELDS);

    if (state.storageMode === "fs-access" && state.fileHandle) {
      const w = await state.fileHandle.createWritable();
      await w.write(csvText);
      await w.close();
      return;
    }

    if (state.storageMode === "fs-access" && !state.fileHandle && !force) {
      // 尚未選資料夾且不是強制寫入時，略過（例如表單新增時）
    }

    if (hasOPFS) {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(CSV_FILE, { create: true });
      const w = await handle.createWritable();
      await w.write(csvText);
      await w.close();
      return;
    }

    if (force) throw new Error("此環境無法直接寫檔，請使用『匯出 CSV』下載保存。");
  }

  // ====== 圖片保存（僅 FS Access 情境） ======
  async function saveImageToImagesFolder(file){
    if (!(state.storageMode === "fs-access" && state.pickedDirHandle)) {
      throw new Error("非 FS Access 環境或尚未選擇資料夾");
    }
    // 建立/取得 images 子資料夾
    const imagesDirHandle = await ensureSubDir(state.pickedDirHandle, "images");
    // 生成安全檔名：時間戳 + 原始副檔名
    const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] || ".png").toLowerCase();
    const safeName = `img_${Date.now()}${ext}`;
    const imgHandle = await imagesDirHandle.getFileHandle(safeName, { create: true });
    const w = await imgHandle.createWritable();
    await w.write(file);
    await w.close();
    return `images/${safeName}`; // 回傳可在 <img src> 直接使用的相對路徑
  }

  async function ensureSubDir(dirHandle, name){
    // 目前 File System Access 標準沒有官方「確保目錄存在」API；部分瀏覽器實作 getDirectoryHandle(name,{create:true})
    if (dirHandle.getDirectoryHandle) {
      return await dirHandle.getDirectoryHandle(name, { create: true });
    }
    // 保險 fallback（理論上不會走到）
    throw new Error("此環境不支援建立子資料夾");
  }

  // ====== 工具 ======
  function genId(){
    return "R" + Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  function showSuccess(msg){
    el.successMessage.textContent = msg;
    el.successMessage.style.display = "block";
    setTimeout(() => el.successMessage.style.display = "none", 1800);
  }

  function flashStats(msg){
    if (!msg) msg = `目前共有 ${state.recipes.length} 道食譜`;
    el.stats.textContent = msg;
    setTimeout(() => {
      el.stats.textContent = `目前共有 ${state.recipes.length} 道食譜`;
    }, 1500);
  }

  // ====== Ingredients / Steps inline hooks ======
  window.app = {
    addIngredient(){
      const row = document.createElement("div");
      row.className = "ingredient-item";
      row.innerHTML = `
        <input type="text" placeholder="例如：雞胸肉 200g" required />
        <button type="button" class="remove-btn" onclick="app.removeIngredient(this)">移除</button>`;
      el.ingredientsList.appendChild(row);
    },
    removeIngredient(btn){
      btn.closest(".ingredient-item").remove();
    },
    addStep(){
      const row = document.createElement("div");
      row.className = "step-item";
      row.innerHTML = `
        <span style="font-weight: bold; min-width: 30px;">•</span>
        <input type="text" placeholder="下一個步驟" required />
        <button type="button" class="remove-btn" onclick="app.removeStep(this)">移除</button>`;
      el.stepsList.appendChild(row);
    },
    removeStep(btn){
      btn.closest(".step-item").remove();
    },
    clearForm
  };
})();