import { youtubeId, youtubePoster } from '../src/lib/youtube.ts'
import { fetchYoutubeCaptions } from './youtube-subs.ts'

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

const LEARN_PROMPT = `你是學習筆記編輯。請用繁體中文 Markdown 輸出摘要，不要前後客套。

硬性原則：
- YouTube：有字幕就以字幕為準，不要假裝看過畫面。沒有字幕時開頭寫「資料不足：沒有可用字幕」，只根據標題與說明。
- 網頁：只根據標題、說明與摘錄，不要假裝看過全文。
- 禁止空話，不要發明原文沒提到的內容。

請依下列結構輸出：
# 摘要
## 這份資料在談什麼
## 重點
- …
## 不確定或過時之處
- …`

const DIGEST_TAG_ORDER = ['feat', 'fix', 'ref', 'perf', 'docs', 'style', 'test', 'build', 'ci', 'chore', 'push', 'revert'] as const
export const DIGEST_TAG_RE = /^(feat|fix|refactor|ref|perf|docs|style|test|build|ci|chore|push|revert)[:：]\s*/i

const AGENT_PROMPT = `你是提示詞編輯，不是開發顧問。請用繁體中文產出一份「要交給其他 AI Agent 執行」的 prompt。
禁止自己回答、評估、給建議或寫實作。輸出只能是那份 prompt 本文，不要前後客套。

硬性原則：
- 只根據提供的原文整理，禁止腦補沒寫過的功能、架構、技術棧、時程或依賴。
- 看不出來就寫「資料不足」，不要猜。
- 專案類型、專案開發工具：只從「需求與架構規劃」的開發摘要、檔案名稱、該階段部件／功能，以及「核心」欄文字判斷。類型可歸到例如軟體、前端、後端、微服務、插件、APP、微控制器、物聯網裝置；工具可歸到例如 Vue、MongoDB、React、Python、Android、iOS、Arduino、ESP32、C++。名稱必須能在原文找到依據，不可因常見組合而補上。
- 專案核心需求：只整理分級「核心」欄的文字，可重新斷句，不可加新意思。
- 「功能開發與API串接」：把該階段各部件與其功能依已辨識的開發工具分類，以條列呈現。無法歸入任何已列出工具的部件放在「未分類」。不要為了分類而發明新工具。
- 其他階段若有摘要、檔案、部件或功能，僅忠實條列並標明階段名稱，不要延伸推論。

請依下列結構輸出（沒有內容的小節寫「資料不足」或「無」）：

請依下列已確認的專案現況協助開發。只根據已寫下的範圍實作，不要自行擴充。

# 專案：[名稱]

## 專案類型
- …

## 專案開發工具
- …

## 專案核心需求
…

## 功能開發與 API 串接
### [工具或未分類]
- 部件：…
  - 功能：…

## 其他已記錄內容
### [階段名稱]
…`

const FEASIBILITY_PROMPT = `你是提示詞編輯，不是可行性顧問。請用繁體中文產出一份「要交給其他 AI Agent 做可行性評估」的 prompt。
禁止自己做評估、下結論、選技術或寫建議答案。輸出只能是那份 prompt 本文，不要前後客套。

資料範圍：
- 只用「核心」與「需求與架構規劃」（開發摘要、檔案、該階段部件／功能）。
- 忽略任何「功能開發與API串接」資料，不要寫進 prompt。

整理方式：
- 把已有的架構規劃整理成條列，可重新斷句，不可加新意思。
- 找出未完善之處（有名稱但沒選型、沒決策、沒範圍、只有標題沒內容等），轉成要對方評估的問句或議題。
- 例如：已有部件「資料庫整合」，但未決定資料庫與架構 → 加入「資料庫選擇策略與建議」。
- 問句必須能對應到原文缺口；不要為了完整而虛構缺口。沒有缺口就寫「無」。

請依下列結構輸出：

請依下列架構現況進行可行性評估。只根據已寫下的範圍判斷；對列出的缺口給出具體評估與建議，不要把未決定的事項當成已定案。請用條列回答。

# 專案：[名稱]

## 專案類型
- …

## 已確認的架構規劃
- …

## 請評估的缺口
- 資料庫選擇策略與建議
- …`

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

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
}

function desktopUrl(url: string) {
  try {
    const next = new URL(url)
    next.pathname = next.pathname.replace(/^\/m(?=\/)/, '')
    return next.href
  } catch {
    return url
  }
}

