const STORAGE_KEY = 'family-menu-recipes-v1'
const PICKED_KEY = 'family-menu-picked-v1'
const APP_BASE = new URL('.', document.currentScript.src)

function imageSource(value = '') {
  return value.startsWith('/uploads/') ? new URL(value.slice(1), APP_BASE).href : value
}

const state = {
  recipes: [],
  picked: [],
  category: '全部',
  search: '',
  view: 'menu',
}

const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => [...document.querySelectorAll(selector)]

function loadLegacy(key) {
  try {
    return JSON.parse(localStorage.getItem(key))
  } catch {
    return null
  }
}

let saveQueue = Promise.resolve()
function save() {
  const body = JSON.stringify({ recipes: state.recipes, picked: state.picked })
  const request = saveQueue.then(async () => {
    const response = await fetch(new URL('api/state', APP_BASE), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body,
    })
    if (!response.ok) throw new Error('菜单保存失败')
  })
  saveQueue = request.catch(() => {})
  return request.then(() => true).catch((error) => {
    console.error(error)
    toast('保存失败，请稍后重试')
    return false
  })
}

async function loadServerState() {
  const response = await fetch(new URL('api/state', APP_BASE), { cache: 'no-store' })
  if (!response.ok) throw new Error('菜单读取失败')
  const serverState = await response.json()
  const legacyRecipes = loadLegacy(STORAGE_KEY)
  const legacyPicked = loadLegacy(PICKED_KEY)

  if (serverState.migrationOpen && Array.isArray(legacyRecipes)) {
    const migration = await fetch(new URL('api/state', APP_BASE), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ recipes: legacyRecipes, picked: Array.isArray(legacyPicked) ? legacyPicked : [], migration: true }),
    })
    if (migration.ok) {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(PICKED_KEY)
      return migration.json()
    }
    if (migration.status === 409) return migration.json()
    throw new Error('旧菜单迁移失败')
  }
  return serverState
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;',
  })[char])
}

function tutorialLines(recipe) {
  if (Array.isArray(recipe.steps)) return recipe.steps
  return String(recipe.tutorialText || '').split('\n').map((line) => line.trim()).filter(Boolean)
}

