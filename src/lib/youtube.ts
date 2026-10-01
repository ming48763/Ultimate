export function youtubeId(raw: string) {
  try {
    const url = new URL(raw)
    if (/(^|\.)youtu\.be$/i.test(url.hostname)) {
      return url.pathname.replace(/^\//, '').split('/')[0] || null
    }
    if (/(^|\.)youtube\.com$/i.test(url.hostname)) {
      const fromQuery = url.searchParams.get('v')
      if (fromQuery) return fromQuery
      const nested = url.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)
      return nested?.[1] || null
    }
  } catch {
    return null
  }
  return null
}

export function youtubePoster(raw: string, size: 'maxresdefault' | 'mqdefault' = 'maxresdefault') {
  const id = youtubeId(raw)
  return id ? `https://i.ytimg.com/vi/${id}/${size}.jpg` : ''
}
