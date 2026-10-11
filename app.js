const STORAGE_KEY = 'family-menu-recipes-v1'
const PICKED_KEY = 'family-menu-picked-v1'

const sampleRecipes = [
  {
    id: 'tomato-eggs',
    name: '番茄炒蛋',
    category: '家常菜',
    ingredients: [
      { name: '番茄', quantity: '2', unit: '个' },
      { name: '鸡蛋', quantity: '3', unit: '个' },
      { name: '食用油', quantity: '适量', unit: '' },
      { name: '盐', quantity: '少许', unit: '' },
    ],
    steps: ['鸡蛋打散，加少许盐搅匀。', '番茄切块，热锅下油，倒入蛋液炒熟后盛出。', '原锅放入番茄炒软，加入鸡蛋翻炒均匀，调味后出锅。'],
  },
  {
    id: 'braised-wings',
    name: '红烧鸡翅',
    category: '荤菜',
    ingredients: [
      { name: '鸡翅中', quantity: '10', unit: '个' },
      { name: '生姜', quantity: '4', unit: '片' },
      { name: '生抽', quantity: '2', unit: '勺' },
      { name: '冰糖', quantity: '15', unit: '克' },
    ],
    steps: ['鸡翅洗净，两面划两刀，冷水下锅焯水。', '锅中放少许油和冰糖，小火炒出糖色。', '放入鸡翅和姜片翻炒上色，加生抽和热水。', '小火焖二十分钟，转大火收汁。'],
  },
  {
    id: 'garlic-lettuce',
    name: '蒜蓉生菜',
    category: '素菜',
    ingredients: [
      { name: '生菜', quantity: '1', unit: '颗' },
      { name: '大蒜', quantity: '4', unit: '瓣' },
      { name: '食用油', quantity: '适量', unit: '' },
      { name: '盐', quantity: '少许', unit: '' },
    ],
    steps: ['生菜洗净沥干，大蒜切末。', '锅烧热后放油，下蒜末爆香。', '开大火放入生菜快速翻炒，断生后加盐出锅。'],
  },
]

const state = {
  recipes: load(STORAGE_KEY, sampleRecipes),
  picked: load(PICKED_KEY, []),
  category: '全部',
  search: '',
  view: 'menu',
}

const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => [...document.querySelectorAll(selector)]

function load(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key))
    return value ?? structuredClone(fallback)
  } catch {
    return structuredClone(fallback)
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.recipes))
  localStorage.setItem(PICKED_KEY, JSON.stringify(state.picked))
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;',
  })[char])
}

