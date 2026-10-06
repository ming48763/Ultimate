import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from 'react'
import { api } from '../lib/api'
import { MarkdownView } from '../lib/markdown'
import type { Resource, StudyNote } from '../lib/types'
import { youtubeId, youtubePoster } from '../lib/youtube'

const NOTE_BG = '/learn/note_bg.jpeg'

const TABS = [
  { id: 'notes', name: '個人筆記' },
  { id: 'inbox', name: '外部資源' },
] as const

export function LearnPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('notes')

  return (
    <div className="learn-page">
      <div className="learn-switch" role="tablist" aria-label="學而">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'is-on' : ''}
            onClick={() => setTab(item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>
      {tab === 'notes' ? <StudyPane /> : <InboxPane />}
    </div>
  )
}

function StudyPane() {
  const [notes, setNotes] = useState<StudyNote[]>([])
  const [openId, setOpenId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [source, setSource] = useState('')
  const [draft, setDraft] = useState('')
  const [filter, setFilter] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editingSource, setEditingSource] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [renameId, setRenameId] = useState('')
  const [renameTitle, setRenameTitle] = useState('')
  const [splitLeft, setSplitLeft] = useState(50)
  const [splitFold, setSplitFold] = useState<'none' | 'left' | 'right'>('none')
  const saveTimer = useRef(0)
  const splitRef = useRef<HTMLDivElement>(null)
  const splitDrag = useRef(false)
  const current = notes.find((item) => item.id === openId) || null
  const currentId = current?.id ?? ''

  async function reload(selectId?: string) {
    const list = await api.studyNotes()
    setNotes(list)
    const nextId = selectId && list.some((item) => item.id === selectId) ? selectId : ''
    setOpenId(nextId)
    const next = list.find((item) => item.id === nextId) || null
    setTitle(next?.title || '')
    setBody(next?.body || '')
    setSource(next?.source || '')
    setDirty(false)
    if (!selectId) {
      setEditing(false)
      setEditingSource(false)
    }
  }

  useEffect(() => {
    reload().catch((err: Error) => setError(err.message))
    return () => window.clearTimeout(saveTimer.current)
  }, [])

  useEffect(() => {
    if (!currentId || !dirty) return
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void persist()
    }, 700)
    return () => window.clearTimeout(saveTimer.current)
  }, [title, body, source, dirty, currentId])

  async function persist(patch?: { title?: string; body?: string; source?: string }) {
    if (!current) return
    const nextTitle = patch?.title ?? title
    const nextBody = patch?.body ?? body
    const nextSource = patch?.source ?? source
    try {
      const saved = await api.saveStudyNote(current.id, { title: nextTitle, body: nextBody, source: nextSource })
      setNotes((list) => list.map((item) => (item.id === saved.id ? normalizeStudy(item, saved) : item)))
      setDirty(false)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗')
    }
  }

  async function create(layout: 'single' | 'spread') {
    const name = draft.trim() || '未命名筆記'
    await api.addStudyNote(name, '', [], [], layout)
    setDraft('')
    setQuery('')
    await reload()
  }

  async function saveTags(id: string, tags: string[]) {
    const saved = await api.saveStudyNote(id, { tags })
    setNotes((list) => list.map((item) => (item.id === saved.id ? normalizeStudy(item, saved) : item)))
  }

  async function setLayout(note: StudyNote, layout: 'single' | 'spread') {
    const saved = await api.saveStudyNote(note.id, { layout })
    setNotes((list) => list.map((item) => (item.id === saved.id ? normalizeStudy(item, saved) : item)))
  }

  function open(note: StudyNote) {
    window.clearTimeout(saveTimer.current)
    if (dirty && current) void api.saveStudyNote(current.id, { title, body, source })
    setOpenId(note.id)
    setTitle(note.title)
    setBody(note.body)
    setSource(note.source || '')
    setDirty(false)
    setEditing(false)
    setEditingSource(false)
    setEditingTitle(false)
    setRenameId('')
  }

  function startRename(note: StudyNote) {
    setRenameId(note.id)
    setRenameTitle(note.title)
  }

  async function commitRename() {
    if (!renameId) return
    const name = renameTitle.trim() || '未命名筆記'
    try {
      const saved = await api.saveStudyNote(renameId, { title: name })
      setNotes((list) => list.map((item) => (item.id === saved.id ? normalizeStudy(item, saved) : item)))
      if (openId === saved.id) setTitle(saved.title)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗')
    }
    setRenameId('')
  }

  async function remove(id: string) {
    await api.removeStudyNote(id)
    await reload()
  }

  function onSplitMove(clientX: number) {
    const box = splitRef.current
    if (!box) return
    const rect = box.getBoundingClientRect()
    if (rect.width < 80) return
    const pct = ((clientX - rect.left) / rect.width) * 100
    if (pct <= 8) {
      setSplitFold('left')
      return
    }
    if (pct >= 92) {
      setSplitFold('right')
      return
    }
    setSplitFold('none')
    setSplitLeft(Math.min(85, Math.max(15, pct)))
  }

  function openSplitEven() {
    setSplitFold('none')
    setSplitLeft(50)
  }

  function close() {
    window.clearTimeout(saveTimer.current)
    if (dirty && current) void persist()
    setOpenId('')
    setEditing(false)
    setEditingSource(false)
    setEditingTitle(false)
    setRenameId('')
    setDirty(false)
  }

  const tags = [...new Set(notes.flatMap((item) => item.tags || []))].filter(Boolean)
  const visible = notes.filter((item) => {
    if (filter && !(item.tags || []).includes(filter) && !item.title.includes(filter)) return false
    return matchQuery(query, item.title, item.body, item.source || '')
  })
  const shown = openId ? visible.filter((item) => item.id === openId) : visible

  return (
    <div className="learn-board">
      <div className="learn-toolbar">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void create('single')
            }
          }}
          placeholder="筆記標題"
        />
        <AddNoteMenu onCreate={(layout) => void create(layout)} />
        <button
          className={`ghost learn-tool-btn${query ? ' is-on' : ''}`}
          type="button"
          aria-label="搜尋已有內容"
          onClick={() => setQuery(draft.trim())}
        >
          <SearchIcon />
        </button>
      </div>
      <div className="tag-row">
        <button type="button" className={!filter ? 'active' : ''} onClick={() => setFilter('')}>
          全部
        </button>
        {tags.map((item) => (
          <button type="button" key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
      </div>
      {error ? <p className="warn">{error}</p> : null}
      {!shown.length ? <p className="empty">{query ? '沒有符合的筆記。' : '輸入標題後按＋新增，或用放大鏡搜尋已有內容。'}</p> : null}
      <div className="learn-cards">
        {shown.map((note) =>
          note.id === openId ? (
            <article key={note.id} className="learn-card is-open">
              <CardMenu
                onEdit={() => setEditingTitle(true)}
                onDelete={() => void remove(note.id)}
                layoutLabel={note.layout === 'spread' ? '改為單頁' : '改為雙頁'}
                onLayout={() => void setLayout(note, note.layout === 'spread' ? 'single' : 'spread')}
              />
              <div className="learn-card-head">
                <button type="button" className="learn-fold-caret" aria-label="收合" onClick={close}>
                  <FoldIcon />
                </button>
                {editingTitle ? (
                  <input
                    className="title-input"
                    value={title}
                    autoFocus
                    onChange={(event) => {
                      setTitle(event.target.value)
                      setDirty(true)
                    }}
                    onBlur={() => {
                      if (dirty) void persist()
                      setEditingTitle(false)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        event.currentTarget.blur()
                      }
                      if (event.key === 'Escape') {
                        setTitle(note.title)
                        setEditingTitle(false)
                        setDirty(false)
                      }
                    }}
                    placeholder="筆記標題"
                  />
                ) : (
                  <h2 className="title-input study-title">{title || '未命名筆記'}</h2>
                )}
                <small>{new Date(note.updatedAt).toLocaleDateString('zh-TW')}</small>
              </div>
              <div className="learn-meta-bar">
                <TagAdd tags={note.tags || []} onChange={(next) => void saveTags(note.id, next)} />
              </div>
              {note.layout === 'spread' ? (
                <div
                  ref={splitRef}
                  className={`learn-split${splitFold === 'none' ? '' : ` is-${splitFold}`}`}
                  style={
                    splitFold === 'left'
                      ? { gridTemplateColumns: '44px 12px minmax(0, 1fr)' }
                      : splitFold === 'right'
                        ? { gridTemplateColumns: 'minmax(0, 1fr) 12px 44px' }
                        : { gridTemplateColumns: `minmax(0, ${splitLeft}fr) 12px minmax(0, ${100 - splitLeft}fr)` }
                  }
                >
                  {splitFold === 'left' ? (
                    <button type="button" className="learn-split-pane is-rail" onClick={openSplitEven}>
                      <span>筆記</span>
                    </button>
                  ) : (
                    <section className="learn-split-pane">
                      <div className="learn-split-head">
                        <h3>筆記</h3>
                      </div>
                      <MdPane
                        value={source}
                        empty="在這裡寫你的筆記。雙擊開始寫 Markdown。"
                        tools
                        editing={editingSource}
                        onEdit={() => setEditingSource(true)}
                        onDone={(next) => {
                          const text = next ?? source
                          setSource(text)
                          void persist({ source: text })
                          setEditingSource(false)
                        }}
                        onChange={(next) => {
                          setSource(next)
                          setDirty(true)
                        }}
                      />
                    </section>
                  )}
                  <button
                    type="button"
                    className="learn-split-grip"
                    aria-label="調整左右筆記寬度"
                    onPointerDown={(event) => {
                      event.preventDefault()
                      splitDrag.current = true
                      event.currentTarget.setPointerCapture(event.pointerId)
                    }}
                    onPointerMove={(event) => {
                      if (!splitDrag.current) return
                      onSplitMove(event.clientX)
                    }}
                    onPointerUp={(event) => {
                      splitDrag.current = false
                      event.currentTarget.releasePointerCapture(event.pointerId)
                    }}
                  />
                  {splitFold === 'right' ? (
                    <button type="button" className="learn-split-pane is-rail" onClick={openSplitEven}>
                      <span>筆記</span>
                    </button>
                  ) : (
                    <section className="learn-split-pane">
                      <div className="learn-split-head">
                        <h3>筆記</h3>
                      </div>
                      <MdPane
                        value={body}
                        empty="在這裡寫你的筆記。雙擊開始寫 Markdown。"
                        tools
                        editing={editing}
                        onEdit={() => setEditing(true)}
                        onDone={(next) => {
                          const text = next ?? body
                          setBody(text)
                          void persist({ body: text })
                          setEditing(false)
                        }}
                        onChange={(next) => {
                          setBody(next)
                          setDirty(true)
                        }}
                      />
                    </section>
                  )}
                </div>
              ) : (
                <MdFold
                  title="筆記"
                  value={body}
                  empty="還沒有內容。雙擊開始寫 Markdown。"
                  tools
                  editing={editing}
                  onEdit={() => setEditing(true)}
                  onDone={() => {
                    void persist()
                    setEditing(false)
                  }}
                  onChange={(next) => {
                    setBody(next)
                    setDirty(true)
                  }}
                />
              )}
            </article>
          ) : (
            <article key={note.id} className="learn-card">
              <CardMenu
                onEdit={() => startRename(note)}
                onDelete={() => void remove(note.id)}
                layoutLabel={note.layout === 'spread' ? '改為單頁' : '改為雙頁'}
                onLayout={() => void setLayout(note, note.layout === 'spread' ? 'single' : 'spread')}
              />
              {renameId === note.id ? (
                <div className="learn-card-hit">
                  <CardFace
                    title={renameTitle}
                    kicker={noteKicker(note)}
                    editing
                    onTitleChange={setRenameTitle}
                    onTitleDone={() => void commitRename()}
                    onTitleCancel={() => setRenameId('')}
                  />
                </div>
              ) : (
                <button type="button" className="learn-card-hit" onClick={() => open(note)}>
                  <CardFace title={note.title || '未命名筆記'} kicker={noteKicker(note)} />
                </button>
              )}
            </article>
          ),
        )}
      </div>
    </div>
  )
}

