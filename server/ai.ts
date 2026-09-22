const NOTE_PROMPT = `你是產品與工程評估顧問，不是創業教練。請用繁體中文回答。

硬性原則：
- 理性、具體、可被推翻。先講限制與成本，再講機會。
- 禁止過度樂觀。禁止「藍海」「顛覆市場」「一定能」「非常有潛力」這類空話。
- 沒有足夠證據時，直接寫「資料不足」，不要腦補成功路徑。
- 相近產品若搜尋結果薄弱，要明講搜尋限制，不要假裝做過完整市場調查。
- 下一步必須是本週做得到、且寫出什麼情況下應該停。

請依下列標題輸出：
1. 筆記整理
2. 核心假設
3. 主要風險與成本
4. 相近產品／服務
5. 差異是否真的成立
6. 本週最小下一步
7. 建議先不要做的事`

const LEARN_PROMPT = `你是學習策展編輯。請用繁體中文、克制地整理這份網路資料。
只根據提供的標題、摘要與摘錄判斷，不要假裝看過全文。
輸出：
1. 這份資料在談什麼（三句內）
2. 可能對開發者有用的點
3. 不確定或過時的風險
4. 3 個相關搜尋關鍵詞
5. 是否值得收入學習筆記（是／暫緩／否，並給一句理由）`

const DIGEST_TAG_ORDER = ['feat', 'fix', 'ref', 'perf', 'docs', 'style', 'test', 'build', 'ci', 'chore', 'push', 'revert'] as const
export const DIGEST_TAG_RE = /^(feat|fix|refactor|ref|perf|docs|style|test|build|ci|chore|push|revert)[:：]\s*/i

const DIGEST_PROMPT = `你是本機開發日誌編輯。只用提供的 Cursor 對話與 Git 提交整理，用繁體中文。
硬性原則：
- 按日期分類，一句一個重點。
- 每一條子項目開頭必須加綴詞與全形冒號，例如 feat：
- 禁止輸出沒有綴詞的條目；沒有更合適的類型就用 chore。
- 同一天內相同綴詞必須連續放在一起，不要穿插其他類型。
- 綴詞排列順序：feat → fix → ref → perf → docs → style → test → build → ci → chore → push → revert
- 句子不要再以「新增／修復／優化／調整／重構」開頭，類型已由綴詞表達。
- 第一次整理含今天之前的歷史，之後只整理新內容。
- 禁止空話、禁止腦補。沒有新內容回覆「沒有新的開發紀錄」。
- 嚴格使用下列格式，不要加前後說明：

## YYYY-MM-DD
- feat：開發「出缺席快拉」工具，建立積木卡片拖曳與封裝區邏輯。
- fix：修復生產環境建置錯誤並發佈至 Vercel。
- ref：調整首頁工具網格的產品預覽顯示邏輯。
- ref：請假明細 Excel 匯出格式與學期週數邏輯。
- push：提交桌面名牌、排座位工具與首頁大廳開發成果。

綴詞（只准用這些，不可自創）：
- feat：新增功能
- fix：修復 Bug、錯誤
- ref：重構或調整結構／邏輯（不加新功能、不修 bug）
- perf：效能改善
- docs：文件、註解、說明
- style：排版格式，不影響程式邏輯
- test：測試程式，不改生產程式碼
- build：建置系統或外部依賴
- ci：CI/CD 設定
- chore：工具、套件升級、瑣事
- push：提交、推送、發佈已完成成果
- revert：還原先前改動`

type Settings = {
  provider: 'openai' | 'gemini'
  apiKey: string
  model: string
  apiBase: string
}

export async function webSearch(query: string, limit = 6) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    },
  })
  if (!res.ok) return []
  const html = await res.text()
  const results: { title: string; href: string; snippet: string }[] = []
  const blockRe =
    /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = blockRe.exec(html)) && results.length < limit) {
    results.push({
      href: unwrapDuck(match[1]),
      title: decodeHtml(stripTags(match[2])),
      snippet: decodeHtml(stripTags(match[3])),
    })
  }
  if (!results.length) {
    const simple = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
    while ((match = simple.exec(html)) && results.length < limit) {
      results.push({
        href: unwrapDuck(match[1]),
        title: decodeHtml(stripTags(match[2])),
        snippet: '',
      })
    }
  }
  return results.filter((item) => item.title && item.href.startsWith('http'))
}