function showView(name) {
  state.view = name
  $$('.view').forEach((view) => view.classList.toggle('active', view.id === `${name}-view`))
  $$('.bottom-nav button').forEach((button) => button.classList.toggle('active', button.dataset.view === name))
  if (name === 'menu') renderMenu()
  if (name === 'picked') renderPicked()
  if (name === 'editor' && !$('#recipe-id').value) resetEditor()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function renderMenu() {
  const categories = ['全部', ...new Set(state.recipes.map((recipe) => recipe.category))]
  if (!categories.includes(state.category)) state.category = '全部'
  $('#category-filter').innerHTML = categories.map((category) => `
    <button class="${category === state.category ? 'active' : ''}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>
  `).join('')

  const query = state.search.trim().toLowerCase()
  const visible = state.recipes.filter((recipe) =>
    (state.category === '全部' || recipe.category === state.category) &&
    (!query || recipe.name.toLowerCase().includes(query) || recipe.ingredients.some((item) => item.name.toLowerCase().includes(query)))
  )

  $('#dish-grid').innerHTML = visible.map((recipe, index) => {
    const selected = state.picked.includes(recipe.id)
    return `
      <article class="dish-card ${selected ? 'selected' : ''}">
        <span class="dish-number">NO.${String(index + 1).padStart(2, '0')}</span>
        <h2>${escapeHtml(recipe.name)}</h2>
        <span class="dish-category">${escapeHtml(recipe.category)}</span>
        <div class="dish-card-footer">
          <button class="edit-dish" data-edit="${recipe.id}">编辑菜谱</button>
          <button class="pick-button" data-pick="${recipe.id}" aria-label="${selected ? '取消选择' : '选择'}${escapeHtml(recipe.name)}">${selected ? '✓' : '+'}</button>
        </div>
      </article>
    `
  }).join('')

  $('#empty-menu').classList.toggle('hidden', state.recipes.length > 0 || Boolean(query))
  updateCount()
}

function togglePicked(id) {
  const recipe = state.recipes.find((item) => item.id === id)
  if (!recipe) return
  if (state.picked.includes(id)) {
    state.picked = state.picked.filter((pickedId) => pickedId !== id)
    toast(`已取消「${recipe.name}」`)
  } else {
    state.picked.push(id)
    toast(`已选「${recipe.name}」`)
  }
  save()
  renderMenu()
  renderPicked()
}

function renderPicked() {
  state.picked = state.picked.filter((id) => state.recipes.some((recipe) => recipe.id === id))
  const recipes = state.picked.map((id) => state.recipes.find((recipe) => recipe.id === id))
  const isEmpty = recipes.length === 0
  $('#picked-empty').classList.toggle('hidden', !isEmpty)
  $('#picked-content').classList.toggle('hidden', isEmpty)
  $('#clear-picked').classList.toggle('hidden', isEmpty)
  $('#picked-list').innerHTML = recipes.map((recipe) => `
    <article class="picked-item">
      <button data-cook="${recipe.id}">
        <strong>${escapeHtml(recipe.name)} →</strong>
        <small>${recipe.steps.length} 个步骤 · 点击看教程</small>
      </button>
      <button class="remove-picked" data-pick="${recipe.id}" aria-label="移除${escapeHtml(recipe.name)}">×</button>
    </article>
  `).join('')

  const ingredients = summarizeIngredients(recipes)
  $('#ingredient-summary').innerHTML = ingredients.map((item) => `
    <li>
      <span>${escapeHtml(item.name)} <small>用于 ${escapeHtml(item.dishes.join('、'))}</small></span>
      <strong>${escapeHtml(item.display)}</strong>
    </li>
  `).join('')
  updateCount()
  save()
}

function summarizeIngredients(recipes) {
  const summary = new Map()
  recipes.forEach((recipe) => recipe.ingredients.forEach((ingredient) => {
    const key = `${ingredient.name.trim()}__${ingredient.unit.trim()}`
    const numeric = Number(ingredient.quantity)
    const existing = summary.get(key) || { name: ingredient.name, unit: ingredient.unit, total: 0, text: [], dishes: [] }
    if (ingredient.quantity !== '' && Number.isFinite(numeric)) existing.total += numeric
    else if (ingredient.quantity && !existing.text.includes(ingredient.quantity)) existing.text.push(ingredient.quantity)
    if (!existing.dishes.includes(recipe.name)) existing.dishes.push(recipe.name)
    summary.set(key, existing)
  }))
  return [...summary.values()].map((item) => ({
    ...item,
    display: item.total > 0 ? `${formatNumber(item.total)}${item.unit}` : `${item.text.join('、')}${item.unit}`,
  }))
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}

function renderCook(id) {
  const recipe = state.recipes.find((item) => item.id === id)
  if (!recipe) return
  $('#cook-content').innerHTML = `
    <p class="cook-kicker">COOKING GUIDE · ${escapeHtml(recipe.category)}</p>
    <h1 id="cook-title">${escapeHtml(recipe.name)}</h1>
    <p class="cook-meta">食材准备好，就按顺序开始吧。</p>
    <div class="cook-columns">
      <section>
        <h2>食材</h2>
        <ul class="cook-ingredients">
          ${recipe.ingredients.map((item) => `<li><span>${escapeHtml(item.name)}</span><strong>${escapeHtml(item.quantity)}${escapeHtml(item.unit)}</strong></li>`).join('')}
        </ul>
      </section>
      <section>
        <h2>做法</h2>
        <ol class="cook-steps">
          ${recipe.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}
        </ol>
      </section>
    </div>
  `
  showView('cook')
}

function addIngredientRow(ingredient = { name: '', quantity: '', unit: '' }) {
  const row = $('#ingredient-row-template').content.firstElementChild.cloneNode(true)
  row.querySelector('.ingredient-name').value = ingredient.name
  row.querySelector('.ingredient-quantity').value = ingredient.quantity
  row.querySelector('.ingredient-unit').value = ingredient.unit
  $('#ingredient-rows').append(row)
}

function resetEditor() {
  $('#recipe-form').reset()
  $('#recipe-id').value = ''
  $('#editor-title').textContent = '录入一道菜'
  $('#delete-recipe').classList.add('hidden')
  $('#ingredient-rows').innerHTML = ''
  addIngredientRow()
  addIngredientRow()
}

function editRecipe(id) {
  const recipe = state.recipes.find((item) => item.id === id)
  if (!recipe) return
  $('#recipe-id').value = recipe.id
  $('#recipe-name').value = recipe.name
  $('#recipe-category').value = recipe.category
  $('#recipe-steps').value = recipe.steps.join('\n')
  $('#editor-title').textContent = '修改这道菜'
  $('#delete-recipe').classList.remove('hidden')
  $('#ingredient-rows').innerHTML = ''
  recipe.ingredients.forEach(addIngredientRow)
  showView('editor')
}

function submitRecipe(event) {
  event.preventDefault()
  const ingredients = $$('.ingredient-row').map((row) => ({
    name: row.querySelector('.ingredient-name').value.trim(),
    quantity: row.querySelector('.ingredient-quantity').value.trim(),
    unit: row.querySelector('.ingredient-unit').value.trim(),
  })).filter((item) => item.name)
  if (!ingredients.length) return toast('至少需要一种食材')

  const id = $('#recipe-id').value || `recipe-${Date.now()}`
  const recipe = {
    id,
    name: $('#recipe-name').value.trim(),
    category: $('#recipe-category').value.trim(),
    ingredients,
    steps: $('#recipe-steps').value.split('\n').map((step) => step.trim()).filter(Boolean),
  }
  const index = state.recipes.findIndex((item) => item.id === id)
  if (index >= 0) state.recipes[index] = recipe
  else state.recipes.unshift(recipe)
  save()
  resetEditor()
  showView('menu')
  toast(index >= 0 ? '菜谱已更新' : '新菜已加入菜单')
}

function deleteRecipe() {
  const id = $('#recipe-id').value
  const recipe = state.recipes.find((item) => item.id === id)
  if (!recipe || !confirm(`确定删除「${recipe.name}」吗？`)) return
  state.recipes = state.recipes.filter((item) => item.id !== id)
  state.picked = state.picked.filter((pickedId) => pickedId !== id)
  save()
  resetEditor()
  showView('menu')
  toast('菜谱已删除')
}

function updateCount() {
  $('#picked-count').textContent = state.picked.length
  $('#nav-count').textContent = state.picked.length
}

let toastTimer
function toast(message) {
  const element = $('#toast')
  element.textContent = message
  element.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => element.classList.remove('show'), 1700)
}

