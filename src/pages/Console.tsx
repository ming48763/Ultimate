import { useEffect, useRef, useState, type DragEvent } from 'react'
import { api } from '../lib/api'
import {
  PHASE_NAMES,
  gradeProgress,
  partLit,
  type GradeCore,
  type GradeFeature,
  type GradePart,
  type Overview,
  type PhaseStatus,
  type ProjectCard,
  type ProjectPhase,
} from '../lib/types'

const PHASE_STATUS: { id: PhaseStatus; label: string }[] = [
  { id: 'idle', label: '未開始' },
  { id: 'doing', label: '進行中' },
  { id: 'done', label: '已完成' },
]

function nid() {
  return crypto.randomUUID()
}

export function ConsolePage() {
  const [data, setData] = useState<Overview | null>(null)
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')

  async function reload() {
    const next = await api.overview()
    setData(next)
    setSelected((current) => current || next.projects[0]?.id || '')
  }

  useEffect(() => {
    reload().catch((err: unknown) => setError(err instanceof Error ? err.message : '讀取失敗'))
  }, [])

  const project = data?.projects.find((item) => item.id === selected) ?? data?.projects[0]

  async function saveMeta(patch: Partial<ProjectCard['meta']>) {
    if (!project) return
    if (patch.grades) {
      const progress = gradeProgress(patch.grades)
      setData((current) => {
        if (!current) return current
        return {
          ...current,
          projects: current.projects.map((item) =>
            item.id === project.id ? { ...item, meta: { ...item.meta, grades: patch.grades }, progress } : item,
          ),
        }
      })
    }
    const next = await api.saveProject(project.id, {
      ...project.meta,
      ...patch,
      deploy: patch.deploy ?? project.meta.deploy,
    })
    setData((current) => {
      if (!current) return current
      return {
        ...current,
        projects: current.projects.map((item) =>
          item.id === project.id
            ? {
                ...item,
                meta: { ...item.meta, ...next },
                progress: gradeProgress(next.grades ?? patch.grades ?? item.meta.grades),
              }
            : item,
        ),
      }
    })
  }

  if (error) return <p className="empty">{error}</p>
  if (!data) return <p className="empty">讀取本機專案與對話紀錄中…</p>
  if (!project) return <p className="empty">這個資料夾還沒有可整理的專案。</p>

  return (
    <div className="console-page">
      <section className="trace-panel">
        <div className="section-kicker">進度儀錶板</div>
        <div className="bars trace-bars">
          {data.projects.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === project.id ? 'bar-card active' : 'bar-card'}
              onClick={() => setSelected(item.id)}
            >
              <span>{item.name}</span>
              <small>{phaseLabel(item.meta.phases)}</small>
              <i>
                <b style={{ width: `${item.progress}%` }} />
              </i>
              <em>{item.progress}%</em>
            </button>
          ))}
        </div>
      </section>

      <section className="trace-panel">
        <div className="section-kicker">分級</div>
        <GradeBoard
          key={project.id}
          cores={project.meta.grades ?? []}
          onSave={(grades) => void saveMeta({ grades })}
        />
      </section>

      <section className="trace-panel">
        <div className="section-kicker">階段</div>
        <PhaseBoard
          key={`${project.id}-phases`}
          phases={project.meta.phases ?? []}
          onSave={(phases) => void saveMeta({ phases })}
        />
      </section>

      <section className="trace-panel">
        <div className="section-kicker">託管平台與部署情況</div>
        <div className="deploy-grid">
          {(['github', 'vercel', 'render', 'mongo', 'other'] as const).map((key) => (
            <DeployField
              key={project.id + key}
              label={key}
              value={project.meta.deploy[key]}
              placeholder={key === 'github' ? project.git?.remote || 'https://' : 'https://'}
              onSave={(value) => void saveMeta({ deploy: { ...project.meta.deploy, [key]: value } })}
            />
          ))}
          <label>
            狀態
            <select
              key={project.id + 'status'}
              defaultValue={project.meta.deploy.status}
              onChange={(event) => void saveMeta({ deploy: { ...project.meta.deploy, status: event.target.value } })}
            >
              <option value="local">本機</option>
              <option value="repo">已上 git</option>
              <option value="staging">測試環境</option>
              <option value="live">已上線</option>
              <option value="paused">暫停</option>
            </select>
          </label>
        </div>
      </section>
    </div>
  )
}

