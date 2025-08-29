class RecipeApp {
  constructor() {
    this.recipes = [];
    this.filteredrecipes = [];
    this.currentView = 'grid';
    this.editTargetId = null;

    this.pages = {
      browse: document.getElementById('browsePage'),
      add: document.getElementById('addPage'),
    };
    this.navButtons = Array.from(document.querySelectorAll('.nav-btn'));
    this.successMessage = null;

    // 圖片 blob:ObjectURL 快取
    this.imageURLCache = new Map();

    this.init();
  }

  async init() {
    this.setupEventListeners();
    this.setupNavTabs();
    this.setupAddForm();
    this.setupEditDrawer();
    // 離線版：一開始不載資料，等使用者選資料夾
    this.renderEmptyWithHint();

    // 釋放 blob URL
    window.addEventListener('beforeunload', () => {
      for (const url of this.imageURLCache.values()) URL.revokeObjectURL(url);
      this.imageURLCache.clear();
    });
  }

  renderEmptyWithHint() {
    const stats = document.getElementById('stats');
    stats.textContent = '請先按「選擇資料夾」以載入本地 recipes.csv';

    const container = document.getElementById('recipesContainer');
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">📂</div>
        <h3>尚未選擇資料夾</h3>
        <p>請點上方「選擇資料夾」，本 App 將讀取該資料夾中的 <code>recipes.csv</code> 與 <code>images/</code> 圖片。</p>
      </div>`;
  }

  // ====== File System Access：資料夾選擇與 CSV 載入 ======
  async afterFolderPicked() {
    await this.ensureCSVExists();     // 若沒有 recipes.csv 就建立
    await this.loadCSVFromLocal();    // 讀入本地 CSV
    this.filteredrecipes = [...this.recipes];
    this.updateCategories();
    this.render();
  }

  async ensureCSVExists() {
    try {
      await __recipesDirHandle.getFileHandle('recipes.csv'); // 存在就好
    } catch {
      // 不存在 → 建立 with header
      const headers = ["id", "title", "category", "tags", "ingredients", "steps", "prep_minutes", "cook_minutes", "servings", "calories", "image_url"];
      const csvText = headers.join(",") + "\n";
      const fh = await __recipesDirHandle.getFileHandle("recipes.csv", { create: true });
      await writeFile(fh, new Blob([csvText], { type: "text/csv;charset=utf-8" }));
    }
  }

  async loadCSVFromLocal() {
    try {
      const fh = await __recipesDirHandle.getFileHandle('recipes.csv');
      const file = await fh.getFile();
      const text = await file.text();
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      // 確保每筆都有 id（若空檔就給新 id）
      this.recipes = (parsed.data || []).map((x, i) => ({
        ...x,
        id: x.id && String(x.id).trim() ? x.id : this.makeId(i)
      }));
      if (!this.recipes.length) {
        this.recipes = []; // 空表
      }
    } catch (e) {
      console.error('讀取本地 recipes.csv 失敗：', e);
      alert('讀取本地 recipes.csv 失敗，請確認權限或檔案是否存在。');
      this.recipes = [];
    }
  }

  makeId(idx = 0) {
    // 以目前陣列長度 + idx 生成
    return 'R' + String(this.recipes.length + idx + 1).padStart(3, '0');
  }

  // ====== UI 綁定 ======
  setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    const categorySelect = document.getElementById('categorySelect');
    const viewButtons = document.querySelectorAll('.view-btn');

    searchInput?.addEventListener('input', () => this.filterrecipes());
    categorySelect?.addEventListener('change', () => this.filterrecipes());

    viewButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        viewButtons.forEach((b) => b.classList.remove('active'));
        e.target.classList.add('active');
        this.currentView = e.target.dataset.view;
        this.updateViewClass();
      });
    });
  }

  setupNavTabs() {
    this.navButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.navButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        const pageKey = btn.dataset.page; // "browse" | "add"
        Object.values(this.pages).forEach((p) => p.classList.remove('active'));
        if (this.pages[pageKey]) this.pages[pageKey].classList.add('active');

        if (pageKey === 'add' && this.successMessage) {
          this.successMessage.style.display = 'none';
        }
      });
    });
  }

  setupAddForm() {
    const form = document.getElementById('addRecipeForm');
    this.successMessage = document.getElementById('successMessage');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!__recipesDirHandle || !__imagesDirHandle) {
        alert('尚未選擇資料夾，請先按「選擇資料夾」。');
        return;
      }

      const title = document.getElementById('recipeTitle').value.trim();
      const category = document.getElementById('recipeCategory').value.trim();
      const servings = document.getElementById('recipeServings').value.trim();
      const prep = document.getElementById('prepTime').value.trim();
      const cook = document.getElementById('cookTime').value.trim();
      const calories = document.getElementById('calories').value.trim();

      const tagsInput = document.getElementById('tagsInput').value.trim();
      const chips = Array.from(document.querySelectorAll('#tagsDisplay .tag-chip')).map((x) => x.dataset.tag);
      const tags = [...chips, ...(tagsInput ? [tagsInput] : [])].join(';');

      const ingredients = Array.from(document.querySelectorAll('#ingredientsList .ingredient-item input'))
        .map((i) => i.value.trim()).filter(Boolean).join('|');

      const steps = Array.from(document.querySelectorAll('#stepsList .step-item input'))
        .map((i) => i.value.trim()).filter(Boolean).join('>');

      if (!title) { alert('請輸入食譜名稱'); return; }
      if (!ingredients) { alert('請至少輸入一項食材'); return; }
      if (!steps) { alert('請至少輸入一個步驟'); return; }

      const newId = this.makeId();

      // 僅本地：上傳圖片 → images/ 產生檔名 → CSV 存相對路徑
      let imageUrl = '';
      const imageFile = document.getElementById('recipeImageFile').files[0];
      if (imageFile) {
        try {
          const result = await saveImageToLocalFolder(imageFile, newId);
          if (result.ok) imageUrl = result.relativePath;
        } catch (err) {
          console.error('圖片上傳錯誤:', err);
          alert('圖片上傳失敗；你仍可稍後在編輯中補上圖片。');
        }
      }

      const newRecipe = {
        id: newId,
        title,
        category,
        tags,
        ingredients,
        steps,
        prep_minutes: prep || '0',
        cook_minutes: cook || '0',
        servings: servings || '',
        calories: calories || '',
        image_url: imageUrl,
      };
      await this.withStableUI(() => {
        this.recipes.unshift(newRecipe);
        this.filteredRecipes = this.recipes;
      });// 立即寫回本地 CSV

      // 內含 render

      this.successMessage.style.display = 'block';
      const browseBtn = this.navButtons.find((b) => b.dataset.page === 'browse');
      browseBtn.click();
      this.clearForm();
    });

    // 標籤 chip
    const tagsInput = document.getElementById('tagsInput');
    const tagsDisplay = document.getElementById('tagsDisplay');
    tagsInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && tagsInput.value.trim()) {
        e.preventDefault();
        const tag = tagsInput.value.trim();
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.dataset.tag = tag;
        chip.textContent = `#${tag} ×`;
        chip.addEventListener('click', () => chip.remove());
        tagsDisplay.appendChild(chip);
        tagsInput.value = '';
      }
    });

    // 新增頁：圖片預覽
    const addImageInput = document.getElementById('recipeImageFile');
    const addImagePreview = document.getElementById('addImagePreview');
    addImageInput.addEventListener('change', (e) => {
      addImagePreview.innerHTML = '';
      const file = e.target.files[0];
      if (file) {
        const url = URL.createObjectURL(file);
        const img = document.createElement('img');
        img.src = url;
        Object.assign(img.style, {
          maxWidth: '200px', maxHeight: '150px', borderRadius: '8px', objectFit: 'cover'
        });
        addImagePreview.appendChild(img);
      }
    });
  }

  setupEditDrawer() {
    const drawer = document.getElementById('editDrawer');
    const closeBtn = document.getElementById('closeDrawer');
    const saveBtn = document.getElementById('saveRecipe');
    const deleteBtn = document.getElementById('deleteRecipe');

    closeBtn.addEventListener('click', () => {
      drawer.classList.add('hidden');
      drawer.setAttribute('aria-hidden', 'true');
      this.editTargetId = null;
    });

    saveBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!__recipesDirHandle) { alert('尚未選擇資料夾'); return; }
      await this.saveEditedRecipe();
      await writeCSVToLocal(); // 儲存後立刻寫回
    });

    deleteBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!__recipesDirHandle) { alert('尚未選擇資料夾'); return; }
      if (confirm('確定要刪除這個食譜嗎？')) {
        this.deleteRecipe();
        await writeCSVToLocal(); // 刪除後立刻寫回
      }
    });
  }

  editRecipe(id) {
    if (!__recipesDirHandle) { alert('尚未選擇資料夾'); return; }

    const recipe = this.recipes.find(r => r.id === id);
    if (!recipe) return;

    this.editTargetId = id;
    const drawer = document.getElementById('editDrawer');
    const form = document.getElementById('editForm');

    form.title.value = recipe.title || '';
    form.category.value = recipe.category || '';
    form.tags.value = recipe.tags || '';
    form.ingredients.value = (recipe.ingredients || '').replace(/\|/g, '\n');
    form.steps.value = (recipe.steps || '').replace(/>/g, '\n');
    form.prep_minutes.value = recipe.prep_minutes || '';
    form.cook_minutes.value = recipe.cook_minutes || '';
    form.servings.value = recipe.servings || '';
    form.calories.value = recipe.calories || '';
    form.image_url.value = recipe.image_url || '';

    const preview = document.getElementById('imagePreview');
    preview.innerHTML = '';
    if (recipe.image_url) {
      this.resolveImageURL(recipe.image_url).then(src => {
        const img = document.createElement('img');
        img.src = src;
        Object.assign(img.style, { maxWidth: '100%', borderRadius: '8px', marginBottom: '8px' });
        preview.appendChild(img);

        const caption = document.createElement('div');
        caption.textContent = '目前的圖片';
        Object.assign(caption.style, { fontSize: '0.9rem', color: '#666' });
        preview.appendChild(caption);
      }).catch(() => { });
    }

    drawer.classList.remove('hidden');
    drawer.setAttribute('aria-hidden', 'false');
  }

  async saveEditedRecipe() {
    const form = document.getElementById('editForm');
    const index = this.recipes.findIndex(r => r.id === this.editTargetId);
    if (index === -1) return;

    let imageUrl = form.image_url.value.trim();

    // 新上傳圖片 → 覆蓋/新增
    const imageFile = document.getElementById('imageFile').files[0];
    if (imageFile) {
      try {
        const result = await saveImageToLocalFolder(imageFile, this.editTargetId);
        if (result.ok) imageUrl = result.relativePath;
      } catch (err) {
        console.error('圖片上傳錯誤:', err);
        alert('圖片上傳失敗；將沿用原圖片網址/路徑。');
      }
    }

    this.recipes[index] = {
      ...this.recipes[index],
      title: form.title.value.trim(),
      category: form.category.value.trim(),
      tags: form.tags.value.trim(),
      ingredients: form.ingredients.value.trim().replace(/\n/g, '|'),
      steps: form.steps.value.trim().replace(/\n/g, '>'),
      prep_minutes: form.prep_minutes.value || '0',
      cook_minutes: form.cook_minutes.value || '0',
      servings: form.servings.value || '',
      calories: form.calories.value || '',
      image_url: imageUrl,
    };

    await this.withStableUI(() => {
      // ...更新資料邏輯（維持你現有那段）...
      this.filteredRecipes = this.recipes; // 直接更新快取，不再另觸發 filterRecipes() 的 render
    });
    const drawer = document.getElementById('editDrawer');
    drawer.classList.add('hidden');
    drawer.setAttribute('aria-hidden', 'true');
    this.editTargetId = null;
  }

  deleteRecipe() {
    const index = this.recipes.findIndex(r => r.id === this.editTargetId);
    if (index !== -1) {
      this.withStableUI(() => {
        this.recipes.splice(index, 1);
        this.filteredRecipes = this.recipes;
      });
      const drawer = document.getElementById('editDrawer');
      drawer.classList.add('hidden');
      drawer.setAttribute('aria-hidden', 'true');
      this.editTargetId = null;
    }
  }

  // ===== 動態欄位 =====
  addIngredient() {
    const wrap = document.getElementById('ingredientsList');
    const div = document.createElement('div');
    div.className = 'ingredient-item';
    div.innerHTML = `
      <input type="text" placeholder="例如：番茄 2顆" required />
      <button type="button" class="remove-btn">移除</button>`;
    div.querySelector('.remove-btn').addEventListener('click', () => div.remove());
    wrap.appendChild(div);
  }
  removeIngredient(btn) {
    btn.closest('.ingredient-item')?.remove();
  }

  addStep() {
    const wrap = document.getElementById('stepsList');
    const idx = wrap.querySelectorAll('.step-item').length + 1;
    const div = document.createElement('div');
    div.className = 'step-item';
    div.innerHTML = `
      <span style="font-weight:bold;min-width:30px;">${idx}.</span>
      <input type="text" placeholder="詳細描述步驟" required />
      <button type="button" class="remove-btn">移除</button>`;
    div.querySelector('.remove-btn').addEventListener('click', () => {
      div.remove();
      Array.from(wrap.querySelectorAll('.step-item span')).forEach((s, i) => (s.textContent = (i + 1) + '.'));
    });
    wrap.appendChild(div);
  }
  removeStep(btn) {
    btn.closest('.step-item')?.remove();
  }

  clearForm() {
    document.getElementById('addRecipeForm').reset();
    document.getElementById('tagsDisplay').innerHTML = '';
    document.getElementById('addImagePreview').innerHTML = '';
    document.getElementById('ingredientsList').innerHTML = `
      <div class="ingredient-item">
        <input type="text" placeholder="例如：義大利麵 200g" required />
        <button type="button" class="remove-btn" onclick="app.removeIngredient(this)">移除</button>
      </div>`;
    document.getElementById('stepsList').innerHTML = `
      <div class="step-item">
        <span style="font-weight: bold; min-width: 30px;">1.</span>
        <input type="text" placeholder="詳細描述第一個步驟" required />
        <button type="button" class="remove-btn" onclick="app.removeStep(this)">移除</button>
      </div>`;
  }

  updateCategories() {
    const categorySelect = document.getElementById('categorySelect');
    const categories = [...new Set(this.recipes.map((r) => r.category).filter(Boolean))].sort();
    categorySelect.querySelectorAll('option:not(:first-child)').forEach((o) => o.remove());
    categories.forEach((category) => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      categorySelect.appendChild(option);
    });
  }

  filterRecipes() {
    const ui = this.captureUIState();
    const searchTerm = (document.getElementById('searchInput').value || '').toLowerCase();
    const selectedCategory = document.getElementById('categorySelect').value;
    this.filteredRecipes = this.recipes.filter(/* ... */);
    this.render();
    this.restoreUIState(ui);
    this.restoreUIState(ui);
  }

  captureUIState() {
    return {
      scrollY: window.scrollY,
      search: (document.getElementById('searchInput')?.value || ''),
      category: (document.getElementById('categorySelect')?.value || ''),
      view: this.currentView
    };
  }
  restoreUIState(state) {
    if (!state) return;
    const s = document.getElementById('searchInput');
    const c = document.getElementById('categorySelect');
    if (s && s.value !== state.search) s.value = state.search;
    if (c && c.value !== state.category) c.value = state.category;
    if (this.currentView !== state.view) {
      this.currentView = state.view;
      this.updateViewClass();
    }
    // 還原滾動位置（用 rAF 確保在重繪後）
    requestAnimationFrame(() => window.scrollTo({ top: state.scrollY, left: 0, behavior: 'auto' }));
  }
  async withStableUI(updaterFn) {
    const ui = this.captureUIState();
    await Promise.resolve(updaterFn?.());
    this.render();
    this.restoreUIState(ui);
  }

  updateViewClass() {
    const container = document.getElementById('recipesContainer');
    container.className = this.currentView === 'grid' ? 'recipes-grid' : 'recipes-list';
  }

  render() {
    this.updateStats();
    this.renderrecipes();
  }

  updateStats() {
    const stats = document.getElementById('stats');
    const total = this.recipes.length;
    const showing = this.filteredrecipes.length;
    stats.textContent = `顯示 ${showing} / ${total} 道食譜`;
  }

  // 只走本地資料夾：把 CSV 內的 image_url（images/檔名 或 檔名）轉為 blob URL
  async resolveImageURL(value) {
    if (!value) return '';
    const v = String(value).trim();
    if (/^(data:|blob:)/i.test(v)) return v; // 仍允許 data/blob

    if (!__imagesDirHandle) return ''; // 尚未選資料夾 → 先不顯示

    const name = v.replace(/^images\//i, '');
    if (this.imageURLCache.has(name)) return this.imageURLCache.get(name);

    try {
      const fh = await __imagesDirHandle.getFileHandle(name);
      const file = await fh.getFile();
      const url = URL.createObjectURL(file);
      this.imageURLCache.set(name, url);
      return url;
    } catch (e) {
      console.warn('找不到圖片於 images/：', v);
      return '';
    }
  }

  renderrecipes() {
    const container = document.getElementById('recipesContainer');
    if (this.filteredrecipes.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="icon">🔍</div>
          <h3>找不到符合條件的食譜</h3>
          <p>試著調整搜尋關鍵字或分類篩選</p>
        </div>`;
      return;
    }

    container.innerHTML = this.filteredrecipes.map((recipe) => {
      const totalMin = (parseInt(recipe.prep_minutes || 0, 10) || 0) + (parseInt(recipe.cook_minutes || 0, 10) || 0);
      const tagsHtml = recipe.tags
        ? recipe.tags.split(';').map((tag) => `<span class="tag">${tag.trim()}</span>`).join('')
        : '';

      return `
      <div class="recipe-card">
        <div class="recipe-image">
          ${recipe.image_url ? `<img data-img="${recipe.id}" alt="${recipe.title}">` : '🍽️'}
        </div>
        <div class="recipe-content">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <h3 class="recipe-title">${recipe.title || ''}</h3>
            <button onclick="app.editRecipe('${recipe.id}')" class="btn" style="font-size: 0.8rem; padding: 4px 8px;">編輯</button>
          </div>
          <div class="recipe-meta">
            <span class="meta-item">⏱️ ${totalMin} 分鐘</span>
            <span class="meta-item">👥 ${recipe.servings || '？'} 人份</span>
            ${recipe.calories ? `<span class="meta-item">🔥 ${recipe.calories} 卡</span>` : ''}
          </div>
          ${tagsHtml ? `<div class="recipe-tags">${tagsHtml}</div>` : ''}
          <div class="recipe-details">
            <details>
              <summary>📝 材料清單</summary>
              <div class="ingredients-list">
                ${(recipe.ingredients || '').split('|').map((i) => `<div>• ${i.trim()}</div>`).join('')}
              </div>
            </details>
            <details>
              <summary>👨‍🍳 製作步驟</summary>
              <div class="steps-list">
                ${(recipe.steps || '').split('>').map((s) => `<div class="step">${s.trim()}</div>`).join('')}
              </div>
            </details>
          </div>
        </div>
      </div>`;
    }).join('');

    // 異步補圖（只能在已選資料夾後）
    if (__imagesDirHandle) {
      this.filteredrecipes.forEach(async (recipe) => {
        if (!recipe.image_url) return;
        const imgEl = container.querySelector(`img[data-img="${recipe.id}"]`);
        if (!imgEl) return;
        try {
          const src = await this.resolveImageURL(recipe.image_url);
          if (src) imgEl.src = src;
          imgEl.removeAttribute('data-img');
        } catch (e) {
          console.warn('圖片載入失敗：', recipe.image_url, e);
        }
      });
    }
  }
}

// ====== 啟動 ======
const app = new RecipeApp();
window.app = app;

// ====== 本地檔案環境變數 ======
let __recipesDirHandle = null;
let __imagesDirHandle = null;

async function pickrecipesFolder() {
  if (!window.showDirectoryPicker) { alert("你的瀏覽器不支援選擇資料夾。請改用 Chrome/Edge。"); return; }
  try {
    __recipesDirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    __imagesDirHandle = await __recipesDirHandle.getDirectoryHandle("images", { create: true });
    alert("已選擇資料夾：之後圖片會存到 images/，CSV 會讀/寫於該資料夾。");
    await app.afterFolderPicked();
  } catch (e) { console.error(e); }
}

async function writeFile(handle, data) {
  const w = await handle.createWritable();
  await w.write(data);
  await w.close();
}

function extFromFilename(n) {
  const m = (n || "").match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : "png";
}

async function saveImageToLocalFolder(file, recipeId) {
  if (!__recipesDirHandle || !__imagesDirHandle) return { ok: false, reason: "NO_DIR" };
  const ext = extFromFilename(file.name);
  const filename = `${recipeId}-${Date.now()}.${ext}`;
  const fh = await __imagesDirHandle.getFileHandle(filename, { create: true });
  await writeFile(fh, await file.arrayBuffer());
  return { ok: true, relativePath: `images/${filename}` };
}

async function writeCSVToLocal() {
  if (!__recipesDirHandle) { alert("尚未選擇資料夾。請先按「選擇資料夾」。"); return; }
  const headers = ["id", "title", "category", "tags", "ingredients", "steps", "prep_minutes", "cook_minutes", "servings", "calories", "image_url"];
  const esc = (s) => {
    if (s == null) return "";
    s = String(s);
    if (s.includes(",") || s.includes("\"") || s.includes("\n") || s.includes("\r"))
      return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const r of app.recipes) { lines.push(headers.map(h => esc(r[h])).join(",")); }

  // 加 BOM & CRLF
  const bom = "\uFEFF";
  const csvText = bom + lines.join("\r\n");

  const csvHandle = await __recipesDirHandle.getFileHandle("recipes.csv", { create: true });
  await writeFile(csvHandle, new Blob([csvText], { type: "text/csv;charset=utf-8" }));
  alert("已寫入 recipes.csv (UTF-8 with BOM)，Excel 開啟不會亂碼。");
}

// ====== 頂部按鈕綁定（離線限定）======
document.addEventListener("click", (ev) => {
  const t = ev.target;
  if (!t) return;
  if (t.id === "btnPickFolder") pickrecipesFolder();
  if (t.id === "btnWriteCSV") writeCSVToLocal();
  if (t.id === "btnExport") {
    const headers = ["id", "title", "category", "tags", "ingredients", "steps", "prep_minutes", "cook_minutes", "servings", "calories", "image_url"];
    const esc = (s) => {
      if (s == null) return "";
      s = String(s);
      if (s.includes(",") || s.includes("\"") || s.includes("\n") || s.includes("\r"))
        return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [headers.join(",")];
    for (const r of app.recipes) { lines.push(headers.map(h => esc(r[h])).join(",")); }

    const bom = "\uFEFF";
    const csvText = bom + lines.join("\r\n");

    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "recipes.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
});

// 編輯抽屜：新圖片預覽
document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t && t.id === "imageFile") {
    const preview = document.getElementById("imagePreview");
    if (!preview) return;
    preview.innerHTML = "";
    const f = t.files && t.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = document.createElement("img");
    img.src = url;
    Object.assign(img.style, { maxWidth: "100%", borderRadius: "12px" });
    preview.appendChild(img);
    const caption = document.createElement('div');
    caption.textContent = '新上傳的圖片預覽';
    Object.assign(caption.style, { fontSize: '0.9rem', color: '#666', marginTop: '8px' });
    preview.appendChild(caption);
  }
});

// 暴露全域
window.recipes = app.recipes;
window.filteredrecipes = app.filteredrecipes;
