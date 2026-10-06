import { useEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent } from 'react'
import { api } from '../lib/api'
import { labDocument, MOTION_KINDS, type MotionMacro } from '../lib/motion'
import type { DevLog, LayoutRecord, Overview, PromptItem } from '../lib/types'

const TABS = [
  { id: 'motion', name: 'CSS動畫彙整', short: '動' },
  { id: 'layout', name: '布局', short: '局' },
  { id: 'prompts', name: 'prompt收藏', short: '藏' },
  { id: 'progress', name: '開發日誌', short: '誌' },
] as const

type Dir = 1 | -1

const LAYOUT_KINDS = ['星鏈模式', '星系模式', '滿版宇宙', '電商布局', '文件布局', '儀表板']
const RATE_LABELS = ['相差甚遠', '小幅修改', '大致相同', '完全符合']

function promptTokens(text: string) {
  return text.match(/\s+|[A-Za-z0-9_]+|[\u4e00-\u9fff]|[^\s]/g) ?? []
}

function diffPieces(left: string, right: string) {
  if (!right) return [] as { text: string; on: boolean }[]
  if (!left || left === right) return [{ text: right, on: false }]
  const a = promptTokens(left)
  const b = promptTokens(right)
  if (a.length * b.length > 180000) {
    let prefix = 0
    const limit = Math.min(left.length, right.length)
    while (prefix < limit && left[prefix] === right[prefix]) prefix += 1
    let suffix = 0
    while (
      suffix < limit - prefix &&
      left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
    ) {
      suffix += 1
    }
    const pieces = [
      { text: right.slice(0, prefix), on: false },
      { text: right.slice(prefix, right.length - suffix), on: true },
      { text: suffix ? right.slice(right.length - suffix) : '', on: false },
    ]
    return pieces.filter((piece) => piece.text)
  }
  const n = a.length
  const m = b.length
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  const keep = new Array<boolean>(m).fill(false)
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      keep[j - 1] = true
      i -= 1
      j -= 1
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i -= 1
    else j -= 1
  }
  const pieces: { text: string; on: boolean }[] = []
  b.forEach((token, index) => {
    const on = !keep[index]
    const last = pieces[pieces.length - 1]
    if (last && last.on === on) last.text += token
    else pieces.push({ text: token, on })
  })
  return pieces
}

function slotOf(i: number, current: number) {
  const rel = (i - current + TABS.length) % TABS.length
  if (rel === 0) return 'now'
  if (rel === 1) return 'next'
  if (rel === TABS.length - 1) return 'prev'
  return 'away'
}

function FxFrame({
  html,
  css,
  play,
  title,
  interactive = false,
}: {
  html: string
  css: string
  play: number
  title: string
  interactive?: boolean
}) {
  const srcDoc = useMemo(() => labDocument(html, css), [html, css])
  return (
    <iframe
      key={play}
      className={`fx-frame${interactive ? ' is-lab' : ''}`}
      title={title}
      sandbox=""
      srcDoc={srcDoc}
      tabIndex={interactive ? 0 : -1}
    />
  )
}