document.addEventListener('click', (event) => {
  const viewButton = event.target.closest('[data-view]')
  if (viewButton) showView(viewButton.dataset.view)

  const categoryButton = event.target.closest('[data-category]')
  if (categoryButton) {
    state.category = categoryButton.dataset.category
    renderMenu()
  }

  const pickButton = event.target.closest('[data-pick]')
  if (pickButton) togglePicked(pickButton.dataset.pick)

  const editButton = event.target.closest('[data-edit]')
  if (editButton) editRecipe(editButton.dataset.edit)

  const cookButton = event.target.closest('[data-cook]')
  if (cookButton) renderCook(cookButton.dataset.cook)

  const removeRow = event.target.closest('.remove-row')
  if (removeRow) {
    if ($$('.ingredient-row').length === 1) return toast('至少保留一种食材')
    removeRow.closest('.ingredient-row').remove()
  }
})

$('#search-input').addEventListener('input', (event) => {
  state.search = event.target.value
  renderMenu()
})
$('#add-ingredient').addEventListener('click', () => addIngredientRow())
$('#recipe-form').addEventListener('submit', submitRecipe)
$('#delete-recipe').addEventListener('click', deleteRecipe)
$('#clear-picked').addEventListener('click', () => {
  state.picked = []
  save()
  renderPicked()
  renderMenu()
})

resetEditor()
renderMenu()
renderPicked()