function unwrapDuck(href: string) {
  try {
    const url = new URL(href, 'https://html.duckduckgo.com')
    return url.searchParams.get('uddg') || href
  } catch {
    return href
  }
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export async function fetchPage(url: string) {
  if (/youtu\.be\/|youtube\.com/.test(url)) {
    const oembed = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
    if (oembed.ok) {
      const data = (await oembed.json()) as { title?: string; author_name?: string; thumbnail_url?: string }
      return {
        url,
        title: data.title || url,
        description: data.author_name ? `YouTube · ${data.author_name}` : 'YouTube',
        image: data.thumbnail_url || '',
        excerpt: '',
        kind: 'youtube' as const,
      }
    }
  }
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(12000),
  })
  const html = (await res.text()).slice(0, 200_000)
  const title =
    attr(html, 'property', 'og:title') ||
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() ||
    url
  const description =
    attr(html, 'property', 'og:description') || attr(html, 'name', 'description') || ''
  const image = attr(html, 'property', 'og:image') || ''
  const excerpt = stripTags(html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')).slice(
    0,
    900,
  )
  return { url, title: decodeHtml(title), description: decodeHtml(description), image, excerpt, kind: 'web' as const }
}

function attr(html: string, key: string, name: string) {
  const re = new RegExp(`<meta[^>]+${key}=["']${name}["'][^>]+content=["']([^"]+)["']`, 'i')
  const alt = new RegExp(`<meta[^>]+content=["']([^"]+)["'][^>]+${key}=["']${name}["']`, 'i')
  return html.match(re)?.[1] || html.match(alt)?.[1] || ''
}

