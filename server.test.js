const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { createAppServer } = require('./server')

async function startServer(dataFile) {
  const server = createAppServer({ dataFile })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return { server, baseUrl: `http://127.0.0.1:${port}` }
}

test('菜单写入服务器后，重启服务仍能读取', async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'family-menu-'))
  const dataFile = path.join(temporaryDirectory, 'state.json')
  context.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }))

  let running = await startServer(dataFile)
  const initialState = await (await fetch(`${running.baseUrl}/api/state`)).json()
  assert.equal(initialState.recipes.length, 3)

  const expectedState = {
    recipes: [{
      id: 'test', name: '测试菜', category: '家常菜', ingredients: [],
      ingredientsText: '鸡蛋 2 个', steps: [], tutorialUrl: 'https://b23.tv/test', imageUrl: '/uploads/test.png',
    }],
    picked: ['test'],
  }
  const saveResponse = await fetch(`${running.baseUrl}/api/state`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(expectedState),
  })
  assert.equal(saveResponse.status, 200)
  await new Promise((resolve) => running.server.close(resolve))

  running = await startServer(dataFile)
  context.after(() => new Promise((resolve) => running.server.close(resolve)))
  const restoredState = await (await fetch(`${running.baseUrl}/api/state`)).json()
  assert.deepEqual(restoredState.recipes, expectedState.recipes)
  assert.deepEqual(restoredState.picked, expectedState.picked)
})

test('旧浏览器数据只能迁移一次', async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'family-menu-migration-'))
  const dataFile = path.join(temporaryDirectory, 'state.json')
  const running = await startServer(dataFile)
  context.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }))
  context.after(() => new Promise((resolve) => running.server.close(resolve)))

  const legacyState = { recipes: [], picked: [], migration: true }
  const firstResponse = await fetch(`${running.baseUrl}/api/state`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(legacyState),
  })
  assert.equal(firstResponse.status, 200)

  const secondResponse = await fetch(`${running.baseUrl}/api/state`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(legacyState),
  })
  assert.equal(secondResponse.status, 409)
})

test('上传的菜品图片保存在服务器并可访问', async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'family-menu-image-'))
  const dataFile = path.join(temporaryDirectory, 'state.json')
  const running = await startServer(dataFile)
  context.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }))
  context.after(() => new Promise((resolve) => running.server.close(resolve)))

  const image = Buffer.from('test-image')
  const uploadResponse = await fetch(`${running.baseUrl}/api/images`, {
    method: 'POST',
    headers: { 'content-type': 'image/png' },
    body: image,
  })
  assert.equal(uploadResponse.status, 201)
  const uploaded = await uploadResponse.json()

  const imageResponse = await fetch(`${running.baseUrl}${uploaded.url}`)
  assert.equal(imageResponse.headers.get('content-type'), 'image/png')
  assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), image)
})