function InboxPane() {
  const [items, setItems] = useState<Resource[]>([])
  const [url, setUrl] = useState('')
  const [filter, setFilter] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState('')
  const [contentOpen, setContentOpen] = useState(false)
  const [sideTab, setSideTab] = useState<'analysis' | 'captions'>('analysis')
  const [editingNote, setEditingNote] = useState(false)
  const [editingAnalysis, setEditingAnalysis] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [renameId, setRenameId] = useState('')
  const [renameTitle, setRenameTitle] = useState('')
  const [splitLeft, setSplitLeft] = useState(50)
  const [splitFold, setSplitFold] = useState<'none' | 'left' | 'right'>('none')
  const splitRef = useRef<HTMLDivElement>(null)
  const splitDrag = useRef(false)
  const captionsTried = useRef(new Set<string>())
  const imageTried = useRef(new Set<string>())

  async function reload(keepId = openId) {
    const list = await api.resources()
    setItems(list)
    setOpenId(keepId && list.some((item) => item.id === keepId) ? keepId : '')
    void hydrateImages(list)
  }

  async function hydrateImages(list: Resource[]) {
    for (const item of list) {
      if (item.kind === 'youtube' || item.image || imageTried.current.has(item.id)) continue
      imageTried.current.add(item.id)
      try {
        const next = await api.refreshResourceImage(item.id)
        setItems((rows) =>
          rows.map((row) => (row.id === next.id ? { ...row, image: next.image || row.image } : row)),
        )
      } catch {
        /* keep current preview */
      }
    }
  }

  useEffect(() => {
    reload('').catch((err: Error) => setError(err.message))
  }, [])

  const tags = [...new Set(items.flatMap((item) => item.tags))].filter(Boolean)
  const visible = items.filter((item) => {
    if (item.status === 'dismissed') return false
    if (filter && !item.tags.includes(filter) && !item.title.includes(filter)) return false
    return matchQuery(query, item.title, item.url, item.description, item.note, item.analysis)
  })
  const shown = openId ? visible.filter((item) => item.id === openId) : visible

  async function ingest() {
    if (!url.trim()) return
    setBusy('ingest')
    setError('')
    try {
      const created = await api.ingest(url.trim(), [])
      imageTried.current.add(created.id)
      setUrl('')
      setQuery('')
      await reload('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '擷取失敗')
    } finally {
      setBusy('')
    }
  }

  async function patch(id: string, body: Partial<Pick<Resource, 'tags' | 'status' | 'note' | 'analysis' | 'title'>>) {
    const next = await api.patchResource(id, body)
    setItems((list) =>
      list.map((item) =>
        item.id === next.id
          ? { ...item, ...next, note: next.note || '', captions: next.captions || '', captionLang: next.captionLang || '' }
          : item,
      ),
    )
  }

  async function summarize(item: Resource) {
    setBusy('analyze')
    setError('')
    try {
      const next = await api.analyzeResource(item.id)
      setItems((list) =>
        list.map((row) =>
          row.id === next.id
            ? { ...row, ...next, note: next.note || '', captions: next.captions || '', captionLang: next.captionLang || '' }
            : row,
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '摘要失敗')
    } finally {
      setBusy('')
    }
  }

  async function join(item: Resource) {
    setBusy('saved')
    setError('')
    try {
      await api.addStudyNote(item.title, item.analysis || item.note || '', [item.id])
      await patch(item.id, { status: 'saved' })
    } catch (err) {
      setError(err instanceof Error ? err.message : '加入失敗')
    } finally {
      setBusy('')
    }
  }

  async function loadCaptions(item: Resource) {
    const video = Boolean(youtubeId(item.url))
    if (video) {
      if (item.captions || captionsTried.current.has(item.id)) return
    } else if ((item.captions && item.articleHtml) || captionsTried.current.has(item.id)) return
    captionsTried.current.add(item.id)
    setBusy('captions')
    setError('')
    try {
      const next = await api.fetchResourceCaptions(item.id)
      setItems((list) =>
        list.map((row) =>
          row.id === next.id
            ? {
                ...row,
                ...next,
                note: next.note || '',
                captions: next.captions || '',
                captionLang: next.captionLang || '',
                articleHtml: next.articleHtml || row.articleHtml || '',
              }
            : row,
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : youtubeId(item.url) ? '字幕擷取失敗' : '內文擷取失敗')
    } finally {
      setBusy('')
    }
  }

  function closeCard(item?: Resource) {
    if (item) void patch(item.id, { note: item.note || '', analysis: item.analysis || '' })
    setOpenId('')
    setContentOpen(false)
    setSideTab('analysis')
    setEditingNote(false)
    setEditingAnalysis(false)
    setEditingTitle(false)
    setRenameId('')
  }

  function openCard(item: Resource) {
    setOpenId(item.id)
    setContentOpen(true)
    setSideTab('analysis')
    setEditingNote(false)
    setEditingAnalysis(false)
    setEditingTitle(false)
    setRenameId('')
    if (!youtubeId(item.url)) void loadCaptions(item)
  }

  function startRename(item: Resource) {
    setRenameId(item.id)
    setRenameTitle(item.title)
  }

  async function commitRename() {
    if (!renameId) return
    const name = renameTitle.trim() || '未命名'
    await patch(renameId, { title: name })
    setRenameId('')
  }

  async function removeItem(id: string) {
    await api.removeResource(id)
    await reload(openId === id ? '' : openId)
  }

  function onSplitMove(clientX: number) {
    const box = splitRef.current
    if (!box) return
    const rect = box.getBoundingClientRect()
    if (rect.width < 80) return
    const pct = ((clientX - rect.left) / rect.width) * 100
    if (pct <= 8) {
      setSplitFold('left')
      return
    }
    if (pct >= 92) {
      setSplitFold('right')
      return
    }
    setSplitFold('none')
    setSplitLeft(Math.min(85, Math.max(15, pct)))
  }

  function openSplitEven() {
    setSplitFold('none')
    setSplitLeft(50)
  }

  return (
    <div className="learn-board">
      <div className="learn-toolbar">
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void ingest()
            }
          }}
          placeholder="YouTube / 網頁 / 專欄網址"
        />
        <button className="ghost learn-tool-btn" type="button" aria-label="新增內容" disabled={busy === 'ingest'} onClick={() => void ingest()}>
          {busy === 'ingest' ? '…' : <PlusIcon />}
        </button>
        <button
          className={`ghost learn-tool-btn${query ? ' is-on' : ''}`}
          type="button"
          aria-label="搜尋已有內容"
          onClick={() => setQuery(url.trim())}
        >
          <SearchIcon />
        </button>
      </div>
      <div className="tag-row">
        <button type="button" className={!filter ? 'active' : ''} onClick={() => setFilter('')}>
          全部
        </button>
        {tags.map((item) => (
          <button type="button" key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
      </div>
      {error ? <p className="warn">{error}</p> : null}
      {!shown.length ? <p className="empty">{query ? '沒有符合的資源。' : '貼上網址後按＋新增，或用放大鏡搜尋已有內容。'}</p> : null}
      <div className="learn-cards">
        {shown.map((item) =>
          item.id === openId ? (
            <article key={item.id} className="learn-card is-open">
              <CardMenu
                onEdit={() => setEditingTitle(true)}
                onDelete={() => void removeItem(item.id)}
              />
              <div className="learn-card-head">
                <button type="button" className="learn-fold-caret" aria-label="收合" onClick={() => closeCard(item)}>
                  <FoldIcon />
                </button>
                {editingTitle ? (
                  <input
                    className="title-input"
                    value={item.title}
                    autoFocus
                    onChange={(event) => {
                      const next = event.target.value
                      setItems((list) => list.map((row) => (row.id === item.id ? { ...row, title: next } : row)))
                    }}
                    onBlur={() => {
                      void patch(item.id, { title: item.title })
                      setEditingTitle(false)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        event.currentTarget.blur()
                      }
                      if (event.key === 'Escape') setEditingTitle(false)
                    }}
                    placeholder="資源標題"
                  />
                ) : (
                  <h2>{item.title}</h2>
                )}
              </div>
              <div className="learn-preview">
                {youtubeId(item.url) ? (
                  <iframe
                    className="learn-embed"
                    src={`https://www.youtube.com/embed/${youtubeId(item.url)}`}
                    title={item.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div className="learn-article">
                    {busy === 'captions' && !item.articleHtml && !item.captions ? (
                      <p className="md-empty">整理版面中…</p>
                    ) : item.articleHtml ? (
                      <iframe
                        className="learn-article-frame"
                        sandbox="allow-popups allow-popups-to-escape-sandbox"
                        srcDoc={darkArticleDoc(item.articleHtml)}
                        title={item.title}
                      />
                    ) : item.captions ? (
                      <pre className="learn-cc">{item.captions}</pre>
                    ) : (
                      <p className="md-empty">擷取不到文章內文。</p>
                    )}
                  </div>
                )}
                <div className="learn-meta-bar">
                  <TagAdd tags={item.tags} onChange={(next) => void patch(item.id, { tags: next })} />
                  <a className="learn-go" href={item.url} target="_blank" rel="noreferrer" aria-label="開啟來源">
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                      <path
                        d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </a>
                </div>
              </div>
              <button
                type="button"
                className={`learn-split-toggle ${contentOpen ? 'is-on' : ''}`}
                onClick={() => setContentOpen((open) => !open)}
              >
                筆記
              </button>
              {contentOpen ? (
                <div
                  ref={splitRef}
                  className={`learn-split${splitFold === 'none' ? '' : ` is-${splitFold}`}`}
                  style={
                    splitFold === 'left'
                      ? { gridTemplateColumns: '44px 12px minmax(0, 1fr)' }
                      : splitFold === 'right'
                        ? { gridTemplateColumns: 'minmax(0, 1fr) 12px 44px' }
                        : { gridTemplateColumns: `minmax(0, ${splitLeft}fr) 12px minmax(0, ${100 - splitLeft}fr)` }
                  }
                >
                  {splitFold === 'left' ? (
                    <button type="button" className="learn-split-pane is-rail" onClick={openSplitEven}>
                      <span>筆記</span>
                    </button>
                  ) : (
                    <section className="learn-split-pane">
                      <div className="learn-split-head">
                        <h3>筆記</h3>
                      </div>
                      <MdPane
                        value={item.note || ''}
                        empty="還沒有筆記。雙擊開始寫 Markdown。"
                        editing={editingNote}
                        onEdit={() => setEditingNote(true)}
                        onDone={(next) => {
                          void patch(item.id, { note: next ?? item.note ?? '' })
                          setEditingNote(false)
                        }}
                        onChange={(next) => {
                          setItems((list) => list.map((row) => (row.id === item.id ? { ...row, note: next } : row)))
                        }}
                      />
                    </section>
                  )}
                  <button
                    type="button"
                    className="learn-split-grip"
                    aria-label="調整筆記與摘要寬度"
                    onPointerDown={(event) => {
                      event.preventDefault()
                      splitDrag.current = true
                      event.currentTarget.setPointerCapture(event.pointerId)
                    }}
                    onPointerMove={(event) => {
                      if (!splitDrag.current) return
                      onSplitMove(event.clientX)
                    }}
                    onPointerUp={(event) => {
                      splitDrag.current = false
                      event.currentTarget.releasePointerCapture(event.pointerId)
                    }}
                  />
                  {splitFold === 'right' ? (
                    <button type="button" className="learn-split-pane is-rail" onClick={openSplitEven}>
                      <span>摘要</span>
                    </button>
                  ) : (
                    <section className="learn-split-pane">
                      <div className="learn-split-head">
                        {youtubeId(item.url) ? (
                          <div className="learn-split-tabs" role="tablist" aria-label="摘要與字幕">
                            <button
                              type="button"
                              role="tab"
                              aria-selected={sideTab === 'analysis'}
                              className={sideTab === 'analysis' ? 'is-on' : ''}
                              onClick={() => setSideTab('analysis')}
                            >
                              摘要
                            </button>
                            <button
                              type="button"
                              role="tab"
                              aria-selected={sideTab === 'captions'}
                              className={sideTab === 'captions' ? 'is-on' : ''}
                              onClick={() => {
                                setSideTab('captions')
                                void loadCaptions(item)
                              }}
                            >
                              CC字幕
                            </button>
                          </div>
                        ) : (
                          <h3>摘要</h3>
                        )}
                        {sideTab === 'analysis' || !youtubeId(item.url) ? (
                          <button
                            className="ghost learn-ai"
                            type="button"
                            disabled={busy === 'analyze'}
                            onClick={() => void summarize(item)}
                          >
                            {busy === 'analyze' ? '整理中…' : 'Ai摘要'}
                          </button>
                        ) : null}
                      </div>
                      {sideTab === 'analysis' || !youtubeId(item.url) ? (
                        <MdPane
                          value={item.analysis || ''}
                          empty="還沒有摘要。雙擊可改 Markdown，或按右上角 Ai摘要。"
                          editing={editingAnalysis}
                          className="is-summary"
                          onEdit={() => setEditingAnalysis(true)}
                          onDone={(next) => {
                            void patch(item.id, { analysis: next ?? item.analysis ?? '' })
                            setEditingAnalysis(false)
                          }}
                          onChange={(next) => {
                            setItems((list) => list.map((row) => (row.id === item.id ? { ...row, analysis: next } : row)))
                          }}
                        />
                      ) : busy === 'captions' ? (
                        <p className="learn-split-body md-empty">擷取字幕中…</p>
                      ) : item.captions ? (
                        <pre className="learn-split-body learn-cc">
                          {item.captionLang ? `語言：${item.captionLang}\n\n` : ''}
                          {item.captions}
                        </pre>
                      ) : (
                        <p className="learn-split-body md-empty">沒有可用字幕</p>
                      )}
                    </section>
                  )}
                </div>
              ) : null}
              {item.analysis && item.status !== 'saved' ? (
                <div className="row">
                  <button className="solid" type="button" disabled={busy === 'saved'} onClick={() => void join(item)}>
                    加入我的學習筆記
                  </button>
                </div>
              ) : null}
            </article>
          ) : (
            <article key={item.id} className="learn-card">
              <CardMenu onEdit={() => startRename(item)} onDelete={() => void removeItem(item.id)} />
              {renameId === item.id ? (
                <div className="learn-card-hit">
                  <CardFace
                    title={renameTitle}
                    kicker={item.kind === 'youtube' ? 'YouTube' : '網頁'}
                    image={item.image}
                    youtube={item.url}
                    editing
                    onTitleChange={setRenameTitle}
                    onTitleDone={() => void commitRename()}
                    onTitleCancel={() => setRenameId('')}
                  />
                </div>
              ) : (
                <button type="button" className="learn-card-hit" onClick={() => openCard(item)}>
                  <CardFace
                    title={item.title}
                    kicker={item.kind === 'youtube' ? 'YouTube' : '網頁'}
                    image={item.image}
                    youtube={item.url}
                  />
                </button>
              )}
            </article>
          ),
        )}
      </div>
    </div>
  )
}

function darkArticleDoc(html: string) {
  if (html.includes('id="learn-dark"')) return html
  const style = `<style id="learn-dark">
  html, body { background: #101412 !important; color: #f3eee4 !important; }
  body * { background-color: transparent !important; border-color: rgba(243, 238, 228, 0.16) !important; }
  body p, body li, body h1, body h2, body h3, body h4, body h5, body h6,
  body td, body th, body blockquote, body figcaption, body dd, body dt, body div {
    color: #f3eee4 !important;
  }
  body a, body a * { color: #e8c56a !important; }
  body pre, body code, body kbd { background-color: #0c0f0d !important; color: #d7cbb6 !important; }
  body pre span, body code span { background-color: transparent !important; }
  img, video, svg, picture { background: transparent !important; }
</style>`
  if (html.includes('</head>')) return html.replace('</head>', `${style}</head>`)
  return `${style}${html}`
}

function matchQuery(query: string, ...parts: string[]) {
  if (!query) return true
  const needle = query.toLowerCase()
  return parts.some((part) => (part || '').toLowerCase().includes(needle))
}

function noteKicker(note: StudyNote) {
  const date = new Date(note.updatedAt).toLocaleDateString('zh-TW')
  return note.layout === 'spread' ? `${date} · 雙頁` : date
}

function normalizeStudy(prev: StudyNote, saved: StudyNote): StudyNote {
  return {
    ...prev,
    ...saved,
    tags: saved.tags || [],
    source: saved.source || '',
    layout: saved.layout === 'spread' ? 'spread' : 'single',
  }
}

function AddNoteMenu({ onCreate }: { onCreate: (layout: 'single' | 'spread') => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="learn-add-menu" ref={box}>
      <button
        className="ghost learn-tool-btn"
        type="button"
        aria-label="新增筆記"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <PlusIcon />
      </button>
      {open ? (
        <div className="learn-more-list" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onCreate('single')
            }}
          >
            單頁筆記
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onCreate('spread')
            }}
          >
            雙頁筆記
          </button>
        </div>
      ) : null}
    </div>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M16.2 16.2L21 21" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

function CardMenu({
  onEdit,
  onDelete,
  layoutLabel,
  onLayout,
}: {
  onEdit: () => void
  onDelete: () => void
  layoutLabel?: string
  onLayout?: () => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="learn-card-menu" ref={box}>
      <button
        type="button"
        className="learn-more"
        aria-label="更多"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
      >
        <MoreIcon />
      </button>
      {open ? (
        <div className="learn-more-list" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onEdit()
            }}
          >
            編輯
          </button>
          {layoutLabel && onLayout ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onLayout()
              }}
            >
              {layoutLabel}
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onDelete()
            }}
          >
            刪除
          </button>
        </div>
      ) : null}
    </div>
  )
}

function FoldIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
      <path
        d="M6 15l6-6 6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle cx="8" cy="12" r="1.65" fill="currentColor" />
      <circle cx="12" cy="12" r="1.65" fill="currentColor" />
      <circle cx="16" cy="12" r="1.65" fill="currentColor" />
    </svg>
  )
}

function CardFace({
  title,
  kicker,
  image,
  youtube,
  editing = false,
  onTitleChange,
  onTitleDone,
  onTitleCancel,
}: {
  title: string
  kicker: string
  image?: string
  youtube?: string
  editing?: boolean
  onTitleChange?: (next: string) => void
  onTitleDone?: () => void
  onTitleCancel?: () => void
}) {
  const poster = youtube ? youtubePoster(youtube) : ''
  const preferred = poster || image || NOTE_BG
  const [src, setSrc] = useState(preferred)
  const inputRef = useRef<HTMLInputElement>(null)
  const onPaper = src.includes('/learn/note_bg.jpeg')

  useEffect(() => {
    setSrc(preferred)
  }, [preferred])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  return (
    <>
      <div className="learn-card-media">
        <img
          src={src}
          alt=""
          onError={() => {
            setSrc((current) => {
              if (youtube && current.includes('maxresdefault')) return youtubePoster(youtube, 'mqdefault')
              if (current.includes('/learn/note_bg.jpeg')) return current
              return NOTE_BG
            })
          }}
        />
        {onPaper ? <p className="learn-card-script">{title || '未命名'}</p> : null}
      </div>
      <div className="learn-card-bar">
        <small>{kicker}</small>
        {editing ? (
          <input
            ref={inputRef}
            className="learn-card-title"
            value={title}
            onChange={(event) => onTitleChange?.(event.target.value)}
            onBlur={() => onTitleDone?.()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                event.currentTarget.blur()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                onTitleCancel?.()
              }
            }}
          />
        ) : (
          <MarqueeText text={title || '未命名'} />
        )}
      </div>
    </>
  )
}