export async function complete(settings: Settings, system: string, user: string) {
  if (!settings.apiKey) {
    throw new Error('尚未設定 API Key')
  }
  if (settings.provider === 'gemini') {
    const model = settings.model || 'gemini-3.6-flash'
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.apiKey}`
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
      }),
    })
    const data = (await res.json()) as {
      error?: { message?: string }
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    if (!res.ok) throw new Error(data.error?.message || 'Gemini 呼叫失敗')
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || ''
    if (!text) throw new Error('Gemini 沒有回傳內容')
    return text
  }
  const base = (settings.apiBase || 'https://api.openai.com/v1').replace(/\/$/, '')
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model || 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  const data = (await res.json()) as {
    error?: { message?: string }
    choices?: { message?: { content?: string } }[]
  }
  if (!res.ok) throw new Error(data.error?.message || 'OpenAI 相容 API 呼叫失敗')
  const text = data.choices?.[0]?.message?.content || ''
  if (!text) throw new Error('模型沒有回傳內容')
  return text
}

export async function analyzeNote(
  settings: Settings,
  note: { title: string; body: string },
) {
  const hits = await webSearch(`${note.title} ${note.body.slice(0, 80)} 類似產品 OR alternative`, 6)
  const user = `筆記標題：${note.title}\n\n筆記內容：\n${note.body}\n\n網路搜尋結果（可能不完整）：\n${hits
    .map((hit, index) => `${index + 1}. ${hit.title}\n${hit.href}\n${hit.snippet}`)
    .join('\n\n') || '（搜尋沒有穩定結果）'}`
  const analysis = await complete(settings, NOTE_PROMPT, user)
  return { analysis, matches: hits }
}

export async function analyzeResource(
  settings: Settings,
  resource: { title: string; url: string; description: string; excerpt: string },
) {
  const user = `標題：${resource.title}\n網址：${resource.url}\n摘要：${resource.description}\n摘錄：${resource.excerpt}`
  const analysis = await complete(settings, LEARN_PROMPT, user)
  return analysis
}

export async function digestProjectLog(
  settings: Settings,
  input: {
    name: string
    since: string | null
    git: { hash: string; date: string; subject: string }[]
    chats: { title: string; updatedAt: string; messages: { role: string; text: string; at: string }[] }[]
  },
) {
  const gitBlock = input.git.length
    ? input.git.map((row) => `${row.date} ${row.hash} ${row.subject}`).join('\n')
    : '（沒有新的提交）'
  const renderChat = (chat: (typeof input.chats)[number]) => {
    const lines = chat.messages
      .map((message) => `${message.at ? message.at.slice(0, 16) : ''} ${message.role === 'user' ? '你' : 'Agent'}：${message.text}`)
      .join('\n')
    return `對話「${chat.title}」\n${lines}`
  }
  const chatBlock = input.chats.length ? mixChatBlocks(input.chats, renderChat, 140_000) : '（沒有新的對話）'
  const user = `專案：${input.name}\n上次整理：${input.since || '尚未整理（第一次：請依日期整理全部提供的歷史，包含今天之前）'}\n\nGit 提交：\n${gitBlock}\n\nCursor 對話：\n${chatBlock}`
  return complete(settings, DIGEST_PROMPT, user)
}

function mixChatBlocks<T extends { updatedAt: string }>(
  chats: T[],
  render: (chat: T) => string,
  maxChars: number,
) {
  const sorted = [...chats].sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
  const blocks = sorted.map(render)
  const total = blocks.reduce((sum, block) => sum + block.length, 0)
  if (total <= maxChars) return blocks.join('\n\n')
  const picked: string[] = []
  let used = 0
  let head = 0
  let tail = blocks.length - 1
  let takeOld = true
  while (head <= tail && used < maxChars) {
    const index = takeOld ? head++ : tail--
    takeOld = !takeOld
    const block = blocks[index]
    if (used + block.length > maxChars) continue
    picked.push(block)
    used += block.length
  }
  return picked.join('\n\n')
}

export function digestBulletKey(bullet: string) {
  return bullet.replace(DIGEST_TAG_RE, '').trim()
}

export function normalizeDigestBullet(bullet: string) {
  const match = bullet.trim().match(DIGEST_TAG_RE)
  const body = bullet.trim().replace(DIGEST_TAG_RE, '').trim()
  if (!match || !body) return bullet.trim()
  const tag = match[1].toLowerCase() === 'refactor' ? 'ref' : match[1].toLowerCase()
  return `${tag}：${body}`
}

export function groupDigestBullets(bullets: string[]) {
  const buckets = new Map<string, string[]>()
  for (const tag of [...DIGEST_TAG_ORDER, '']) buckets.set(tag, [])
  for (const raw of bullets) {
    const bullet = normalizeDigestBullet(raw)
    const match = bullet.match(DIGEST_TAG_RE)
    const tag = match ? (match[1].toLowerCase() === 'refactor' ? 'ref' : match[1].toLowerCase()) : ''
    if (!buckets.has(tag)) buckets.set(tag, [])
    buckets.get(tag)?.push(bullet)
  }
  const extra = [...buckets.keys()].filter((tag) => tag && !DIGEST_TAG_ORDER.includes(tag as (typeof DIGEST_TAG_ORDER)[number]))
  return [...DIGEST_TAG_ORDER, ...extra, ''].flatMap((tag) => buckets.get(tag) ?? [])
}

export function parseDigestDays(text: string) {
  const days: { date: string; bullets: string[] }[] = []
  const chunks = text.split(/^#{1,3}\s+/m)
  for (const chunk of chunks) {
    const match = chunk.match(/^(\d{4}-\d{2}-\d{2})\s*\n([\s\S]*)$/)
    if (!match) continue
    const bullets = match[2]
      .split('\n')
      .map((line) => line.replace(/^\s*[-*•]\s*/, '').trim())
      .filter(Boolean)
    if (bullets.length) days.push({ date: match[1], bullets: groupDigestBullets(bullets) })
  }
  return days
}