function extractTutorialUrl(value = '') {
  const match = String(value).match(/https?:\/\/[^\s]+/i)
  if (!match) return ''
  const candidate = match[0].replace(/[，。！？、；：）》】]+$/, '')
  try {
    const url = new URL(candidate)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

function tutorialPlatform(url) {
  try {
    const host = new URL(url).hostname
    if ((host === 'douyin.com' || host.endsWith('.douyin.com') || host === 'www.iesdouyin.com')) return '在抖音打开教程'
    if ((host === 'bilibili.com' || host.endsWith('.bilibili.com')) || host === 'b23.tv') return '在哔哩哔哩打开教程'
  } catch {}
  return '打开教程链接'
}

function showImagePreview(src = '') {
  $('#recipe-image-url').value = src
  $('#image-preview-picture').src = imageSource(src)
  $('#image-preview').classList.toggle('hidden', !src)
}

async function uploadImage(file) {
  const response = await fetch(new URL('api/images', APP_BASE), {
    method: 'POST',
    headers: { 'content-type': file.type },
    body: file,
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || '图片上传失败')
  return result.url
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
    (!query || recipe.name.toLowerCase().includes(query) ||
      (recipe.ingredients || []).some((item) => item.name.toLowerCase().includes(query)) ||
      String(recipe.ingredientsText || '').toLowerCase().includes(query))
  )

  $('#dish-grid').innerHTML = visible.map((recipe, index) => {
    const selected = state.picked.includes(recipe.id)
    return `
      <article class="dish-card ${selected ? 'selected' : ''} ${recipe.imageUrl ? 'has-image' : ''}">
        ${recipe.imageUrl ? `<img class="dish-card-image" src="${escapeHtml(imageSource(recipe.imageUrl))}" alt="" loading="lazy" />` : ''}
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
  const validPicked = state.picked.filter((id) => state.recipes.some((recipe) => recipe.id === id))
  if (validPicked.length !== state.picked.length) {
    state.picked = validPicked
    save()
  }
  const recipes = state.picked.map((id) => state.recipes.find((recipe) => recipe.id === id))
  const isEmpty = recipes.length === 0
  $('#picked-empty').classList.toggle('hidden', !isEmpty)
  $('#picked-content').classList.toggle('hidden', isEmpty)
  $('#clear-picked').classList.toggle('hidden', isEmpty)
  $('#picked-list').innerHTML = recipes.map((recipe) => `
    <article class="picked-item">
      <button data-cook="${recipe.id}">
        <strong>${escapeHtml(recipe.name)} →</strong>
        <small>${tutorialLines(recipe).length ? `${tutorialLines(recipe).length} 个步骤` : recipe.tutorialUrl ? '视频教程' : '暂未添加教程'} · 点击查看</small>
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
}

function summarizeIngredients(recipes) {
  const summary = new Map()
  recipes.forEach((recipe) => (recipe.ingredients || []).forEach((ingredient) => {
    const key = `${ingredient.name.trim()}__${ingredient.unit.trim()}`
    const numeric = Number(ingredient.quantity)
    const existing = summary.get(key) || { name: ingredient.name, unit: ingredient.unit, total: 0, text: [], dishes: [] }
    if (ingredient.quantity !== '' && Number.isFinite(numeric)) existing.total += numeric
    else if (ingredient.quantity && !existing.text.includes(ingredient.quantity)) existing.text.push(ingredient.quantity)
    if (!existing.dishes.includes(recipe.name)) existing.dishes.push(recipe.name)
    summary.set(key, existing)
  }))
  const structured = [...summary.values()].map((item) => ({
    ...item,
    display: item.total > 0 ? `${formatNumber(item.total)}${item.unit}` : `${item.text.join('、')}${item.unit}`,
  }))
  const plainText = recipes.flatMap((recipe) => String(recipe.ingredientsText || '').split('\n')
    .map((line) => line.trim()).filter(Boolean)
    .map((line) => ({ name: line, display: '按需', dishes: [recipe.name] })))
  return [...structured, ...plainText]
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}

function renderCook(id) {
  const recipe = state.recipes.find((item) => item.id === id)
  if (!recipe) return
  const steps = tutorialLines(recipe)
  const tutorialUrl = extractTutorialUrl(recipe.tutorialUrl)
  $('#cook-content').innerHTML = `
    ${recipe.imageUrl ? `<img class="cook-cover" src="${escapeHtml(imageSource(recipe.imageUrl))}" alt="${escapeHtml(recipe.name)}" />` : ''}
    <p class="cook-kicker">COOKING GUIDE · ${escapeHtml(recipe.category)}</p>
    <h1 id="cook-title">${escapeHtml(recipe.name)}</h1>
    <p class="cook-meta">食材准备好，就按顺序开始吧。</p>
    <div class="cook-columns">
      <section>
        <h2>食材</h2>
        <ul class="cook-ingredients">
          ${(recipe.ingredients || []).map((item) => `<li><span>${escapeHtml(item.name)}</span><strong>${escapeHtml(item.quantity)}${escapeHtml(item.unit)}</strong></li>`).join('')}
        </ul>
        ${recipe.ingredientsText ? `<p class="plain-ingredients">${escapeHtml(recipe.ingredientsText)}</p>` : ''}
        ${!(recipe.ingredients || []).length && !recipe.ingredientsText ? '<p>暂未添加食材</p>' : ''}
      </section>
      <section>
        <h2>做法</h2>
        ${steps.length ? `<ol class="cook-steps">${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>` : ''}
        ${!steps.length && !tutorialUrl ? '<p>暂未添加教程</p>' : ''}
        ${tutorialUrl ? `<a class="tutorial-link" id="tutorial-open-app" href="${escapeHtml(tutorialUrl)}" target="_blank" rel="noopener noreferrer external">网页查看教程 <span>↗</span></a>
          <a id="tutorial-web-fallback" class="text-button hidden" href="${escapeHtml(tutorialUrl)}" target="_blank" rel="noopener noreferrer external">无法打开 App？网页查看</a>` : ''}
      </section>
    </div>
  `
  showView('cook')
  if (tutorialUrl) prepareTutorialAppLink(tutorialUrl)
}

async function prepareTutorialAppLink(tutorialUrl) {
  if (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return
  const link = $('#tutorial-open-app')
  const fallback = $('#tutorial-web-fallback')
  const endpoint = new URL('api/tutorial', APP_BASE)
  endpoint.searchParams.set('url', tutorialUrl)
  try {
    const response = await fetch(endpoint)
    if (!response.ok) return
    const result = await response.json()
    if (!link.isConnected || !result.appUrl) return
    let destination = result.appUrl
    if (/Android/i.test(navigator.userAgent)) {
      const scheme = new URL(result.appUrl).protocol.slice(0, -1)
      const packageName = result.platform === 'douyin' ? 'com.ss.android.ugc.aweme' : 'tv.danmaku.bili'
      destination = `intent://${result.appUrl.split('://')[1]}#Intent;scheme=${scheme};package=${packageName};S.browser_fallback_url=${encodeURIComponent(tutorialUrl)};end`
    }
    link.href = destination
    link.removeAttribute('target')
    link.innerHTML = `${tutorialPlatform(tutorialUrl)} <span>↗</span>`
    fallback.classList.remove('hidden')
  } catch { /* Keep the original webpage link available. */ }
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
  showImagePreview('')
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
  $('#recipe-ingredients-text').value = recipe.ingredientsText || ''
  $('#recipe-steps').value = tutorialLines(recipe).join('\n')
  $('#recipe-tutorial-url').value = recipe.tutorialUrl || ''
  showImagePreview(recipe.imageUrl || '')
  $('#editor-title').textContent = '修改这道菜'
  $('#delete-recipe').classList.remove('hidden')
  $('#ingredient-rows').innerHTML = ''
  if ((recipe.ingredients || []).length) recipe.ingredients.forEach(addIngredientRow)
  else addIngredientRow()
  showView('editor')
}

async function submitRecipe(event) {
  event.preventDefault()
  const ingredients = $$('.ingredient-row').map((row) => ({
    name: row.querySelector('.ingredient-name').value.trim(),
    quantity: row.querySelector('.ingredient-quantity').value.trim(),
    unit: row.querySelector('.ingredient-unit').value.trim(),
  })).filter((item) => item.name)
  const ingredientsText = $('#recipe-ingredients-text').value.trim()
  const steps = $('#recipe-steps').value.split('\n').map((step) => step.trim()).filter(Boolean)
  const tutorialInput = $('#recipe-tutorial-url').value.trim()
  const tutorialUrl = extractTutorialUrl(tutorialInput)
  if (tutorialInput && !tutorialUrl) return toast('教程链接格式不正确')

  const saveButton = event.submitter || $('.save-button')
  saveButton.disabled = true
  saveButton.textContent = '正在保存…'
  let imageUrl = $('#recipe-image-url').value
  try {
    const imageFile = $('#recipe-image').files[0]
    if (imageFile) {
      if (imageFile.size > 8_000_000) throw new Error('图片不能超过 8MB')
      imageUrl = await uploadImage(imageFile)
    }
  } catch (error) {
    toast(error.message)
    saveButton.disabled = false
    saveButton.textContent = '保存菜谱'
    return
  }

  const id = $('#recipe-id').value || `recipe-${Date.now()}`
  const recipe = {
    id,
    name: $('#recipe-name').value.trim(),
    category: $('#recipe-category').value.trim(),
    ingredients,
    ingredientsText,
    steps,
    tutorialUrl,
    imageUrl,
  }
  const index = state.recipes.findIndex((item) => item.id === id)
  if (index >= 0) state.recipes[index] = recipe
  else state.recipes.unshift(recipe)
  if (!await save()) {
    saveButton.disabled = false
    saveButton.textContent = '保存菜谱'
    return
  }
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
  $('#menu-clear-picked').disabled = state.picked.length === 0
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
    removeRow.closest('.ingredient-row').remove()
  }
})

$('#search-input').addEventListener('input', (event) => {
  state.search = event.target.value
  renderMenu()
})
$('#add-ingredient').addEventListener('click', () => addIngredientRow())
$('#recipe-image').addEventListener('change', (event) => {
  const file = event.target.files[0]
  if (file) showImagePreview(URL.createObjectURL(file))
})
$('#remove-image').addEventListener('click', () => {
  $('#recipe-image').value = ''
  showImagePreview('')
})
$('#recipe-form').addEventListener('submit', submitRecipe)
$('#delete-recipe').addEventListener('click', deleteRecipe)
$$('[data-clear-picked]').forEach((button) => button.addEventListener('click', async () => {
  if (state.picked.length === 0) return
  state.picked = []
  const saved = save()
  renderPicked()
  renderMenu()
  if (await saved) toast('已清空本次选菜')
}))

async function init() {
  resetEditor()
  try {
    const savedState = await loadServerState()
    state.recipes = savedState.recipes
    state.picked = savedState.picked
  } catch (error) {
    console.error(error)
    toast('无法从服务器读取菜单，请刷新重试')
  }
  renderMenu()
  renderPicked()
}

init()