function MarqueeText({ text }: { text: string }) {
  const wrap = useRef<HTMLElement>(null)
  const inner = useRef<HTMLSpanElement>(null)

  function measure() {
    const box = wrap.current
    const run = inner.current
    if (!box || !run) return
    const prev = run.style.maxWidth
    run.style.maxWidth = 'none'
    const shift = Math.min(0, box.clientWidth - run.scrollWidth)
    run.style.setProperty('--shift', `${shift}px`)
    run.style.setProperty('--marquee-ms', `${Math.max(2800, Math.abs(shift) * 22)}ms`)
    run.style.maxWidth = prev
  }

  return (
    <b ref={wrap} className="learn-marquee" onMouseEnter={measure}>
      <span ref={inner}>{text}</span>
    </b>
  )
}

type NoteTool = 'table' | 'bold' | 'underline' | 'ul' | 'ol' | 'indent' | 'outdent'

function formatNote(value: string, start: number, end: number, tool: NoteTool) {
  if (tool === 'bold') return wrapMarkup(value, start, end, '**', '**')
  if (tool === 'underline') return wrapMarkup(value, start, end, '<u>', '</u>')
  if (tool === 'ul') return bulletLines(value, start, end)
  if (tool === 'ol') return numberLines(value, start, end)
  if (tool === 'indent') return shiftLines(value, start, end, 1)
  if (tool === 'outdent') return shiftLines(value, start, end, -1)
  return insertTable(value, end)
}