async function fetchHtml(url: string) {
  const res = await fetch(url, {
    headers: FETCH_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(12000),
  })
  return { html: (await res.text()).slice(0, 400_000), url: res.url || url }
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
        image: youtubePoster(url) || data.thumbnail_url || '',
        excerpt: '',
        kind: 'youtube' as const,
      }
    }
  }
  let { html, url: pageUrl } = await fetchHtml(desktopUrl(url))
  if (!firstArticleImage(html, pageUrl)) {
    const ogUrl = absUrl(attr(html, 'property', 'og:url'), pageUrl)
    if (ogUrl && ogUrl !== pageUrl) {
      try {
        const again = await fetchHtml(ogUrl)
        html = again.html
        pageUrl = again.url
      } catch {
        /* keep first page */
      }
    }
  }
  const title =
    attr(html, 'property', 'og:title') ||
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() ||
    url
  const description =
    attr(html, 'property', 'og:description') || attr(html, 'name', 'description') || ''
  const image =
    firstArticleImage(html, pageUrl) ||
    attr(html, 'property', 'og:image') ||
    attr(html, 'name', 'twitter:image') ||
    ''
  const excerpt = stripTags(html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')).slice(
    0,
    900,
  )
  return {
    url: pageUrl,
    title: decodeHtml(title),
    description: decodeHtml(description),
    image: absUrl(image, pageUrl),
    excerpt,
    kind: 'web' as const,
  }
}

function attr(html: string, key: string, name: string) {
  const re = new RegExp(`<meta[^>]+${key}=["']${name}["'][^>]+content=["']([^"]+)["']`, 'i')
  const alt = new RegExp(`<meta[^>]+content=["']([^"]+)["'][^>]+${key}=["']${name}["']`, 'i')
  return html.match(re)?.[1] || html.match(alt)?.[1] || ''
}

function tagAttr(tag: string, name: string) {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
  const match = tag.match(re)
  return (match?.[1] || match?.[2] || match?.[3] || '').trim()
}

function srcsetUrl(srcset: string) {
  const parts = srcset.split(',').map((item) => item.trim()).filter(Boolean)
  if (!parts.length) return ''
  const ranked = parts.map((part) => {
    const [href, size = ''] = part.split(/\s+/, 2)
    const n = size.endsWith('w')
      ? Number(size.slice(0, -1))
      : size.endsWith('x')
        ? Number(size.slice(0, -1)) * 1000
        : 0
    return { href, n }
  })
  ranked.sort((a, b) => b.n - a.n)
  return ranked[0]?.href || parts[0].split(/\s+/)[0] || ''
}

function absUrl(src: string, pageUrl: string) {
  if (!src) return ''
  try {
    return new URL(decodeHtml(src), pageUrl).href
  } catch {
    return ''
  }
}

function skipImage(src: string) {
  const value = src.toLowerCase()
  if (!value || value.startsWith('data:') || value.startsWith('item.') || value.includes('{{')) return true
  if (value.endsWith('.svg')) return true
  return /favicon|sprite|emoji|emoticon|avatar|1x1|pixel|tracking|sidebar|\/icon[s\/._-]|logo[s\/._-]|\/images\/x\//.test(
    value,
  )
}

function firstArticleImage(html: string, pageUrl: string) {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
  const article =
    cleaned.match(/<article\b[^>]*>[\s\S]*?<\/article>/i)?.[0] ||
    cleaned.match(/<main\b[^>]*>[\s\S]*?<\/main>/i)?.[0] ||
    cleaned
  for (const match of article.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0]
    const src =
      tagAttr(tag, 'src') ||
      tagAttr(tag, 'data-src') ||
      tagAttr(tag, 'data-original') ||
      tagAttr(tag, 'data-lazy-src') ||
      srcsetUrl(tagAttr(tag, 'srcset') || tagAttr(tag, 'data-srcset'))
    if (skipImage(src)) continue
    const width = Number(tagAttr(tag, 'width') || 0)
    const height = Number(tagAttr(tag, 'height') || 0)
    if ((width && width < 80) || (height && height < 80)) continue
    const resolved = absUrl(src, pageUrl)
    if (resolved) return resolved
  }
  return ''
}

const BLOCK_CLASS = /article|content|post|entry|markdown|story|main|body|text/i

function cleanHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(header|nav|footer|aside)\b[\s\S]*?<\/\1>/gi, '')
}

function closeTag(html: string, start: number, tag: string) {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi')
  re.lastIndex = start
  let depth = 0
  for (let match = re.exec(html); match; match = re.exec(html)) {
    depth += match[1] ? -1 : 1
    if (depth === 0) return re.lastIndex
  }
  return -1
}