function MotionPane() {
  const [items, setItems] = useState<MotionMacro[]>([])
  const [lab, setLab] = useState<MotionMacro | null>(null)
  const [draft, setDraft] = useState('')
  const [live, setLive] = useState('')
  const [play, setPlay] = useState(0)

  useEffect(() => {
    void api.motions().then(setItems)
  }, [])

  useEffect(() => {
    if (!lab) return
    const timer = window.setTimeout(() => setLive(draft), 160)
    return () => window.clearTimeout(timer)
  }, [draft, lab])

  function openLab(fx: MotionMacro) {
    setLab(fx)
    setDraft(fx.css)
    setLive(fx.css)
    setPlay((n) => n + 1)
  }

  function reset() {
    if (!lab) return
    setDraft(lab.css)
    setLive(lab.css)
    setPlay((n) => n + 1)
  }

  const grouped = MOTION_KINDS.map((kind) => ({
    ...kind,
    items: items.filter((item) => item.kind === kind.id),
  }))

  if (lab) {
    return (
      <div className="fx-lab">
        <div className="fx-lab-head">
          <button className="ghost" onClick={() => setLab(null)}>
            返回彙整
          </button>
          <div>
            <div className="section-kicker">隔離實驗</div>
            <h2>{lab.name}</h2>
            <p className="trace-lede">
              只在這座預覽裡改 CSS，不會動到實際頁面的動畫與功能。{lab.source ? `來源：${lab.source}` : ''}
            </p>
          </div>
        </div>
        <div className="fx-lab-grid">
          <div className="fx-lab-stage">
            <FxFrame html={lab.html} css={live} play={play} title={`${lab.name} 實驗`} interactive />
          </div>
          <div className="fx-lab-edit">
            <label>
              CSS
              <textarea
                className="fx-css"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                spellCheck={false}
              />
            </label>
            <div className="fx-lab-tools">
              <button className="fx-icon" type="button" onClick={() => setPlay((n) => n + 1)} aria-label="播放">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M8 5.2v13.6L19.2 12 8 5.2z" />
                </svg>
              </button>
              <button className="fx-icon" type="button" onClick={reset} aria-label="重置">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 12a9 9 0 1 0 3-6.7"
                  />
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 3.2v5.2h5.2"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <p className="trace-lede">
        完成的大型效果會存成本機 JSON 巨集。點卡片進入隔離實驗，可改 CSS、重置與即時預覽，不會寫回原本的前端。
      </p>
      {grouped.map((kind) => (
        <section key={kind.id} className="fx-kind">
          <h2>{kind.name}</h2>
          <p>{kind.blurb}</p>
          <div className="fx-grid">
            {kind.items.map((fx) => (
              <article key={fx.id} className="fx-card">
                <button className="fx-hit" onClick={() => openLab(fx)}>
                  <FxFrame html={fx.html} css={fx.css} play={0} title={fx.name} />
                </button>
                <div className="fx-meta">
                  <b>{fx.name}</b>
                  <small>{fx.blurb}</small>
                </div>
              </article>
            ))}
            {!kind.items.length ? <p className="muted">這一類還沒有入庫的效果。</p> : null}
          </div>
        </section>
      ))}
    </>
  )
}

function LayoutPane() {
  const [items, setItems] = useState<LayoutRecord[]>([])
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [kind, setKind] = useState('星鏈模式')
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState<LayoutRecord | null>(null)

  async function reload() {
    setItems(await api.layouts())
  }

  useEffect(() => {
    void reload()
  }, [])

  async function save() {
    if (!url.trim()) return
    if (editing) {
      await api.saveLayout(editing.id, { url, name, kind, note })
      setEditing(null)
    } else {
      await api.addLayout({ url: url.trim(), name: name.trim() || url.trim(), kind, note })
    }
    setUrl('')
    setName('')
    setKind('星鏈模式')
    setNote('')
    await reload()
  }

  function load(item: LayoutRecord) {
    setEditing(item)
    setUrl(item.url)
    setName(item.name)
    setKind(item.kind)
    setNote(item.note)
  }

  return (
    <>
      <p className="trace-lede">輸入網址，把該站的布局模式記下來，例如智能／通道的星鏈、首頁的星系、購物站的電商布局。</p>
      <section className="trace-panel">
        <div className="section-kicker">{editing ? '編輯布局' : '記錄布局'}</div>
        <div className="layout-form">
          <label>
            網址
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https:// 或 http://localhost:5177/#intel" />
          </label>
          <label>
            名稱
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="智能星鏈" />
          </label>
          <label>
            布局模式
            <input
              list="layout-kinds"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              placeholder="星鏈模式、星系模式、電商布局"
            />
            <datalist id="layout-kinds">
              {LAYOUT_KINDS.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </label>
          <label>
            註記
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="這頁怎麼排、適合用在哪" />
          </label>
        </div>
        <div className="row">
          <button className="solid" onClick={() => void save()}>
            {editing ? '更新' : '記錄'}
          </button>
          {editing ? (
            <button
              className="text"
              onClick={() => {
                setEditing(null)
                setUrl('')
                setName('')
                setKind('星鏈模式')
                setNote('')
              }}
            >
              取消編輯
            </button>
          ) : null}
        </div>
      </section>
      <div className="layout-grid">
        {items.map((item) => (
          <article key={item.id} className="layout-card">
            <small>{item.kind}</small>
            <b>{item.name}</b>
            <a href={item.url} target="_blank" rel="noreferrer">
              {item.url}
            </a>
            {item.note ? <p>{item.note}</p> : null}
            <div className="row">
              <button className="ghost" onClick={() => load(item)}>
                編輯
              </button>
              <button className="text" onClick={() => void api.removeLayout(item.id).then(reload)}>
                刪
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}

function PromptPane() {
  const [items, setItems] = useState<PromptItem[]>([])
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState('通用')
  const [note, setNote] = useState('')
  const [correction, setCorrection] = useState('')
  const [rating, setRating] = useState(0)
  const [favorite, setFavorite] = useState(false)
  const [filter, setFilter] = useState('全部')
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState('')
  const [editing, setEditing] = useState<PromptItem | null>(null)
  const [ime, setIme] = useState(false)
  const diffView = useRef<HTMLPreElement>(null)

  async function reload() {
    setItems(await api.prompts())
  }

  useEffect(() => {
    void reload()
  }, [])

  const categories = useMemo(() => ['全部', ...new Set(items.map((item) => item.category))], [items])
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return items.filter((item) => {
      if (filter === '優秀' && !item.favorite) return false
      if (filter !== '全部' && filter !== '優秀' && item.category !== filter) return false
      if (needle && !item.title.toLowerCase().includes(needle)) return false
      return true
    })
  }, [items, filter, query])
  const marks = useMemo(() => diffPieces(body, correction), [body, correction])
  const showDiff = Boolean(body && correction && body !== correction && !ime)
  const copyText = correction.trim() || body.trim()
  const filters = [...categories, ...(items.some((item) => item.favorite) ? ['優秀'] : [])]
  const tagChoices = [...new Set(items.map((item) => item.category).filter(Boolean))]

  function copied(text: string) {
    void navigator.clipboard.writeText(text)
    setToast('已複製，可直接貼到 Cursor')
    window.setTimeout(() => setToast(''), 1600)
  }

  function clearForm() {
    setEditing(null)
    setTitle('')
    setBody('')
    setCategory('通用')
    setNote('')
    setCorrection('')
    setRating(0)
    setFavorite(false)
  }

  function closeComposer() {
    clearForm()
    setOpen(false)
  }

  function openNew() {
    clearForm()
    setOpen(true)
  }

  function load(item: PromptItem) {
    setEditing(item)
    setTitle(item.title)
    setBody(item.body)
    setCategory(item.category)
    setNote(item.note || '')
    setCorrection(item.correction || '')
    setRating(item.rating || 0)
    setFavorite(item.favorite)
    setOpen(true)
  }

  async function save() {
    const orig = body.trim()
    const next = correction.trim()
    if (!orig && !next) return
    const payload = {
      title: title.trim() || (orig || next).slice(0, 24),
      body: orig || next,
      category: category.trim() || '未分類',
      note,
      correction: next,
      rating,
      favorite,
    }
    if (editing) await api.savePrompt(editing.id, payload)
    else await api.addPrompt(payload)
    closeComposer()
    await reload()
  }

  function onPaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    if (body || correction) return
    const text = event.clipboardData.getData('text')
    if (!text) return
    event.preventDefault()
    setBody(text)
    setCorrection(text)
  }

  if (open) {
    return (
      <div className="prompt-keep is-open">
        <section className="trace-panel prompt-keep-form">
          <label>
            標題
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="這則收藏叫什麼" />
          </label>
          <div className="prompt-pair">
            <label>
              原有提示詞
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                onPaste={onPaste}
                placeholder="貼上原本的 prompt"
              />
            </label>
            <label>
              修改提示詞
              <div className={`prompt-diff${showDiff ? ' is-marked' : ''}`}>
                {showDiff ? (
                  <pre ref={diffView} aria-hidden>
                    {marks.map((piece, index) =>
                      piece.on ? (
                        <span key={index} className="is-diff">
                          {piece.text}
                        </span>
                      ) : (
                        <span key={index}>{piece.text}</span>
                      ),
                    )}
                    {'\n'}
                  </pre>
                ) : null}
                <textarea
                  value={correction}
                  onChange={(event) => setCorrection(event.target.value)}
                  onPaste={onPaste}
                  onScroll={(event) => {
                    if (diffView.current) diffView.current.scrollTop = event.currentTarget.scrollTop
                  }}
                  onCompositionStart={() => setIme(true)}
                  onCompositionEnd={() => setIme(false)}
                  placeholder="修改後的 prompt"
                />
              </div>
            </label>
          </div>
          <label>
            開發者註記
            <textarea
              className="mid"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="這次效果好在哪、翻車在哪、下次要避開什麼"
            />
          </label>
          <label>
            標籤
            <div className="prompt-keep-tags">
              <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="通用、布局、動畫…" />
              <div className="tag-row">
                {tagChoices.map((tag) => (
                  <button key={tag} type="button" className={category === tag ? 'active' : ''} onClick={() => setCategory(tag)}>
                    {tag}
                  </button>
                ))}
                <button type="button" className={favorite ? 'active' : ''} onClick={() => setFavorite((value) => !value)}>
                  優秀
                </button>
              </div>
            </div>
          </label>
        </section>
        <section className="trace-panel prompt-keep-bar">
          <label>
            效果評級
            <div className="rate-row">
              {RATE_LABELS.map((label, index) => {
                const value = index + 1
                return (
                  <button
                    key={label}
                    type="button"
                    className={rating === value ? 'active' : ''}
                    onClick={() => setRating(value)}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </label>
          <div className="row prompt-keep-actions">
            <button className="solid" disabled={!body.trim() && !correction.trim()} onClick={() => void save()}>
              儲存
            </button>
            <button className="ghost" disabled={!copyText} onClick={() => copied(copyText)}>
              複製
            </button>
            {editing ? (
              <button
                className="text"
                onClick={() => {
                  void api.removePrompt(editing.id).then(() => {
                    closeComposer()
                    void reload()
                  })
                }}
              >
                刪除
              </button>
            ) : null}
            <button className="text" onClick={closeComposer}>
              返回
            </button>
          </div>
        </section>
        {toast ? <div className="toast">{toast}</div> : null}
      </div>
    )
  }

  return (
    <div className="prompt-keep">
      <button type="button" className="trace-panel prompt-keep-add" onClick={openNew} aria-label="新增收藏">
        +
      </button>
      <section className="trace-panel prompt-keep-lib">
        <div className="section-kicker">收藏庫</div>
        <div className="prompt-keep-tools">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋標題" />
          <div className="tag-row">
            {filters.map((item) => (
              <button key={item} type="button" className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>
        <ul className="prompt-list prompt-keep-list">
          {visible.map((item) => (
            <li key={item.id}>
              <button type="button" className="prompt-card" onClick={() => load(item)}>
                <b>{item.title || '未命名'}</b>
              </button>
            </li>
          ))}
        </ul>
        {!visible.length ? <p className="muted">還沒有符合的收藏。</p> : null}
      </section>
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}

function formatStamp(value: string | null | undefined) {
  if (!value) return '尚未更新'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function ProgressPane() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState<'since' | 'full' | ''>('')
  const [hint, setHint] = useState('')

  async function reload() {
    const next = await api.overview()
    setOverview(next)
    setSelected((current) =>
      current && next.projects.some((item) => item.id === current) ? current : next.projects[0]?.id || '',
    )
  }

  useEffect(() => {
    void reload().catch(() => undefined)
  }, [])

  const project = overview?.projects.find((item) => item.id === selected) ?? null
  const logs = useMemo(() => {
    const list = project?.logs ?? []
    return [...list].sort((a, b) => b.date.localeCompare(a.date))
  }, [project])

  async function digest(mode: 'since' | 'full') {
    if (!project || busy) return
    setBusy(mode)
    setHint('')
    try {
      await api.digestProject(project.id, mode)
      await reload()
    } catch (error) {
      setHint(error instanceof Error ? error.message : '更新失敗')
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="trace-panel">
      <div className="digest-head">
        <div className="digest-projects">
          {overview?.projects.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === project?.id ? 'is-on' : ''}
              onClick={() => setSelected(item.id)}
            >
              {item.name}
            </button>
          ))}
          {!overview?.projects.length ? <p className="muted">還沒掃到可整理的專案。</p> : null}
        </div>
        {project ? (
          <div className="digest-update">
            <div className="row">
              <button className="ghost" disabled={Boolean(busy)} onClick={() => void digest('since')}>
                {busy === 'since' ? '更新中…' : '時間戳記'}
              </button>
              <div className="digest-full">
                <button className="solid" disabled={Boolean(busy)} onClick={() => void digest('full')}>
                  {busy === 'full' ? '更新中…' : '全部重整'}
                </button>
                <p className="trace-lede">上次更新：{formatStamp(project.meta.digestAt)}</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      {hint ? <p className="muted">{hint}</p> : null}
      {project ? (
        <div className="digest-log">
          {logs.map((item: DevLog) => (
            <DigestCard key={item.id} item={item} onSaved={reload} />
          ))}
          {!logs.length ? <p className="muted">還沒有開發日誌。用「全部重整」會讀本機對話與 Git。</p> : null}
        </div>
      ) : null}
    </section>
  )
}

function DigestCard({ item, onSaved }: { item: DevLog; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(item.title ?? '')
  const [body, setBody] = useState(item.bullets.join('\n'))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editing) return
    setTitle(item.title ?? '')
    setBody(item.bullets.join('\n'))
  }, [item, editing])

  async function save() {
    setSaving(true)
    try {
      await api.saveDevLog(item.id, {
        title: title.trim(),
        bullets: body
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      })
      setEditing(false)
      await onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className={editing ? 'is-editing' : ''}>
      <div className="digest-title-row">
        <b>{item.date}</b>
        {editing ? (
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="標題" aria-label="日誌標題" />
        ) : item.title ? (
          <span className="digest-heading">{item.title}</span>
        ) : null}
        {editing ? (
          <div className="digest-edit-actions">
            <button type="button" className="text" onClick={() => setEditing(false)}>
              取消
            </button>
            <button type="button" className="solid" disabled={saving} onClick={() => void save()}>
              儲存
            </button>
          </div>
        ) : (
          <button type="button" className="text" onClick={() => setEditing(true)}>
            編輯
          </button>
        )}
      </div>
      {editing ? (
        <textarea
          className="digest-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={Math.max(4, item.bullets.length + 1)}
          aria-label="日誌內容"
        />
      ) : (
        <ul>
          {item.bullets.map((bullet, index) => (
            <li key={`${item.id}-${index}`}>
              <DigestLine text={bullet} />
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

function DigestLine({ text }: { text: string }) {
  const match = text.match(/^(feat|fix|refactor|ref|perf|docs|style|test|build|ci|chore|push|revert)[:：]\s*/i)
  if (!match) return text
  const tag = match[1].toLowerCase() === 'refactor' ? 'ref' : match[1].toLowerCase()
  return (
    <>
      <em className="digest-tag">{tag}</em>
      {text.slice(match[0].length)}
    </>
  )
}

const START_TAB = Math.max(0, TABS.findIndex((item) => item.id === 'progress'))

export function TracesPage() {
  const [index, setIndex] = useState(START_TAB)
  const [dir, setDir] = useState<Dir>(1)
  const [wrap, setWrap] = useState<number | null>(null)
  const wrapTimer = useRef(0)

  useEffect(() => () => window.clearTimeout(wrapTimer.current), [])

  function go(nextDir: Dir) {
    const next = (index + nextDir + TABS.length) % TABS.length
    const wrapping = nextDir === 1 ? (next + 1) % TABS.length : (next - 1 + TABS.length) % TABS.length
    window.clearTimeout(wrapTimer.current)
    setWrap(wrapping)
    setDir(nextDir)
    setIndex(next)
    wrapTimer.current = window.setTimeout(() => setWrap(null), 40)
  }

  return (
    <div className="traces-page">
      <div className="trace-switch" role="tablist" aria-label="軌跡功能切換">
        {TABS.map((item, i) => {
          const slot = slotOf(i, index)
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={slot === 'now'}
              aria-label={slot === 'now' ? item.name : `切到${item.name}`}
              className={`trace-tab is-${slot}${wrap === i ? ' is-wrap' : ''}`}
              onClick={() => {
                if (slot === 'prev') go(-1)
                if (slot === 'next') go(1)
              }}
            >
              <span className="trace-tab-short">{item.short}</span>
              <span className="trace-tab-name">{item.name}</span>
            </button>
          )
        })}
      </div>
      <div className="trace-stage">
        {TABS.map((item, i) => (
          <section
            key={item.id}
            className={`trace-pane${i === index ? ` is-on is-${dir === 1 ? 'from-next' : 'from-prev'}` : ''}`}
            role="tabpanel"
            hidden={i !== index}
            aria-labelledby={item.id}
          >
            {item.id === 'motion' ? <MotionPane /> : null}
            {item.id === 'layout' ? <LayoutPane /> : null}
            {item.id === 'prompts' ? <PromptPane /> : null}
            {item.id === 'progress' ? <ProgressPane /> : null}
          </section>
        ))}
      </div>
    </div>
  )
}