function wrapMarkup(value: string, start: number, end: number, open: string, close: string) {
  const selected = value.slice(start, end)
  if (selected.includes('\n')) {
    const lines = selected.split('\n').map((line) => (line.trim() ? `${open}${line}${close}` : line))
    const block = lines.join('\n')
    return { value: value.slice(0, start) + block + value.slice(end), start, end: start + block.length }
  }
  const before = value.slice(Math.max(0, start - open.length), start)
  const after = value.slice(end, end + close.length)
  if (before === open && after === close) {
    const next = value.slice(0, start - open.length) + selected + value.slice(end + close.length)
    return { value: next, start: start - open.length, end: end - open.length }
  }
  if (
    selected.startsWith(open) &&
    selected.endsWith(close) &&
    selected.length >= open.length + close.length
  ) {
    const inner = selected.slice(open.length, selected.length - close.length)
    return { value: value.slice(0, start) + inner + value.slice(end), start, end: start + inner.length }
  }
  const next = value.slice(0, start) + open + selected + close + value.slice(end)
  if (!selected) {
    const cursor = start + open.length
    return { value: next, start: cursor, end: cursor }
  }
  return { value: next, start: start + open.length, end: end + open.length }
}

function bulletLines(value: string, start: number, end: number) {
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  let lineEnd = end
  if (lineEnd > lineStart && value[lineEnd - 1] === '\n') lineEnd -= 1
  const nextBreak = value.indexOf('\n', lineEnd)
  lineEnd = nextBreak < 0 ? value.length : nextBreak
  const lines = value.slice(lineStart, lineEnd).split('\n')
  const content = lines.filter((line) => line.trim())
  if (!content.length) {
    const inserted = '- '
    const next = value.slice(0, lineStart) + inserted + value.slice(lineEnd)
    const cursor = lineStart + inserted.length
    return { value: next, start: cursor, end: cursor }
  }
  const bulleted = content.every((line) => /^\s*[-*+]\s+/.test(line))
  const block = lines
    .map((line) => {
      if (!line.trim()) return line
      if (bulleted) return line.replace(/^(\s*)[-*+]\s+/, '$1')
      const marked = line.match(/^(\s*)(?:[-*+]|\d+\.)\s+(.*)$/)
      if (marked) return `${marked[1]}- ${marked[2]}`
      return line.replace(/^(\s*)/, '$1- ')
    })
    .join('\n')
  return { value: value.slice(0, lineStart) + block + value.slice(lineEnd), start: lineStart, end: lineStart + block.length }
}

