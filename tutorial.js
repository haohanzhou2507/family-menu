const allowedHosts = new Set(['www.douyin.com', 'douyin.com', 'v.douyin.com', 'www.iesdouyin.com', 'iesdouyin.com', 'www.bilibili.com', 'bilibili.com', 'm.bilibili.com', 'b23.tv'])

function safeTutorialUrl(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname) || url.username || url.password || (url.port && url.port !== '443')) throw new Error('不支持的教程链接')
  return url
}

async function resolveTutorial(value, request = fetch) {
  let url = safeTutorialUrl(value)
  const platform = url.hostname.endsWith('bilibili.com') || url.hostname === 'b23.tv' ? 'bilibili' : 'douyin'
  const signal = AbortSignal.timeout(7000)
  // Follow only platform-owned HTTPS redirects; never fetch arbitrary destinations.
  if (url.hostname === 'b23.tv' || url.hostname === 'v.douyin.com') {
    for (let i = 0; i < 5; i++) {
      const response = await request(url.href, { redirect: 'manual', signal, headers: { 'user-agent': 'Mozilla/5.0' } })
      await response.body?.cancel()
      if (![301, 302, 303, 307, 308].includes(response.status)) break
      const location = response.headers.get('location')
      if (!location) break
      const next = safeTutorialUrl(new URL(location, url).href)
      const nextPlatform = next.hostname.endsWith('bilibili.com') || next.hostname === 'b23.tv' ? 'bilibili' : 'douyin'
      if (nextPlatform !== platform) throw new Error('教程链接跳转异常')
      url = next
    }
  }
  if (platform === 'douyin') {
    const id = url.pathname.match(/\/(?:video|note)\/(\d+)(?:\/|$)/)?.[1] || url.searchParams.get('modal_id')
    return { platform, webUrl: url.href, appUrl: /^\d+$/.test(id || '') ? `snssdk1128://aweme/detail/${id}` : null }
  }
  const video = url.pathname.match(/\/video\/(BV[a-zA-Z0-9]+|av\d+)(?:\/|$)/)?.[1]
  let aid = video?.startsWith('av') ? video.slice(2) : null
  if (video?.startsWith('BV')) {
    const response = await request(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(video)}`, { signal, redirect: 'error' })
    const result = await response.json()
    if (response.ok && result.code === 0 && /^\d+$/.test(String(result.data?.aid))) aid = String(result.data.aid)
  }
  const page = url.searchParams.get('p')
  return { platform, webUrl: url.href, appUrl: aid ? `bilibili://video/${aid}${/^[1-9]\d*$/.test(page || '') ? `?page=${page}` : ''}` : null }
}

module.exports = { safeTutorialUrl, resolveTutorial }
