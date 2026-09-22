import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Resource } from '../lib/types'

export function LearnPage() {
  const [items, setItems] = useState<Resource[]>([])
  const [url, setUrl] = useState('')
  const [tag, setTag] = useState('')
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [similar, setSimilar] = useState<{ title: string; href: string; snippet: string }[]>([])
  const [current, setCurrent] = useState<Resource | null>(null)

  async function reload() {
    const list = await api.resources()
    setItems(list)
    setCurrent((prev) => list.find((item) => item.id === prev?.id) || list.find((item) => item.status !== 'dismissed') || null)
  }

  useEffect(() => {
    reload().catch((err: Error) => setError(err.message))
  }, [])

  const tags = [...new Set(items.flatMap((item) => item.tags))].filter(Boolean)
  const visible = items.filter((item) => {
    if (item.status === 'dismissed') return false
    if (!filter) return true
    return item.tags.includes(filter) || item.title.includes(filter)
  })

  async function ingest() {
    if (!url.trim()) return
    setBusy('ingest')
    setError('')
    try {
      const created = await api.ingest(url.trim(), tag ? [tag] : [])
      setUrl('')
      await reload()
      setCurrent(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : '擷取失敗')
    } finally {
      setBusy('')
    }
  }

  async function act(item: Resource, action: 'saved' | 'dismissed' | 'more' | 'analyze') {
    setBusy(action)
    setError('')
    try {
      if (action === 'more') {
        const hits = await api.similar(item.title, item.tags)
        setSimilar(hits)
      } else if (action === 'analyze') {
        const next = await api.analyzeResource(item.id)
        setCurrent(next)
        await reload()
      } else {
        await api.patchResource(item.id, { status: action })
        await reload()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失敗')
    } finally {
      setBusy('')
    }
  }

  async function addTag(item: Resource) {
    if (!tag.trim()) return
    const tagsNext = [...new Set([...item.tags, tag.trim()])]
    await api.patchResource(item.id, { tags: tagsNext })
    setTag('')
    await reload()
  }

  return (
    <div className="split-page">
      <aside className="side-list">
        <div className="stack">
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="YouTube / 網頁 / 專欄網址" />
          <input value={tag} onChange={(event) => setTag(event.target.value)} placeholder="標籤，例如：排版、後端" />
          <button className="solid" disabled={busy === 'ingest'} onClick={() => void ingest()}>
            {busy === 'ingest' ? '擷取中…' : '存入並擷取'}
          </button>
        </div>
        <div className="tag-row">
          <button className={!filter ? 'active' : ''} onClick={() => setFilter('')}>
            全部
          </button>
          {tags.map((item) => (
            <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>
              {item}
            </button>
          ))}
        </div>
        {visible.map((item) => (
          <button key={item.id} className={item.id === current?.id ? 'active' : ''} onClick={() => setCurrent(item)}>
            <b>{item.title}</b>
            <small>
              {item.status === 'saved' ? '已收入' : '待處理'} · {item.kind}
            </small>
          </button>
        ))}
      </aside>
      <section className="panel grow">
        {error && <p className="warn">{error}</p>}
        {!current && <p className="empty">貼上網址，系統會先把標題與摘要抓進來，再由你決定要不要收入筆記。</p>}
        {current && (
          <>
            {current.image && <img className="hero" src={current.image} alt="" />}
            <h2>{current.title}</h2>
            <a href={current.url} target="_blank" rel="noreferrer">
              {current.url}
            </a>
            <p className="lede">{current.description || current.excerpt}</p>
            <div className="tag-row">
              {current.tags.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            <div className="row wrap">
              <button className="solid" onClick={() => void act(current, 'saved')}>
                加入我的學習筆記
              </button>
              <button className="ghost" onClick={() => void act(current, 'dismissed')}>
                這不是我想看的
              </button>
              <button className="ghost" disabled={busy === 'more'} onClick={() => void act(current, 'more')}>
                給我更多相近內容
              </button>
              <button className="ghost" disabled={busy === 'analyze'} onClick={() => void act(current, 'analyze')}>
                AI 整理這篇
              </button>
              <button className="text" onClick={() => void addTag(current)}>
                加上目前標籤
              </button>
            </div>
            {current.analysis && (
              <article className="analysis">
                <pre>{current.analysis}</pre>
              </article>
            )}
            {similar.length > 0 && (
              <div className="matches">
                <h3>相近內容</h3>
                {similar.map((hit) => (
                  <div key={hit.href} className="match-row">
                    <a href={hit.href} target="_blank" rel="noreferrer">
                      <b>{hit.title}</b>
                      <small>{hit.snippet}</small>
                    </a>
                    <button
                      className="ghost"
                      onClick={() => {
                        setUrl(hit.href)
                        void api.ingest(hit.href, current.tags).then(() => reload())
                      }}
                    >
                      擷取進來
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