function numberLines(value: string, start: number, end: number) {
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  let lineEnd = end
  if (lineEnd > lineStart && value[lineEnd - 1] === '\n') lineEnd -= 1
  const nextBreak = value.indexOf('\n', lineEnd)
  lineEnd = nextBreak < 0 ? value.length : nextBreak
  const lines = value.slice(lineStart, lineEnd).split('\n')
  const content = lines.filter((line) => line.trim())
  if (!content.length) {
    const inserted = '1. '
    const next = value.slice(0, lineStart) + inserted + value.slice(lineEnd)
    const cursor = lineStart + inserted.length
    return { value: next, start: cursor, end: cursor }
  }
  const numbered = content.every((line) => /^\d+\.\s+/.test(line))
  let count = 1
  const block = lines
    .map((line) => {
      if (!line.trim()) return line
      const stripped = line.replace(/^\d+\.\s+/, '')
      if (numbered) return stripped
      return `${count++}. ${stripped}`
    })
    .join('\n')
  return { value: value.slice(0, lineStart) + block + value.slice(lineEnd), start: lineStart, end: lineStart + block.length }
}

function shiftLines(value: string, start: number, end: number, direction: 1 | -1) {
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  let lineEnd = end
  if (lineEnd > lineStart && value[lineEnd - 1] === '\n') lineEnd -= 1
  const nextBreak = value.indexOf('\n', lineEnd)
  lineEnd = nextBreak < 0 ? value.length : nextBreak
  const block = value
    .slice(lineStart, lineEnd)
    .split('\n')
    .map((line) => {
      if (direction > 0) return `  ${line}`
      if (line.startsWith('  ')) return line.slice(2)
      if (line.startsWith(' ') || line.startsWith('\t')) return line.slice(1)
      return line
    })
    .join('\n')
  return { value: value.slice(0, lineStart) + block + value.slice(lineEnd), start: lineStart, end: lineStart + block.length }
}

function insertTable(value: string, at: number) {
  const table = '| 欄一 | 欄二 |\n| --- | --- |\n|  |  |\n|  |  |'
  let prefix = ''
  if (at > 0 && value[at - 1] !== '\n') prefix = '\n\n'
  else if (at > 1 && value[at - 2] !== '\n') prefix = '\n'
  let suffix = ''
  if (at < value.length && value[at] !== '\n') suffix = '\n\n'
  else if (at < value.length && (at + 1 >= value.length || value[at + 1] !== '\n')) suffix = '\n'
  const chunk = prefix + table + suffix
  const cell = prefix.length + table.indexOf('| --- | --- |\n| ') + '| --- | --- |\n| '.length
  const cursor = at + cell
  return { value: value.slice(0, at) + chunk + value.slice(at), start: cursor, end: cursor }
}

function useNoteTools(
  value: string,
  onChange: (next: string) => void,
  areaRef: RefObject<HTMLTextAreaElement | null>,
  editing: boolean,
) {
  const pending = useRef<{ start: number; end: number } | null>(null)
  const queued = useRef<NoteTool | null>(null)

  useLayoutEffect(() => {
    const area = areaRef.current
    const mark = pending.current
    if (!area || !mark) return
    area.focus()
    area.setSelectionRange(mark.start, mark.end)
    pending.current = null
  }, [value, areaRef])

  useLayoutEffect(() => {
    if (!editing || !queued.current || !areaRef.current) return
    const tool = queued.current
    queued.current = null
    const area = areaRef.current
    const at = area.value.length
    const next = formatNote(area.value, at, at, tool)
    pending.current = { start: next.start, end: next.end }
    if (next.value === area.value) {
      area.focus()
      area.setSelectionRange(next.start, next.end)
      pending.current = null
      return
    }
    onChange(next.value)
  }, [editing, areaRef, onChange])

  return (tool: NoteTool) => {
    const area = areaRef.current
    if (!area) {
      if (tool === 'table' || tool === 'ol') queued.current = tool
      return
    }
    const next = formatNote(area.value, area.selectionStart, area.selectionEnd, tool)
    pending.current = { start: next.start, end: next.end }
    if (next.value === area.value) {
      area.focus()
      area.setSelectionRange(next.start, next.end)
      pending.current = null
      return
    }
    onChange(next.value)
  }
}

function NoteTools({ onApply }: { onApply: (tool: NoteTool) => void }) {
  return (
    <div className="learn-note-tools" role="toolbar" aria-label="筆記工具">
      <button type="button" title="新增表格" aria-label="新增表格" onMouseDown={(event) => event.preventDefault()} onClick={() => onApply('table')}>
        <TableIcon />
      </button>
      <button type="button" title="選取加粗" aria-label="選取加粗" onMouseDown={(event) => event.preventDefault()} onClick={() => onApply('bold')}>
        <BoldMarkIcon />
      </button>
      <button type="button" title="選取底線" aria-label="選取底線" onMouseDown={(event) => event.preventDefault()} onClick={() => onApply('underline')}>
        <UnderlineIcon />
      </button>
      <button type="button" title="無序號列點" aria-label="無序號列點" onMouseDown={(event) => event.preventDefault()} onClick={() => onApply('ul')}>
        <BulletListIcon />
      </button>
      <button type="button" title="前標 1. 2. 3." aria-label="前標 1. 2. 3." onMouseDown={(event) => event.preventDefault()} onClick={() => onApply('ol')}>
        <NumberListIcon />
      </button>
      <button type="button" title="縮排" aria-label="縮排" onMouseDown={(event) => event.preventDefault()} onClick={() => onApply('indent')}>
        <IndentIcon />
      </button>
      <button type="button" title="反縮排" aria-label="反縮排" onMouseDown={(event) => event.preventDefault()} onClick={() => onApply('outdent')}>
        <OutdentIcon />
      </button>
    </div>
  )
}

function TableIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        d="M4 5.5h16v13H4v-13Zm0 4.3h16M4 14.2h16M9.3 5.5v13M14.7 5.5v13"
      />
    </svg>
  )
}

function BoldMarkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 5h6.2c2.4 0 4.2 1.5 4.2 3.6 0 1.4-.8 2.6-2.1 3.1 1.7.4 2.9 1.8 2.9 3.6 0 2.4-2 4.2-4.6 4.2H7V5Zm3.1 2.5v3.3h2.8c1.1 0 1.8-.6 1.8-1.6s-.7-1.7-1.9-1.7H10.1Zm0 5.6v3.8h3.3c1.3 0 2.1-.7 2.1-1.9s-.8-1.9-2.2-1.9H10.1Z"
      />
    </svg>
  )
}

function UnderlineIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 4.5h2.2v7.2c0 1.8 1.2 2.9 2.8 2.9s2.8-1.1 2.8-2.9V4.5H17v7.2c0 3-2.1 4.9-5 4.9s-5-1.9-5-4.9V4.5ZM6 18.2h12v1.8H6v-1.8Z"
      />
    </svg>
  )
}

function IndentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M3 4h18v2H3V4Zm0 14h18v2H3v-2ZM3 9v6l4-3-4-3Zm8 1h10v2H11v-2Zm0 4h10v2H11v-2Z" />
    </svg>
  )
}

function OutdentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M3 4h18v2H3V4Zm0 14h18v2H3v-2ZM7 9v6l-4-3 4-3Zm4 1h10v2H11v-2Zm0 4h10v2H11v-2Z" />
    </svg>
  )
}

function BulletListIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="7" r="1.6" fill="currentColor" />
      <circle cx="5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="5" cy="17" r="1.6" fill="currentColor" />
      <path fill="currentColor" d="M9 6h11v2H9V6Zm0 5h11v2H9v-2Zm0 5h11v2H9v-2Z" />
    </svg>
  )
}

function NumberListIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M5.2 4.2h1.6v4.2H5.4V5.6H4.4V4.5l.8-.3ZM4.3 10.2h3v1.1l-1.8 2.1h1.8v1.2h-3v-1.1l1.8-2.1H4.3v-1.2Zm.2 6.2h1.1v.8h-1v1.1h1v.8h-1v1.2h2.7v-1.1h-1V18h1v-1.1h-1v-.8h1v-1.1H4.5v1.4ZM9 6h11v2H9V6Zm0 5h11v2H9v-2Zm0 5h11v2H9v-2Z"
      />
    </svg>
  )
}

function pointRange(doc: Document, x: number, y: number) {
  const withCaret = doc as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  const range = withCaret.caretRangeFromPoint?.(x, y)
  if (range) return range
  const pos = withCaret.caretPositionFromPoint?.(x, y)
  if (!pos) return null
  const next = doc.createRange()
  next.setStart(pos.offsetNode, pos.offset)
  next.collapse(true)
  return next
}

function markFromPoint(host: HTMLElement, x: number, y: number) {
  for (const el of host.ownerDocument.elementsFromPoint(x, y)) {
    if (!(el instanceof HTMLElement) || !host.contains(el)) continue
    const marked = el.closest<HTMLElement>('[data-md-at]')
    if (marked && host.contains(marked)) return marked
  }
  let best: HTMLElement | null = null
  let bestDist = Infinity
  let bestArea = Infinity
  for (const el of host.querySelectorAll<HTMLElement>('[data-md-at]')) {
    const rect = el.getBoundingClientRect()
    const dist = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
    const area = rect.width * rect.height
    if (dist < bestDist || (dist === bestDist && area < bestArea)) {
      bestDist = dist
      bestArea = area
      best = el
    }
  }
  return best
}

function mapRendered(slice: string, rendered: string, renderedOffset: number) {
  if (!slice || renderedOffset <= 0) return 0
  if (slice === rendered) return Math.min(renderedOffset, slice.length)
  let sourceAt = 0
  let renderedAt = 0
  const target = Math.min(renderedOffset, rendered.length)
  while (renderedAt < target && sourceAt < slice.length) {
    if (slice[sourceAt] === rendered[renderedAt]) renderedAt += 1
    sourceAt += 1
  }
  if (renderedAt < target) {
    return Math.min(slice.length, Math.round((renderedOffset / Math.max(rendered.length, 1)) * slice.length))
  }
  return sourceAt
}

function caretInMark(marked: HTMLElement, x: number, y: number) {
  const range = pointRange(marked.ownerDocument, x, y)
  if (range && marked.contains(range.startContainer)) {
    const before = marked.ownerDocument.createRange()
    before.selectNodeContents(marked)
    before.setEnd(range.startContainer, range.startOffset)
    return before.toString().length
  }
  const rect = marked.getBoundingClientRect()
  const ratio = rect.width ? (x - rect.left) / rect.width : 0
  const text = marked.textContent ?? ''
  return Math.round(Math.min(1, Math.max(0, ratio)) * text.length)
}

function indexFromPreviewClick(event: ReactMouseEvent<HTMLElement>, source: string) {
  const marked = markFromPoint(event.currentTarget, event.clientX, event.clientY)
  if (!marked) return 0
  const at = Number(marked.dataset.mdAt)
  const end = Number(marked.dataset.mdEnd)
  if (!Number.isFinite(at)) return 0
  const endAt = Number.isFinite(end) ? Math.max(at, end) : at
  const local = mapRendered(source.slice(at, endAt), marked.textContent ?? '', caretInMark(marked, event.clientX, event.clientY))
  return Math.min(source.length, at + local)
}

function caretTop(area: HTMLTextAreaElement, index: number) {
  const mirror = document.createElement('div')
  const style = getComputedStyle(area)
  const props = [
    'boxSizing',
    'width',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'letterSpacing',
    'lineHeight',
    'textIndent',
    'tabSize',
    'whiteSpace',
    'wordBreak',
  ] as const
  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.left = '0'
  mirror.style.top = '0'
  mirror.style.overflow = 'hidden'
  mirror.style.whiteSpace = 'pre-wrap'
  for (const prop of props) mirror.style[prop] = style[prop]
  mirror.textContent = area.value.slice(0, index)
  const mark = document.createElement('span')
  mark.textContent = area.value.slice(index, index + 1) || ' '
  mirror.appendChild(mark)
  document.body.appendChild(mirror)
  const top = mark.offsetTop
  mirror.remove()
  return top
}

function scrollParent(node: HTMLElement | null) {
  let current = node?.parentElement ?? null
  while (current) {
    const style = getComputedStyle(current)
    if (/(auto|scroll)/.test(`${style.overflowY} ${style.overflow}`) && current.scrollHeight > current.clientHeight + 2) {
      return current
    }
    current = current.parentElement
  }
  return null
}

function lineOffsets(value: string) {
  const offsets = [0]
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === '\n') offsets.push(i + 1)
  }
  return offsets
}