function phaseLabel(phases?: ProjectPhase[]) {
  if (!phases?.length) return '未開始'
  const doing = phases.findIndex((item) => item.status === 'doing')
  if (doing >= 0) return PHASE_NAMES[doing]
  let last = -1
  phases.forEach((item, index) => {
    if (item.status === 'done') last = index
  })
  if (last >= 0) return PHASE_NAMES[last]
  return '未開始'
}

function pageHref(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  const git = value.match(/^git@github\.com:(.+?)(?:\.git)?$/i)
  if (git) return `https://github.com/${git[1]}`
  if (/^(www\.)?github\.com\//i.test(value)) return `https://${value}`
  if (/^localhost(:\d+)?(\/|$)/i.test(value) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?/.test(value)) {
    return `http://${value}`
  }
  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(value)) return `https://${value}`
  return null
}

function OpenWebIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13 5h6v6M19 5l-9 9"
      />
    </svg>
  )
}

function DeployField({
  label,
  value,
  placeholder,
  onSave,
}: {
  label: string
  value: string
  placeholder: string
  onSave: (value: string) => void
}) {
  const [text, setText] = useState(value)
  const href = pageHref(text)

  return (
    <div className="deploy-item">
      <label>
        {label}
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => onSave(text)}
          placeholder={placeholder}
        />
      </label>
      {href ? (
        <a className="deploy-open" href={href} target="_blank" rel="noopener noreferrer" aria-label="開啟此網頁">
          <OpenWebIcon />
        </a>
      ) : (
        <span className="deploy-open is-off" aria-hidden>
          <OpenWebIcon />
        </span>
      )}
    </div>
  )
}

function asOneCore(cores: GradeCore[]): GradeCore {
  if (!cores.length) return { id: nid(), name: '', parts: [] }
  if (cores.length === 1) return cores[0]
  return { ...cores[0], parts: cores.flatMap((item) => item.parts) }
}

type GradeKind = 'part' | 'feature'
type GradeDrag = { kind: GradeKind; id: string }
type GradeOver = { zone: GradeKind; id: string; place: 'before' | 'after' | 'into' }

function reorder<T extends { id: string }>(list: T[], fromId: string, toId: string, place: 'before' | 'after'): T[] {
  const from = list.findIndex((item) => item.id === fromId)
  if (from < 0) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  let to = next.findIndex((row) => row.id === toId)
  if (to < 0) return list
  if (place === 'after') to += 1
  next.splice(to, 0, item)
  return next
}

