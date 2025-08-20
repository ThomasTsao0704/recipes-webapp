class RecipeApp {
  constructor() {
    this.recipes = [];
    this.filteredRecipes = [];
    this.currentView = 'grid';

    // 分頁元素
    this.pages = {
      browse: document.getElementById('browsePage'),
      add: document.getElementById('addPage'),
    };
    this.navButtons = Array.from(document.querySelectorAll('.nav-btn'));
    this.successMessage = null;

    this.init();
  }

  async init() {
    await this.loadSampleData();
    this.setupEventListeners();
    this.setupNavTabs();
    this.setupAddForm();
    this.render();
  }

  // 範例資料（實務可改為載入 CSV）
  async loadSampleData() {
  const resp = await fetch('recipes.csv');           // 放同資料夾
  const text = await resp.text();
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  this.recipes = parsed.data;
  this.filteredRecipes = [...this.recipes];
  this.updateCategories();
}


  setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    const categorySelect = document.getElementById('categorySelect');
    const viewButtons = document.querySelectorAll('.view-btn');

    searchInput.addEventListener('input', () => this.filterRecipes());
    categorySelect.addEventListener('change', () => this.filterRecipes());

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
        // 切按鈕 active
        this.navButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        // 切頁 active
        const pageKey = btn.dataset.page; // "browse" | "add"
        Object.values(this.pages).forEach((p) => p.classList.remove('active'));
        if (this.pages[pageKey]) this.pages[pageKey].classList.add('active');

        // 進入新增頁時，清一次成功提示
        if (pageKey === 'add' && this.successMessage) {
          this.successMessage.style.display = 'none';
        }
      });
    });
  }

  setupAddForm() {
    const form = document.getElementById('addRecipeForm');
    this.successMessage = document.getElementById('successMessage');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = document.getElementById('recipeTitle').value.trim();
      const category = document.getElementById('recipeCategory').value.trim();
      const servings = document.getElementById('recipeServings').value.trim();
      const prep = document.getElementById('prepTime').value.trim();
      const cook = document.getElementById('cookTime').value.trim();
      const calories = document.getElementById('calories').value.trim();
      const imageUrl = document.getElementById('imageUrl').value.trim();

      // 標籤：輸入框 + chip
      const tagsInput = document.getElementById('tagsInput').value.trim();
      const chips = Array.from(document.querySelectorAll('#tagsDisplay .tag-chip')).map((x) => x.dataset.tag);
      const tags = [...chips, ...(tagsInput ? [tagsInput] : [])].join(';');

      // 食材
      const ingredients = Array.from(document.querySelectorAll('#ingredientsList .ingredient-item input'))
        .map((i) => i.value.trim())
        .filter(Boolean)
        .join('|');

      // 步驟
      const steps = Array.from(document.querySelectorAll('#stepsList .step-item input'))
        .map((i) => i.value.trim())
        .filter(Boolean)
        .join('>');

      const newRecipe = {
        id: 'R' + String(this.recipes.length + 1).padStart(3, '0'),
        title,
        category,
        tags,
        ingredients,
        steps,
        prep_minutes: prep || '0',
        cook_minutes: cook || '0',
        servings: servings || '',
        calories: calories || '',
        image_url: imageUrl || '',
      };

      // 基本驗證
      if (!newRecipe.title) { alert('請輸入食譜名稱'); return; }
      if (!newRecipe.ingredients) { alert('請至少輸入一項食材'); return; }
      if (!newRecipe.steps) { alert('請至少輸入一個步驟'); return; }

      // 寫入並重繪
      this.recipes.unshift(newRecipe);
      this.filterRecipes(); // 內含 render

      // 成功提示
      this.successMessage.style.display = 'block';

      // 切回瀏覽頁
      const browseBtn = this.navButtons.find((b) => b.dataset.page === 'browse');
      browseBtn.click();

      // 清表單
      this.clearForm();
    });

    // 標籤 Enter 轉 chip
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
  }

  // 表單動態欄位
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
      Array.from(wrap.querySelectorAll('.step-item span')).forEach((s, i) => (s.textContent = i + 1 + '.'));
    });
    wrap.appendChild(div);
  }
  removeStep(btn) {
    btn.closest('.step-item')?.remove();
  }

  clearForm() {
    document.getElementById('addRecipeForm').reset();
    document.getElementById('tagsDisplay').innerHTML = '';
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
    const categories = [...new Set(this.recipes.map((r) => r.category))].sort();
    // 清理舊選項（保留第一個「全部」）
    categorySelect.querySelectorAll('option:not(:first-child)').forEach((o) => o.remove());
    categories.forEach((category) => {
      if (category) {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categorySelect.appendChild(option);
      }
    });
  }

  filterRecipes() {
    const searchTerm = (document.getElementById('searchInput').value || '').toLowerCase();
    const selectedCategory = document.getElementById('categorySelect').value;
    this.filteredRecipes = this.recipes.filter((recipe) => {
      const matchesSearch =
        !searchTerm ||
        (recipe.title && recipe.title.toLowerCase().includes(searchTerm)) ||
        (recipe.tags && recipe.tags.toLowerCase().includes(searchTerm)) ||
        (recipe.ingredients && recipe.ingredients.toLowerCase().includes(searchTerm));
      const matchesCategory = !selectedCategory || recipe.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
    this.render();
  }

  updateViewClass() {
    const container = document.getElementById('recipesContainer');
    container.className = this.currentView === 'grid' ? 'recipes-grid' : 'recipes-list';
  }

  render() {
    this.updateStats();
    this.renderRecipes();
  }

  updateStats() {
    const stats = document.getElementById('stats');
    const total = this.recipes.length;
    const showing = this.filteredRecipes.length;
    stats.textContent = `顯示 ${showing} / ${total} 道食譜`;
  }

  renderRecipes() {
    const container = document.getElementById('recipesContainer');
    if (this.filteredRecipes.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="icon">🔍</div>
          <h3>找不到符合條件的食譜</h3>
          <p>試著調整搜尋關鍵字或分類篩選</p>
        </div>`;
      return;
    }
    container.innerHTML = this.filteredRecipes
      .map(
        (recipe) => `
      <div class="recipe-card">
        <div class="recipe-image">
          ${recipe.image_url ? `<img src="${recipe.image_url}" alt="${recipe.title}">` : '🍽️'}
        </div>
        <div class="recipe-content">
          <h3 class="recipe-title">${recipe.title}</h3>
          <div class="recipe-meta">
            <span class="meta-item">⏱️ ${parseInt(recipe.prep_minutes || 0) + parseInt(recipe.cook_minutes || 0)} 分鐘</span>
            <span class="meta-item">👥 ${recipe.servings || '－'} 人份</span>
            ${recipe.calories ? `<span class="meta-item">🔥 ${recipe.calories} 卡</span>` : ''}
          </div>
          ${recipe.tags ? `<div class="recipe-tags">
            ${recipe.tags.split(';').map((tag) => `<span class="tag">${tag.trim()}</span>`).join('')}
          </div>` : ''}
          <div class="recipe-details">
            <details>
              <summary>📝 材料清單</summary>
              <div class="ingredients-list">
                ${recipe.ingredients.split('|').map((i) => `<div>• ${i.trim()}</div>`).join('')}
              </div>
            </details>
            <details>
              <summary>👨‍🍳 製作步驟</summary>
              <div class="steps-list">
                ${recipe.steps.split('>').map((s) => `<div class="step">${s.trim()}</div>`).join('')}
              </div>
            </details>
          </div>
        </div>
      </div>`
      )
      .join('');
  }
}

// 啟動 & 讓表單 onclick 能呼叫
const app = new RecipeApp();
window.app = app;