function textScore(block: string) {
  const prose = [...block.matchAll(/<(p|li|h[1-6]|pre|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => stripTags(match[2]))
    .join(' ')
  const links = [...block.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => stripTags(match[1])).join(' ')
  const all = stripTags(block).length || 1
  return prose.length * (1 - Math.min(0.9, links.length / all))
}

function articleBlock(html: string) {
  const cleaned = cleanHtml(html)
  const candidates: string[] = []
  const article = cleaned.match(/<article\b[^>]*>[\s\S]*?<\/article>/i)?.[0]
  if (article) candidates.push(article)
  const main = cleaned.match(/<main\b[^>]*>[\s\S]*?<\/main>/i)?.[0]
  if (main) candidates.push(main)
  for (const match of cleaned.matchAll(/<(div|section)\b[^>]*\b(?:class|id)\s*=\s*["']([^"']*)["'][^>]*>/gi)) {
    if (!BLOCK_CLASS.test(match[2]) || /comment|reply|response|sidebar|related|recommend/i.test(match[2])) continue
    const end = closeTag(cleaned, match.index ?? 0, match[1])
    if (end > 0) candidates.push(cleaned.slice(match.index, end))
  }
  let best = ''
  let bestScore = 0
  for (const block of candidates) {
    const score = textScore(block)
    if (score > bestScore * 1.08 || (score >= bestScore * 0.92 && block.length < best.length)) {
      best = block
      bestScore = Math.max(score, bestScore)
    }
  }
  return best || cleaned.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] || cleaned
}

function articleToText(block: string) {
  const text = block
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|section|h[1-6]|li|pre|blockquote|tr|ul|ol|table|figure)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
  return decodeHtml(text)
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function fetchArticleText(url: string) {
  const page = await fetchHtml(desktopUrl(url))
  return articleToText(articleBlock(page.html)).slice(0, 60000)
}

function stylesheetLinks(html: string, pageUrl: string) {
  const hrefs: string[] = []
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    if (!/\brel\s*=\s*["'][^"']*stylesheet/i.test(tag) && !/\.css/i.test(tag)) continue
    const href = tagAttr(tag, 'href')
    if (!href || /jquery-ui|select2|sweetalert|simplemde/i.test(href)) continue
    const abs = absUrl(href, pageUrl)
    if (abs && !hrefs.includes(abs)) hrefs.push(abs)
    if (hrefs.length >= 8) break
  }
  return hrefs
}

function articleMarkup(block: string, pageUrl: string) {
  const stripped = block
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<(iframe|object|embed|form|link)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<(iframe|object|embed|form|link)\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  const withUrls = stripped.replace(
    /\s(href|src|poster)\s*=\s*(["'])(.*?)\2/gi,
    (_all, attr: string, quote: string, value: string) => {
      const raw = decodeHtml(value).trim()
      if (!raw || /^(javascript|data):/i.test(raw)) return ` ${attr}=${quote}${quote}`
      return ` ${attr}=${quote}${absUrl(raw, pageUrl) || ''}${quote}`
    },
  )
  return withUrls.replace(/<a\b([^>]*)>/gi, (_all, attrs: string) => {
    const clean = attrs
      .replace(/\s+target\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s+rel\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    return `<a${clean} target="_blank" rel="noreferrer">`
  })
}

export async function fetchArticleView(url: string) {
  const page = await fetchHtml(desktopUrl(url))
  const block = articleBlock(page.html)
  const text = articleToText(block).slice(0, 60000)
  const links = stylesheetLinks(page.html, page.url)
    .map((href) => `<link rel="stylesheet" href="${href.replace(/"/g, '%22')}">`)
    .join('\n')
  const doc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base href="${page.url.replace(/"/g, '%22')}">
${links}
<style>
  html, body { margin: 0; background: #101412 !important; color: #f3eee4 !important; }
  body { padding: 12px 16px 28px; }
  body * { background-color: transparent !important; border-color: rgba(243, 238, 228, 0.16) !important; }
  body p, body li, body h1, body h2, body h3, body h4, body h5, body h6,
  body td, body th, body blockquote, body figcaption, body dd, body dt, body div {
    color: #f3eee4 !important;
  }
  body a, body a * { color: #e8c56a !important; }
  body pre, body code, body kbd { background-color: #0c0f0d !important; color: #d7cbb6 !important; }
  body pre span, body code span { background-color: transparent !important; }
  img, video, svg, picture { max-width: 100%; height: auto; background: transparent !important; }
</style>
</head>
<body>
${articleMarkup(block, page.url)}
</body>
</html>`
  return { text, doc: doc.slice(0, 500_000) }
}

export async function complete(
  settings: Settings,
  system: string,
  user: string,
  extra?: { temperature?: number; maxOutputTokens?: number; thinkingBudget?: number },
) {
  if (!settings.apiKey) {
    throw new Error('尚未設定 API Key')
  }
  if (settings.provider === 'gemini') {
    const model = settings.model || 'gemini-3.6-flash'
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.apiKey}`
    const generationConfig: Record<string, unknown> = {
      temperature: extra?.temperature ?? 0.3,
      maxOutputTokens: extra?.maxOutputTokens ?? 8192,
    }
    if (extra?.thinkingBudget != null) {
      generationConfig.thinkingConfig = { thinkingBudget: extra.thinkingBudget }
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig,
      }),
    })
    const data = (await res.json()) as {
      error?: { message?: string }
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
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
  resource: { title: string; url: string; description: string; excerpt: string; captions?: string },
) {
  const yt = youtubeId(resource.url)
  const captions = yt
    ? await fetchYoutubeCaptions(resource.url)
    : { text: resource.captions || (await fetchArticleText(resource.url).catch(() => '')), lang: '' }
  const user = [
    `標題：${resource.title}`,
    `網址：${resource.url}`,
    `類型：${yt ? 'YouTube 影片' : '網頁'}`,
    `說明：${resource.description}`,
    yt
      ? `字幕語言：${captions.lang || '無'}\n字幕：\n${captions.text || '（沒有可用字幕；不要假裝看過影片）'}`
      : `內文：\n${captions.text || resource.excerpt || '（無）'}`,
  ].join('\n')
  const analysis = await complete(settings, LEARN_PROMPT, user.slice(0, 28000), {
    temperature: 0.2,
    maxOutputTokens: 8192,
    thinkingBudget: 0,
  })
  return { analysis, captions: captions.text, captionLang: captions.lang }
}

function htmlToText(raw: string) {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const PHASE_STATUS_LABEL: Record<string, string> = {
  idle: '未開始',
  doing: '進行中',
  done: '已完成',
}

export async function composeAgentPrompt(
  settings: Settings,
  input: {
    kind?: 'architecture' | 'feasibility'
    name: string
    core: string
    phases: { name: string; status: string; note: string; files: string[] }[]
    parts: { name: string; phase: number; features: string[] }[]
  },
) {
  if (!settings.apiKey) throw new Error('尚未設定 Gemini API Key')
  if (settings.provider !== 'gemini') {
    throw new Error('此功能目前只串接 Gemini，請在設定選 Gemini 或於 .env 放入 GEMINI_API_KEY')
  }
  const gemini = { ...settings, provider: 'gemini' as const }
  const feasibility = input.kind === 'feasibility'
  const phases = feasibility ? input.phases.slice(0, 1) : input.phases
  const parts = feasibility ? input.parts.filter((part) => part.phase === 0) : input.parts
  const partsByPhase = new Map<number, { name: string; features: string[] }[]>()
  for (const part of parts) {
    const list = partsByPhase.get(part.phase) ?? []
    list.push({ name: part.name, features: part.features })
    partsByPhase.set(part.phase, list)
  }
  const renderParts = (phase: number) => {
    const rows = partsByPhase.get(phase) ?? []
    if (!rows.length) return '（無部件）'
    return rows
      .map((part) => {
        const features = part.features.filter(Boolean)
        const body = features.length ? features.map((item) => `    - ${item}`).join('\n') : '    - （無功能）'
        return `- 部件：${part.name || '（未命名）'}\n${body}`
      })
      .join('\n')
  }
  const phaseBlocks = phases.map((phase, index) => {
    const note = htmlToText(phase.note)
    const files = phase.files.filter(Boolean)
    return [
      `【${phase.name}】狀態：${PHASE_STATUS_LABEL[phase.status] || phase.status}`,
      `開發摘要：\n${note || '（無）'}`,
      `檔案：\n${files.length ? files.map((name) => `- ${name}`).join('\n') : '（無）'}`,
      `部件與功能：\n${renderParts(index)}`,
    ].join('\n')
  })
  const user = [
    feasibility
      ? '任務：產出「可行性評估」用的提示詞，不要自己做評估。資料僅含核心與需求與架構規劃。'
      : '任務：產出「專案架構／開發」用的提示詞，不要自己實作或回答。',
    `專案名稱：${input.name}`,
    `【核心】\n${input.core.trim() || '（無）'}`,
    ...phaseBlocks,
  ].join('\n\n')
  return complete(gemini, feasibility ? FEASIBILITY_PROMPT : AGENT_PROMPT, user.slice(0, 60000), {
    temperature: 0.2,
    maxOutputTokens: 16384,
    thinkingBudget: 0,
  })
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