function GradeBoard({
  cores,
  onSave,
}: {
  cores: GradeCore[]
  onSave: (next: GradeCore[]) => void
}) {
  const [core, setCore] = useState(() => asOneCore(cores))
  const [partId, setPartId] = useState(asOneCore(cores).parts[0]?.id ?? '')
  const [dragging, setDragging] = useState<GradeDrag | null>(null)
  const [over, setOver] = useState<GradeOver | null>(null)
  const coreRef = useRef(core)
  const partIdRef = useRef(partId)
  const draggingRef = useRef(dragging)
  coreRef.current = core
  partIdRef.current = partId
  draggingRef.current = dragging
  const part = core.parts.find((item) => item.id === partId) ?? null

  function commit(next: GradeCore) {
    setCore(next)
    onSave([next])
  }

  function persist() {
    onSave([coreRef.current])
  }

  function addPart() {
    const node: GradePart = { id: nid(), name: '', done: false, features: [] }
    const next = { ...core, parts: [...core.parts, node] }
    commit(next)
    setPartId(node.id)
  }

  function addFeature() {
    if (!part) return
    const node: GradeFeature = { id: nid(), name: '', done: false }
    commit({
      ...core,
      parts: core.parts.map((row) => (row.id === part.id ? { ...row, features: [...row.features, node] } : row)),
    })
  }

  function startDrag(kind: GradeKind, id: string, event: DragEvent<HTMLElement>) {
    const row = event.currentTarget.closest('li')
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', `${kind}:${id}`)
    if (row) event.dataTransfer.setDragImage(row, 18, 18)
    const next = { kind, id }
    draggingRef.current = next
    setDragging(next)
    setOver(null)
  }

  function hoverItem(zone: GradeKind, id: string, event: DragEvent<HTMLLIElement>) {
    const live = draggingRef.current
    if (!live) return
    if (live.kind === 'part' && zone !== 'part') return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const place: GradeOver['place'] =
      live.kind === 'feature' && zone === 'part'
        ? 'into'
        : event.clientY < event.currentTarget.getBoundingClientRect().top + event.currentTarget.offsetHeight / 2
          ? 'before'
          : 'after'
    setOver((current) =>
      current?.zone === zone && current.id === id && current.place === place ? current : { zone, id, place },
    )
  }

  function dropOn(zone: GradeKind, id: string, place: GradeOver['place']) {
    const live = draggingRef.current
    const current = coreRef.current
    const selected = partIdRef.current
    draggingRef.current = null
    setDragging(null)
    setOver(null)
    if (!live) return

    if (live.kind === 'part') {
      if (zone !== 'part' || live.id === id) return
      commit({ ...current, parts: reorder(current.parts, live.id, id, place === 'after' ? 'after' : 'before') })
      return
    }

    if (zone === 'part') {
      const source = current.parts.find((row) => row.features.some((item) => item.id === live.id))
      const feature = source?.features.find((item) => item.id === live.id)
      if (!source || !feature) return
      if (source.id === id) {
        if (source.features[source.features.length - 1]?.id === live.id) return
        commit({
          ...current,
          parts: current.parts.map((row) =>
            row.id === source.id
              ? { ...row, features: [...row.features.filter((item) => item.id !== live.id), feature] }
              : row,
          ),
        })
        return
      }
      commit({
        ...current,
        parts: current.parts.map((row) => {
          if (row.id === source.id) return { ...row, features: row.features.filter((item) => item.id !== live.id) }
          if (row.id === id) return { ...row, features: [...row.features, feature] }
          return row
        }),
      })
      setPartId(id)
      return
    }

    if (live.id === id) return
    const host = current.parts.find((row) => row.id === selected)
    if (!host) return
    commit({
      ...current,
      parts: current.parts.map((row) =>
        row.id === host.id
          ? { ...row, features: reorder(row.features, live.id, id, place === 'after' ? 'after' : 'before') }
          : row,
      ),
    })
  }

  function endDrag() {
    draggingRef.current = null
    setDragging(null)
    setOver(null)
  }

  return (
    <div className="grade-board">
      <article className="grade-core">
        <h3>核心</h3>
        <textarea
          className="grade-core-text"
          value={core.name}
          onChange={(event) => setCore({ ...core, name: event.target.value })}
          onBlur={persist}
          placeholder="輸入核心"
          rows={3}
        />
      </article>
      <div className="grade-split">
        <GradeColumn
          title="部件"
          kind="part"
          items={core.parts.map((row) => ({ ...row, done: partLit(row) }))}
          selected={partId}
          dragging={dragging}
          over={over}
          onSelect={setPartId}
          onRename={(id, name) =>
            setCore({ ...core, parts: core.parts.map((row) => (row.id === id ? { ...row, name } : row)) })
          }
          onCommit={persist}
          onRemove={(id) => {
            const nextParts = core.parts.filter((row) => row.id !== id)
            commit({ ...core, parts: nextParts })
            if (partId === id) setPartId(nextParts[0]?.id ?? '')
          }}
          onAdd={addPart}
          onDragStart={startDrag}
          onDragOverItem={hoverItem}
          onDropItem={dropOn}
          onDragEnd={endDrag}
        />
        <GradeColumn
          title="功能"
          kind="feature"
          items={part?.features ?? []}
          selected=""
          disabled={!part}
          dragging={dragging}
          over={over}
          onSelect={() => undefined}
          onRename={(id, name) => {
            if (!part) return
            setCore({
              ...core,
              parts: core.parts.map((row) =>
                row.id !== part.id
                  ? row
                  : {
                      ...row,
                      features: row.features.map((feature) => (feature.id === id ? { ...feature, name } : feature)),
                    },
              ),
            })
          }}
          onToggle={(id) => {
            if (!part) return
            commit({
              ...core,
              parts: core.parts.map((row) =>
                row.id !== part.id
                  ? row
                  : {
                      ...row,
                      features: row.features.map((feature) =>
                        feature.id === id ? { ...feature, done: !feature.done } : feature,
                      ),
                    },
              ),
            })
          }}
          onCommit={persist}
          onRemove={(id) => {
            if (!part) return
            commit({
              ...core,
              parts: core.parts.map((row) =>
                row.id !== part.id ? row : { ...row, features: row.features.filter((feature) => feature.id !== id) },
              ),
            })
          }}
          onAdd={addFeature}
          onDragStart={startDrag}
          onDragOverItem={hoverItem}
          onDropItem={dropOn}
          onDragEnd={endDrag}
        />
      </div>
    </div>
  )
}

