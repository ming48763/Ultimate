import { useEffect, useState } from 'react'
import { api, uploadFile } from '../lib/api'
import type { Note } from '../lib/types'

export function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([])
  const [current, setCurrent] = useState<Note | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  async function reload(selectId?: string) {
    const list = await api.notes()
    setNotes(list)
    const next = list.find((item) => item.id === selectId) || list[0] || null
    setCurrent(next)
    setTitle(next?.title || '')
    setBody(next?.body || '')
  }

  useEffect(() => {
    reload().catch((err: Error) => setError(err.message))
  }, [])

  async function create() {
    const created = await api.addNote('新靈感', '', [])
    await reload(created.id)
  }

  async function save() {
    if (!current) return
    const saved = await api.saveNote(current.id, { title, body })
    setCurrent(saved)
    await reload(saved.id)
  }

  async function analyze() {
    if (!current) return
    setBusy(true)
    setError('')
    try {
      await save()
      const next = await api.analyzeNote(current.id)
      setCurrent(next)
      await reload(next.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失敗')
    } finally {
      setBusy(false)
    }
  }

  async function onFile(file?: File) {
    if (!file || !current) return
    const url = await uploadFile(file)
    const media = [...current.media, url]
    const saved = await api.saveNote(current.id, { title, body, media })
    setCurrent({ ...saved, media })
    await reload(saved.id)
  }

  return (
    <div className="split-page">
      <aside className="side-list">
        <button className="solid" onClick={() => void create()}>
          新增靈感
        </button>
        {notes.map((note) => (
          <button
            key={note.id}
            className={note.id === current?.id ? 'active' : ''}
            onClick={() => {
              setCurrent(note)
              setTitle(note.title)
              setBody(note.body)
            }}
          >
            <b>{note.title}</b>
            <small>{new Date(note.updatedAt).toLocaleDateString('zh-TW')}</small>
          </button>
        ))}
      </aside>
      <section className="panel grow">
        {!current && <p className="empty">先寫下一則靈感。AI 會用預設的理性評估 prompt 整理，不會幫你打氣。</p>}
        {current && (
          <>
            <input className="title-input" value={title} onChange={(event) => setTitle(event.target.value)} />
            <textarea
              className="tall"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="想法、畫面、使用者、還不知道能不能做的部分，都寫進來。"
            />
            <div className="row">
              <label className="file">
                加入圖片／檔案
                <input type="file" onChange={(event) => void onFile(event.target.files?.[0])} />
              </label>
              <button className="ghost" onClick={() => void save()}>
                儲存
              </button>
              <button className="solid" disabled={busy} onClick={() => void analyze()}>
                {busy ? '評估中…' : '理性評估'}
              </button>
              <button className="text" onClick={() => void api.removeNote(current.id).then(() => reload())}>
                刪除
              </button>
            </div>
            {error && <p className="warn">{error}</p>}
            {current.media.length > 0 && (
              <div className="media-row">
                {current.media.map((src) =>
                  /\.(png|jpg|jpeg|gif|webp)$/i.test(src) ? (
                    <img key={src} src={src} alt="" />
                  ) : (
                    <a key={src} href={src} target="_blank" rel="noreferrer">
                      {src}
                    </a>
                  ),
                )}
              </div>
            )}
            {current.matches.length > 0 && (
              <div className="matches">
                <h3>網路上相近的產品／服務</h3>
                {current.matches.map((hit) => (
                  <a key={hit.href} href={hit.href} target="_blank" rel="noreferrer">
                    <b>{hit.title}</b>
                    <small>{hit.snippet}</small>
                  </a>
                ))}
              </div>
            )}
            {current.analysis && (
              <article className="analysis">
                <h3>評估結果</h3>
                <pre>{current.analysis}</pre>
              </article>
            )}
          </>
        )}
      </section>
    </div>
  )
}
