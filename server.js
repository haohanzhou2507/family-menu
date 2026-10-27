const http = require('node:http')
const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { safeTutorialUrl, resolveTutorial } = require('./tutorial')

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

const publicFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
])

function initialState() {
  return { recipes: structuredClone(sampleRecipes), picked: [], migrationOpen: true }
}

function isValidState(value) {
  return value && Array.isArray(value.recipes) && Array.isArray(value.picked)
}

async function readRequestBody(request) {
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > 1_000_000) throw new Error('请求内容过大')
  }
  return JSON.parse(body)
}

async function readImageBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 8_000_000) throw new Error('图片不能超过 8MB')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function createAppServer(options = {}) {
  const publicDir = options.publicDir || __dirname
  const dataFile = options.dataFile || process.env.DATA_FILE || path.join(__dirname, 'data', 'state.json')
  const uploadDir = path.join(path.dirname(dataFile), 'uploads')
  let writeQueue = Promise.resolve()
  const tutorialCache = new Map()

  function writeState(state) {
    writeQueue = writeQueue.then(async () => {
      await fs.mkdir(path.dirname(dataFile), { recursive: true })
      const temporaryFile = `${dataFile}.tmp`
      await fs.writeFile(temporaryFile, `${JSON.stringify(state, null, 2)}\n`)
      await fs.rename(temporaryFile, dataFile)
    })
    return writeQueue
  }

  async function readState() {
    try {
      const state = JSON.parse(await fs.readFile(dataFile, 'utf8'))
      if (!isValidState(state)) throw new Error('数据文件格式无效')
      return state
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      const state = initialState()
      await writeState(state)
      return state
    }
  }

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost')

      if (url.pathname === '/api/tutorial' && request.method === 'GET') {
        const value = url.searchParams.get('url') || ''
        try { safeTutorialUrl(value) } catch {
          response.writeHead(400, { 'content-type': 'application/json' })
          return response.end(JSON.stringify({ error: '不支持的教程链接' }))
        }
        let result
        const cached = tutorialCache.get(value)
        if (cached && cached.expires > Date.now()) result = cached.result
        else {
          try { result = await resolveTutorial(value) } catch { result = { webUrl: value, appUrl: null } }
          if (tutorialCache.size >= 256) tutorialCache.delete(tutorialCache.keys().next().value)
          tutorialCache.set(value, { result, expires: Date.now() + (result.appUrl ? 3600000 : 30000) })
        }
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        return response.end(JSON.stringify(result))
      }

      if (url.pathname === '/api/state' && request.method === 'GET') {
        const state = await readState()
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        return response.end(JSON.stringify(state))
      }

      if (url.pathname === '/api/state' && request.method === 'PUT') {
        const nextState = await readRequestBody(request)
        if (!isValidState(nextState)) {
          response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
          return response.end(JSON.stringify({ error: '菜单数据格式无效' }))
        }
        const currentState = await readState()
        if (nextState.migration === true && !currentState.migrationOpen) {
          response.writeHead(409, { 'content-type': 'application/json; charset=utf-8' })
          return response.end(JSON.stringify(currentState))
        }
        const savedState = { recipes: nextState.recipes, picked: nextState.picked, migrationOpen: false }
        await writeState(savedState)
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        return response.end(JSON.stringify(savedState))
      }

      if (url.pathname === '/api/images' && request.method === 'POST') {
        const imageTypes = new Map([
          ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'],
          ['image/gif', 'gif'], ['image/heic', 'heic'], ['image/heif', 'heif'],
        ])
        const contentType = request.headers['content-type']?.split(';')[0]
        const extension = imageTypes.get(contentType)
        if (!extension) {
          response.writeHead(415, { 'content-type': 'application/json; charset=utf-8' })
          return response.end(JSON.stringify({ error: '仅支持 JPG、PNG、WebP、GIF 或 HEIC 图片' }))
        }
        const image = await readImageBody(request)
        if (!image.length) {
          response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
          return response.end(JSON.stringify({ error: '图片内容为空' }))
        }
        await fs.mkdir(uploadDir, { recursive: true })
        const fileName = `${randomUUID()}.${extension}`
        await fs.writeFile(path.join(uploadDir, fileName), image)
        response.writeHead(201, { 'content-type': 'application/json; charset=utf-8' })
        return response.end(JSON.stringify({ url: `/uploads/${fileName}` }))
      }

      if (url.pathname.startsWith('/uploads/') && request.method === 'GET') {
        const fileName = path.basename(url.pathname)
        if (url.pathname !== `/uploads/${fileName}`) {
          response.writeHead(404)
          return response.end()
        }
        const extension = path.extname(fileName).slice(1).toLowerCase()
        const imageTypes = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif' }
        if (!imageTypes[extension]) {
          response.writeHead(404)
          return response.end()
        }
        const image = await fs.readFile(path.join(uploadDir, fileName))
        response.writeHead(200, { 'content-type': imageTypes[extension], 'cache-control': 'public, max-age=31536000, immutable' })
        return response.end(image)
      }

      const publicFile = publicFiles.get(url.pathname)
      if (publicFile && request.method === 'GET') {
        const [fileName, contentType] = publicFile
        const content = await fs.readFile(path.join(publicDir, fileName))
        response.writeHead(200, { 'content-type': contentType })
        return response.end(content)
      }

      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Not found')
    } catch (error) {
      console.error(error)
      response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ error: '服务器保存菜单时出错' }))
    }
  })
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000
  createAppServer().listen(port, process.env.HOST || '0.0.0.0', () => {
    console.log(`家常菜单已启动：http://localhost:${port}`)
  })
}

module.exports = { createAppServer }