function indexAtContentY(area: HTMLTextAreaElement, targetTop: number) {
  const offsets = lineOffsets(area.value)
  let best = 0
  let lo = 0
  let hi = offsets.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (caretTop(area, offsets[mid]) <= targetTop) {
      best = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return offsets[best]
}

function markForIndex(root: HTMLElement, index: number) {
  let best: HTMLElement | null = null
  let bestSpan = Infinity
  let bestAt = -1
  let fallback: HTMLElement | null = null
  let fallbackAt = -1
  for (const el of root.querySelectorAll<HTMLElement>('[data-md-at]')) {
    const at = Number(el.dataset.mdAt)
    const end = Number(el.dataset.mdEnd)
    if (!Number.isFinite(at)) continue
    if (at <= index && at >= fallbackAt) {
      fallback = el
      fallbackAt = at
    }
    if (!Number.isFinite(end) || index < at || index > end) continue
    const span = end - at
    if (span < bestSpan || (span === bestSpan && at >= bestAt)) {
      best = el
      bestSpan = span
      bestAt = at
    }
  }
  return best ?? fallback
}

function stickPreview(preview: HTMLElement, index: number, clientY: number) {
  const mark = markForIndex(preview, index)
  if (!mark) return
  const delta = mark.getBoundingClientRect().top - clientY
  if (Math.abs(delta) < 2) return
  if (preview.scrollHeight > preview.clientHeight + 2) {
    preview.scrollTop = Math.max(0, preview.scrollTop + delta)
    return
  }
  const scroller = scrollParent(preview)
  if (scroller) scroller.scrollTop += delta
  else window.scrollBy(0, delta)
}

function stickCaret(area: HTMLTextAreaElement, contentTop: number, clientY: number) {
  const rect = area.getBoundingClientRect()
  if (area.scrollHeight > area.clientHeight + 2) {
    area.scrollTop = Math.max(0, contentTop - (clientY - rect.top))
    return
  }
  const lineY = rect.top + contentTop - area.scrollTop
  const delta = lineY - clientY
  if (Math.abs(delta) < 2) return
  const scroller = scrollParent(area)
  if (scroller) scroller.scrollTop += delta
  else window.scrollBy(0, delta)
}

let pendingEditPlace: { index: number; clientY: number } | null = null

function useEditPlace(editing: boolean, sourceRef: RefObject<HTMLTextAreaElement | null>) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [closePlace, setClosePlace] = useState<{ index: number; clientY: number } | null>(null)

  useLayoutEffect(() => {
    if (!editing) {
      pendingEditPlace = null
      const place = closePlace
      if (!place) return
      const pin = () => {
        const preview = previewRef.current
        if (preview) stickPreview(preview, place.index, place.clientY)
      }
      pin()
      requestAnimationFrame(() => {
        pin()
        requestAnimationFrame(pin)
      })
      window.setTimeout(pin, 60)
      return
    }
    const area = sourceRef.current
    const place = pendingEditPlace
    if (!area || !place) return
    const index = Math.max(0, Math.min(place.index, area.value.length))
    area.focus({ preventScroll: true })
    area.setSelectionRange(index, index)
    const top = caretTop(area, index)
    const pin = () => {
      const node = sourceRef.current
      if (node) stickCaret(node, top, place.clientY)
    }
    pin()
    requestAnimationFrame(() => {
      pin()
      requestAnimationFrame(pin)
    })
    window.setTimeout(pin, 60)
  }, [editing, sourceRef, closePlace])

  return {
    previewRef,
    begin(event: ReactMouseEvent<HTMLElement>, source: string) {
      pendingEditPlace = { index: indexFromPreviewClick(event, source), clientY: event.clientY }
    },
    remember() {
      const area = sourceRef.current
      if (!area) return
      const index = indexAtContentY(area, area.scrollTop + 8)
      const clientY = area.getBoundingClientRect().top + caretTop(area, index) - area.scrollTop
      setClosePlace({ index, clientY })
    },
  }
}

function MdPane({
  value,
  empty,
  editing,
  onEdit,
  onDone,
  onChange,
  className = '',
  tools = false,
}: {
  value: string
  empty: string
  editing: boolean
  onEdit: () => void
  onDone: (next?: string) => void
  onChange: (next: string) => void
  className?: string
  tools?: boolean
}) {
  const sourceRef = useRef<HTMLTextAreaElement>(null)
  const applyTool = useNoteTools(value, onChange, sourceRef, editing)
  const placeEdit = useEditPlace(editing, sourceRef)

  function finish() {
    placeEdit.remember()
    onDone(sourceRef.current?.value)
  }

  const bodyClass = ['learn-split-body', className].filter(Boolean).join(' ')
  const editor = (
    <textarea
      ref={sourceRef}
      className={tools ? 'md-source' : `md-source ${bodyClass}`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          finish()
        }
      }}
      placeholder={'# 標題\n\n內容'}
    />
  )
  const preview = (
    <div
      ref={placeEdit.previewRef}
      className={`md-preview ${bodyClass}`}
      onDoubleClick={(event) => {
        placeEdit.begin(event, value)
        onEdit()
      }}
    >
      {value.trim() ? <MarkdownView text={value} /> : <p className="md-empty">{empty}</p>}
    </div>
  )

  if (!editing) return preview
  if (!tools) return editor

  return (
    <div className={`${bodyClass} is-with-tools`}>
      <NoteTools onApply={applyTool} />
      {editor}
    </div>
  )
}

function MdFold({
  title,
  value,
  empty,
  editing,
  onEdit,
  onDone,
  onChange,
  extra,
  tools = false,
}: {
  title: string
  value: string
  empty: string
  editing: boolean
  onEdit: () => void
  onDone: () => void
  onChange: (next: string) => void
  extra?: ReactNode
  tools?: boolean
}) {
  const sourceRef = useRef<HTMLTextAreaElement>(null)
  const applyTool = useNoteTools(value, onChange, sourceRef, editing)
  const placeEdit = useEditPlace(editing, sourceRef)

  function finish() {
    placeEdit.remember()
    onDone()
  }

  return (
    <details className="learn-fold" defaultOpen>
      <summary>
        <span>{title}</span>
        {extra ? (
          <span
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
          >
            {extra}
          </span>
        ) : null}
      </summary>
      {tools && editing ? <NoteTools onApply={applyTool} /> : null}
      {editing ? (
        <textarea
          ref={sourceRef}
          className="md-source"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={finish}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              finish()
            }
          }}
          placeholder={'# 標題\n\n內容'}
        />
      ) : (
        <div
          ref={placeEdit.previewRef}
          className="md-preview"
          onDoubleClick={(event) => {
            placeEdit.begin(event, value)
            onEdit()
          }}
        >
          {value.trim() ? <MarkdownView text={value} /> : <p className="md-empty">{empty}</p>}
        </div>
      )}
    </details>
  )
}

function TagAdd({ tags, onChange }: { tags: string[]; onChange: (next: string[]) => void }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (adding) inputRef.current?.focus()
  }, [adding])

  function commit() {
    const next = draft.trim()
    setAdding(false)
    setDraft('')
    if (!next || tags.includes(next)) return
    onChange([...tags, next])
  }

  return (
    <div className="tag-row">
      {tags.map((tag) => (
        <span key={tag} className="learn-tag">
          {tag}
          <button
            type="button"
            className="learn-tag-x"
            aria-label={`刪除 ${tag}`}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onChange(tags.filter((item) => item !== tag))
            }}
          >
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <input
          ref={inputRef}
          className="tag-add-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
            if (event.key === 'Escape') {
              setAdding(false)
              setDraft('')
            }
          }}
          placeholder="新標籤"
        />
      ) : (
        <button type="button" className="tag-add" aria-label="新增標籤" onClick={() => setAdding(true)}>
          +
        </button>
      )}
    </div>
  )
}