function GradeColumn({
  title,
  kind,
  items,
  selected,
  disabled,
  dragging,
  over,
  onSelect,
  onRename,
  onToggle,
  onCommit,
  onRemove,
  onAdd,
  onDragStart,
  onDragOverItem,
  onDropItem,
  onDragEnd,
}: {
  title: string
  kind: GradeKind
  items: { id: string; name: string; done?: boolean }[]
  selected: string
  disabled?: boolean
  dragging: GradeDrag | null
  over: GradeOver | null
  onSelect: (id: string) => void
  onRename: (id: string, name: string) => void
  onToggle?: (id: string) => void
  onCommit: () => void
  onRemove: (id: string) => void
  onAdd: () => void
  onDragStart: (kind: GradeKind, id: string, event: DragEvent<HTMLElement>) => void
  onDragOverItem: (zone: GradeKind, id: string, event: DragEvent<HTMLLIElement>) => void
  onDropItem: (zone: GradeKind, id: string, place: GradeOver['place']) => void
  onDragEnd: () => void
}) {
  const catching = kind === 'part' && dragging?.kind === 'feature'

  return (
    <article className={`grade-col${disabled ? ' is-off' : ''}${catching ? ' is-catch' : ''}`}>
      <h3>{title}</h3>
      <ul
        className="grade-list"
        onDragOver={(event) => {
          if (!dragging) return
          if (kind === 'feature' && dragging.kind === 'part') return
          event.preventDefault()
        }}
        onDrop={(event) => {
          event.preventDefault()
          if (over?.zone === kind) onDropItem(over.zone, over.id, over.place)
        }}
      >
        {items.map((item) => {
          const hint = over?.zone === kind && over.id === item.id ? over.place : null
          return (
            <li
              key={item.id}
              className={[
                item.id === selected ? 'is-on' : '',
                dragging?.id === item.id ? 'is-dragging' : '',
                hint === 'into' ? 'is-drop' : '',
                hint === 'before' ? 'is-over-before' : '',
                hint === 'after' ? 'is-over-after' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onDragOver={(event) => onDragOverItem(kind, item.id, event)}
              onDrop={(event) => {
                event.preventDefault()
                event.stopPropagation()
                const place =
                  dragging?.kind === 'feature' && kind === 'part'
                    ? 'into'
                    : event.clientY < event.currentTarget.getBoundingClientRect().top + event.currentTarget.offsetHeight / 2
                      ? 'before'
                      : 'after'
                onDropItem(kind, item.id, place)
              }}
            >
              <span
                className="grade-grip"
                draggable={!disabled}
                role="button"
                aria-label="拖曳調整位置"
                onDragStart={(event) => {
                  if (disabled) {
                    event.preventDefault()
                    return
                  }
                  onDragStart(kind, item.id, event)
                }}
                onDragEnd={onDragEnd}
              >
                <i />
                <i />
              </span>
              <input
                type="checkbox"
                className={kind === 'part' ? 'is-locked' : ''}
                checked={Boolean(item.done)}
                onChange={() => {
                  if (kind === 'part') return
                  onToggle?.(item.id)
                }}
                disabled={disabled}
                tabIndex={kind === 'part' ? -1 : undefined}
                aria-label={kind === 'part' ? `${item.name || title}（功能全數完成後自動點亮）` : `${item.name || title}完成`}
              />
              <input
                value={item.name}
                onFocus={() => onSelect(item.id)}
                onChange={(event) => onRename(item.id, event.target.value)}
                onBlur={onCommit}
                placeholder="輸入名稱"
                disabled={disabled}
              />
              <button type="button" className="text grade-x" onClick={() => onRemove(item.id)} disabled={disabled}>
                X
              </button>
            </li>
          )
        })}
      </ul>
      <button type="button" className="todo-plus" onClick={onAdd} disabled={disabled} aria-label={`新增${title}`}>
        +
      </button>
    </article>
  )
}

function PhaseBoard({
  phases,
  onSave,
}: {
  phases: ProjectPhase[]
  onSave: (next: ProjectPhase[]) => void
}) {
  const start = PHASE_NAMES.map((_, index) => phases[index] ?? { status: 'idle' as const, note: '' })
  const firstDoing = start.findIndex((item) => item.status === 'doing')
  const [items, setItems] = useState(start)
  const [tab, setTab] = useState(firstDoing >= 0 ? firstDoing : 0)
  const itemsRef = useRef(items)
  itemsRef.current = items

  function commit(next: ProjectPhase[]) {
    setItems(next)
    onSave(next)
  }

  function cycle(status: PhaseStatus): PhaseStatus {
    if (status === 'idle') return 'doing'
    if (status === 'doing') return 'done'
    return 'idle'
  }

  const current = items[tab]

  return (
    <div className="phase-board">
      <div className="phase-switch" role="tablist" aria-label="開發階段">
        {PHASE_NAMES.map((name, index) => {
          const item = items[index]
          const label = PHASE_STATUS.find((row) => row.id === item.status)?.label ?? '未開始'
          return (
            <div
              key={name}
              className={`phase-tab is-${item.status}${index === tab ? ' is-on' : ''}`}
              role="tab"
              aria-selected={index === tab}
            >
              <button type="button" className="phase-tab-name" onClick={() => setTab(index)}>
                <em>{index + 1}</em>
                {name}
              </button>
              <button
                type="button"
                className="phase-status"
                onClick={() => {
                  setTab(index)
                  commit(items.map((row, i) => (i === index ? { ...row, status: cycle(row.status) } : row)))
                }}
              >
                {label}
              </button>
            </div>
          )
        })}
      </div>
      <label>
        開發摘要
        <textarea
          className="phase-summary"
          value={current.note}
          onChange={(event) => setItems(items.map((row, i) => (i === tab ? { ...row, note: event.target.value } : row)))}
          onBlur={() => onSave(itemsRef.current)}
          placeholder="這個階段做到哪、接下來要什麼"
        />
      </label>
    </div>
  )
}
