const test = require('node:test')
const assert = require('node:assert/strict')
const { safeTutorialUrl, resolveTutorial } = require('./tutorial')

test('教程解析拒绝非平台域名、伪装域名、凭据和端口', () => {
  for (const url of ['http://b23.tv/a', 'https://localhost/a', 'https://b23.tv.evil.com/a', 'https://user@b23.tv/a', 'https://b23.tv:3000/a']) assert.throws(() => safeTutorialUrl(url))
})
test('抖音视频、分享地址和 B 站分 P 生成相应 App 路径', async () => {
  assert.equal((await resolveTutorial('https://www.douyin.com/video/123456789')).appUrl, 'snssdk1128://aweme/detail/123456789')
  assert.equal((await resolveTutorial('https://www.iesdouyin.com/share/video/123456789/')).appUrl, 'snssdk1128://aweme/detail/123456789')
  assert.equal((await resolveTutorial('https://www.bilibili.com/video/av170001?p=2')).appUrl, 'bilibili://video/170001?page=2')
})
test('B 站短链解析及 BV 转 AV；阻止短链跳转任意站点', async () => {
  const request = async (url) => url.startsWith('https://b23.tv/') ? new Response(null, { status: 302, headers: { location: 'https://www.bilibili.com/video/BV17x411w7KC?p=3' } }) : url.startsWith('https://api.bilibili.com/') ? Response.json({ code: 0, data: { aid: 170001 } }) : new Response('ok')
  assert.equal((await resolveTutorial('https://b23.tv/test', request)).appUrl, 'bilibili://video/170001?page=3')
  await assert.rejects(resolveTutorial('https://b23.tv/test', async () => new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/' } })))
})
