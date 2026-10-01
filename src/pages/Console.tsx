import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { api, uploadFile } from '../lib/api'
import {
  PHASE_NAMES,
  phaseTitle,
  gradeProgress,
  partLit,
  phaseOf,
  type GradeCore,
  type GradeFeature,
  type GradePart,
  type Overview,
  type PhaseFile,
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

const CONSOLE_PROJECT = 'ultimate-console-project'

function rememberProject(id: string) {
  try {
    if (id) localStorage.setItem(CONSOLE_PROJECT, id)
  } catch {
    /* ignore quota / private mode */
  }
}

function pickProject(projects: ProjectCard[], current: string) {
  if (current && projects.some((item) => item.id === current)) return current
  let stored = ''
  try {
    stored = localStorage.getItem(CONSOLE_PROJECT) || ''
  } catch {
    stored = ''
  }
  if (stored && projects.some((item) => item.id === stored)) return stored
  const filled = projects.find((item) => (item.meta.grades ?? []).some((core) => core.parts.length))
  return filled?.id || projects[0]?.id || ''
}

export function ConsolePage() {
  const [data, setData] = useState<Overview | null>(null)
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const dataRef = useRef(data)
  dataRef.current = data

  async function reload() {
    const next = await api.overview()
    setData(next)
    setSelected((current) => {
      const nextId = pickProject(next.projects, current)
      rememberProject(nextId)
      return nextId
    })
  }

  useEffect(() => {
    reload().catch((err: unknown) => setError(err instanceof Error ? err.message : '讀取失敗'))
  }, [])

  const project = data?.projects.find((item) => item.id === selected) ?? data?.projects[0]

  async function saveMeta(id: string, patch: Partial<ProjectCard['meta']>) {
    const target = dataRef.current?.projects.find((item) => item.id === id)
    if (!target) return
    if (patch.grades) {
      const progress = gradeProgress(patch.grades)
      setData((current) => {
        if (!current) return current
        return {
          ...current,
          projects: current.projects.map((item) =>
            item.id === id ? { ...item, meta: { ...item.meta, grades: patch.grades }, progress } : item,
          ),
        }
      })
    }
    const next = await api.saveProject(id, {
      ...target.meta,
      ...patch,
      deploy: patch.deploy ?? target.meta.deploy,
    })
    setData((current) => {
      if (!current) return current
      return {
        ...current,
        projects: current.projects.map((item) =>
          item.id === id
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

  if (error) {
    return (
      <div className="console-page">
        <p className="empty">{error}</p>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="console-page">
        <p className="empty">讀取本機專案與對話紀錄中…</p>
      </div>
    )
  }
  if (!project) {
    return (
      <div className="console-page">
        <p className="empty">這個資料夾還沒有可整理的專案。</p>
      </div>
    )
  }

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
              onClick={() => {
                setSelected(item.id)
                rememberProject(item.id)
              }}
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
          projectId={project.id}
          cores={project.meta.grades ?? []}
          phases={project.meta.phases ?? []}
          onSaveGrades={(grades) => void saveMeta(project.id, { grades })}
          onSavePhases={(phases) => void saveMeta(project.id, { phases })}
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
              onSave={(value) => void saveMeta(project.id, { deploy: { ...project.meta.deploy, [key]: value } })}
            />
          ))}
          <label>
            狀態
            <select
              key={project.id + 'status'}
              defaultValue={project.meta.deploy.status}
              onChange={(event) => void saveMeta(project.id, { deploy: { ...project.meta.deploy, status: event.target.value } })}
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
  if (doing >= 0) return phaseTitle(phases, doing)
  let last = -1
  phases.forEach((item, index) => {
    if (item.status === 'done') last = index
  })
  if (last >= 0) return phaseTitle(phases, last)
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

function firstPhaseTab(phases: ProjectPhase[], parts: GradePart[] = []) {
  const doing = phases.findIndex((item) => item.status === 'doing')
  if (doing >= 0) return doing
  const ranked = parts.map((item) => phaseOf(item))
  return ranked.length ? Math.min(...ranked) : 0
}

function GradeBoard({
  projectId,
  cores,
  phases,
  onSaveGrades,
  onSavePhases,
}: {
  projectId: string
  cores: GradeCore[]
  phases: ProjectPhase[]
  onSaveGrades: (next: GradeCore[]) => void
  onSavePhases: (next: ProjectPhase[]) => void
}) {
  const [core, setCore] = useState(() => asOneCore(cores))
  const [phaseTab, setPhaseTab] = useState(() => firstPhaseTab(phases, asOneCore(cores).parts))
  const [partId, setPartId] = useState(() => {
    const start = asOneCore(cores)
    const tab = firstPhaseTab(phases, start.parts)
    return start.parts.find((item) => phaseOf(item) === tab)?.id ?? start.parts[0]?.id ?? ''
  })
  const [dragging, setDragging] = useState<GradeDrag | null>(null)
  const [over, setOver] = useState<GradeOver | null>(null)
  const [forgeOpen, setForgeOpen] = useState(false)
  const [forgeBusy, setForgeBusy] = useState<'architecture' | 'feasibility' | null>(null)
  const [forgeKind, setForgeKind] = useState<'architecture' | 'feasibility'>('architecture')
  const [forgeHint, setForgeHint] = useState('')
  const [forgeDraft, setForgeDraft] = useState('')
  const [forgeToast, setForgeToast] = useState('')
  const coreRef = useRef(core)
  const partIdRef = useRef(partId)
  const phaseTabRef = useRef(phaseTab)
  const draggingRef = useRef(dragging)
  const livePhasesRef = useRef(phases)
  coreRef.current = core
  partIdRef.current = partId
  phaseTabRef.current = phaseTab
  draggingRef.current = dragging
  const visibleParts = core.parts.filter((item) => phaseOf(item) === phaseTab)
  const part = visibleParts.find((item) => item.id === partId) ?? visibleParts[0] ?? null

  function commit(next: GradeCore) {
    setCore(next)
    onSaveGrades([next])
  }

  function persist() {
    onSaveGrades([coreRef.current])
  }

  async function forgePrompt(kind: 'architecture' | 'feasibility') {
    if (forgeBusy) return
    setForgeBusy(kind)
    setForgeHint('')
    try {
      const next = await api.composeAgentPrompt(projectId, {
        kind,
        grades: [coreRef.current],
        phases: livePhasesRef.current,
      })
      setForgeKind(kind)
      setForgeDraft(next.prompt)
      setForgeOpen(true)
      if (next.saved === false) setForgeHint('已生成，但沒寫進軌跡收藏')
    } catch (error) {
      setForgeHint(error instanceof Error ? error.message : '生成失敗')
    } finally {
      setForgeBusy(null)
    }
  }

  function addPart() {
    const node: GradePart = { id: nid(), name: '', done: false, phase: phaseTab, features: [] }
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
    const visible = current.parts.filter((item) => phaseOf(item) === phaseTabRef.current)
    const selected = visible.find((item) => item.id === partIdRef.current)?.id ?? visible[0]?.id ?? ''
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
    <>
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
      <div className="grade-phases">
        <h3>階段</h3>
        <PhaseBoard phases={phases} tab={phaseTab} onTab={setPhaseTab} onSave={onSavePhases} liveRef={livePhasesRef} />
      </div>
      <div className="grade-split">
        <GradeColumn
          title="部件"
          kind="part"
          items={visibleParts.map((row) => ({ ...row, done: partLit(row) }))}
          selected={part?.id ?? ''}
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
            if (partId === id) {
              setPartId(nextParts.find((row) => phaseOf(row) === phaseTab)?.id ?? '')
            }
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
      <div className="grade-prompt-row">
        {forgeHint ? <p className="phase-files-hint">{forgeHint}</p> : <span />}
        <div className="grade-prompt-actions">
          <button
            type="button"
            className="ghost"
            disabled={Boolean(forgeBusy)}
            onClick={() => void forgePrompt('feasibility')}
          >
            {forgeBusy === 'feasibility' ? '生成中…' : '可行性評估'}
          </button>
          <button
            type="button"
            className="solid"
            disabled={Boolean(forgeBusy)}
            onClick={() => void forgePrompt('architecture')}
          >
            {forgeBusy === 'architecture' ? '生成中…' : '專案架構生成'}
          </button>
        </div>
      </div>
    </div>
      {forgeOpen ? (
        <div className="modal-back" onClick={() => setForgeOpen(false)}>
          <div className="modal wide" onClick={(event) => event.stopPropagation()}>
            <h2>{forgeKind === 'feasibility' ? '可行性評估' : '專案架構生成'}</h2>
            <p className="hint">
              {forgeKind === 'feasibility'
                ? '這是要貼給其他 AI Agent 做可行性評估的提示詞，不是評估結果。已同步到軌跡的 prompt 收藏。'
                : '這是要貼給其他 AI Agent 的專案架構提示詞，不是架構說明本身。已同步到軌跡的 prompt 收藏。'}
            </p>
            <textarea
              className="prompt-forge-text"
              value={forgeDraft}
              onChange={(event) => setForgeDraft(event.target.value)}
            />
            <div className="row-end">
              <button
                type="button"
                className="ghost"
                disabled={!forgeDraft.trim()}
                onClick={() => {
                  void navigator.clipboard.writeText(forgeDraft)
                  setForgeToast('已複製')
                  window.setTimeout(() => setForgeToast(''), 1600)
                }}
              >
                {forgeToast || '複製'}
              </button>
              <button type="button" className="solid" onClick={() => setForgeOpen(false)}>
                關閉
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
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
  tab,
  onTab,
  onSave,
  liveRef,
}: {
  phases: ProjectPhase[]
  tab: number
  onTab: (index: number) => void
  onSave: (next: ProjectPhase[]) => void
  liveRef?: { current: ProjectPhase[] }
}) {
  const start = PHASE_NAMES.map((_, index) => phases[index] ?? { status: 'idle' as const, note: '' })
  const [items, setItems] = useState(start)
  const itemsRef = useRef(items)
  itemsRef.current = items
  if (liveRef) liveRef.current = items
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const skipRename = useRef(false)

  useEffect(() => {
    if (editing == null) return
    nameRef.current?.focus()
    nameRef.current?.select()
  }, [editing])

  function commit(next: ProjectPhase[]) {
    itemsRef.current = next
    setItems(next)
    onSave(next)
  }

  function cycle(status: PhaseStatus): PhaseStatus {
    if (status === 'idle') return 'doing'
    if (status === 'doing') return 'done'
    return 'idle'
  }

  function switchTab(index: number) {
    if (index === tab) return
    onSave(itemsRef.current)
    onTab(index)
  }

  function finishRename(index: number) {
    if (skipRename.current) {
      skipRename.current = false
      setEditing(null)
      return
    }
    const trimmed = draft.trim().slice(0, 40)
    const stored = trimmed && trimmed !== PHASE_NAMES[index] ? trimmed : ''
    setEditing(null)
    if ((itemsRef.current[index]?.name ?? '') === stored) return
    const next = itemsRef.current.map((row, i) => (i === index ? { ...row, name: stored } : row))
    commit(next)
  }

  const current = items[tab] ?? items[0] ?? { status: 'idle' as const, note: '' }

  return (
    <div className="phase-board">
      <div className="phase-switch" role="tablist" aria-label="開發階段">
        {PHASE_NAMES.map((fallback, index) => {
          const item = items[index] ?? { status: 'idle' as const, note: '' }
          const title = item.name?.trim() || fallback
          const label = PHASE_STATUS.find((row) => row.id === item.status)?.label ?? '未開始'
          return (
            <div
              key={fallback}
              className={`phase-tab is-${item.status}${index === tab ? ' is-on' : ''}`}
              role="tab"
              aria-selected={index === tab}
            >
              {editing === index ? (
                <label className="phase-tab-name">
                  <em>{index + 1}</em>
                  <input
                    ref={nameRef}
                    value={draft}
                    aria-label="階段名稱"
                    maxLength={40}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={() => finishRename(index)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        event.currentTarget.blur()
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        skipRename.current = true
                        event.currentTarget.blur()
                      }
                    }}
                  />
                </label>
              ) : (
                <button
                  type="button"
                  className="phase-tab-name"
                  title="雙擊修改名稱"
                  onClick={() => switchTab(index)}
                  onDoubleClick={(event) => {
                    event.preventDefault()
                    setDraft(title)
                    setEditing(index)
                  }}
                >
                  <em>{index + 1}</em>
                  {title}
                </button>
              )}
              <button
                type="button"
                className="phase-status"
                onClick={() => {
                  switchTab(index)
                  commit(itemsRef.current.map((row, i) => (i === index ? { ...row, status: cycle(row.status) } : row)))
                }}
              >
                {label}
              </button>
            </div>
          )
        })}
      </div>
      <div className="phase-note-wrap">
        <span>開發摘要</span>
        <PhaseNote
          key={tab}
          html={current.note ?? ''}
          onChange={(html) => {
            if ((itemsRef.current[tab]?.note ?? '') === html) return
            const next = itemsRef.current.map((row, i) => (i === tab ? { ...row, note: html } : row))
            itemsRef.current = next
            setItems(next)
          }}
          onSave={() => onSave(itemsRef.current)}
        />
      </div>
      {tab === 0 ? (
        <PhaseFiles
          files={items[0]?.files ?? []}
          onChange={(files) => {
            const next = itemsRef.current.map((row, i) => (i === 0 ? { ...row, files } : row))
            itemsRef.current = next
            commit(next)
          }}
        />
      ) : null}
    </div>
  )
}

function PhaseFiles({
  files,
  onChange,
}: {
  files: PhaseFile[]
  onChange: (next: PhaseFile[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState('')
  const [over, setOver] = useState(false)

  async function addFiles(list: FileList | File[]) {
    const incoming = [...list]
    if (!incoming.length || busy) return
    setBusy(true)
    setHint('')
    try {
      const uploaded: PhaseFile[] = []
      for (const file of incoming) {
        const url = await uploadFile(file)
        uploaded.push({ id: nid(), name: file.name, url })
      }
      onChange([...files, ...uploaded])
    } catch (error) {
      setHint(error instanceof Error ? error.message : '上傳失敗')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="phase-files">
      <span>檔案</span>
      <input
        ref={inputRef}
        className="phase-file-input"
        type="file"
        multiple
        onChange={(event) => void addFiles(event.target.files ?? [])}
      />
      <div
        className={`phase-drop${over ? ' is-over' : ''}${busy ? ' is-busy' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node)) return
          setOver(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          void addFiles(event.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            inputRef.current?.click()
          }
        }}
      >
        <em>{busy ? '上傳中…' : '拖曳檔案到這裡，或點擊上傳'}</em>
      </div>
      {hint ? <p className="phase-files-hint">{hint}</p> : null}
      {files.length ? (
        <ul className="phase-file-list">
          {files.map((item) => (
            <li key={item.id}>
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                {item.name}
              </a>
              <button type="button" className="text grade-x" onClick={() => onChange(files.filter((file) => file.id !== item.id))}>
                X
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

const NOTE_SIZES = [
  { id: '12px', label: '小' },
  { id: '14px', label: '內文' },
  { id: '16px', label: '中' },
  { id: '20px', label: '大' },
  { id: '28px', label: '特大' },
]
const NOTE_COLORS = [
  { id: '#f3eee4', label: '白色' },
  { id: '#e8c56a', label: '黃色' },
  { id: '#8fd4b8', label: '綠色' },
  { id: '#ef9a9a', label: '紅色' },
]

function isEmptyHtml(html: string) {
  return !String(html ?? '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim()
}

function sanitizeNote(html: string) {
  const box = document.createElement('div')
  box.innerHTML = html
  box.querySelectorAll('script,style,iframe,object,form').forEach((node) => node.remove())
  box.querySelectorAll('*').forEach((node) => {
    for (const attr of [...node.attributes]) {
      if (attr.name.startsWith('on') || attr.name.startsWith('data-cursor') || /javascript:/i.test(attr.value)) node.removeAttribute(attr.name)
    }
  })
  return box.innerHTML
}

function toEditorHtml(note: string) {
  const text = String(note ?? '').trim()
  if (!text) return ''
  if (/<[a-z][\s\S]*>/i.test(text)) return sanitizeNote(text)
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
}

function PhaseNote({
  html,
  onChange,
  onSave,
}: {
  html: string
  onChange: (html: string) => void
  onSave: () => void
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const rangeRef = useRef<Range | null>(null)
  const boldBtn = useRef<HTMLButtonElement>(null)
  const ulBtn = useRef<HTMLButtonElement>(null)
  const olBtn = useRef<HTMLButtonElement>(null)
  const [size, setSize] = useState('14px')
  const [empty, setEmpty] = useState(() => isEmptyHtml(html))

  useLayoutEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.innerHTML = toEditorHtml(html)
  }, [])

  function remember() {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) return
    const node = sel.anchorNode
    if (!node || !editorRef.current?.contains(node)) return
    rangeRef.current = sel.getRangeAt(0).cloneRange()
  }

  function restore() {
    const editor = editorRef.current
    const range = rangeRef.current
    if (!editor || !range) return
    editor.focus()
    try {
      if (!range.startContainer.isConnected || !range.endContainer.isConnected) return
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    } catch {
      // list conversion can detach the previous range
    }
  }

  function paintMarks() {
    const inEditor = editorRef.current?.contains(document.getSelection()?.anchorNode ?? null)
    const on = (btn: HTMLButtonElement | null, active: boolean) => {
      if (!btn) return
      btn.classList.toggle('is-on', active)
      btn.setAttribute('aria-pressed', String(active))
    }
    const query = (command: string) => {
      try {
        return Boolean(inEditor && document.queryCommandState(command))
      } catch {
        return false
      }
    }
    on(boldBtn.current, query('bold'))
    on(ulBtn.current, query('insertUnorderedList'))
    on(olBtn.current, query('insertOrderedList'))
  }

  function readHtml() {
    const raw = editorRef.current?.innerHTML ?? ''
    return isEmptyHtml(raw) ? '' : sanitizeNote(raw)
  }

  function commitNote() {
    const next = readHtml()
    setEmpty(!next)
    onChange(next)
  }

  function afterTool() {
    remember()
    paintMarks()
    commitNote()
    requestAnimationFrame(() => restore())
  }

  function keepFocus(event: MouseEvent<HTMLElement>) {
    remember()
    if (event.currentTarget.tagName === 'SELECT') return
    event.preventDefault()
  }

  function run(command: string, value?: string) {
    remember()
    restore()
    document.execCommand(command, false, value)
    afterTool()
  }

  function applySize(px: string) {
    const editor = editorRef.current
    if (!editor) return
    remember()
    restore()
    document.execCommand('styleWithCSS', false, 'false')
    document.execCommand('fontSize', false, '7')
    const spans: HTMLSpanElement[] = []
    editor.querySelectorAll('font[size="7"]').forEach((node) => {
      const span = document.createElement('span')
      span.style.fontSize = px
      while (node.firstChild) span.appendChild(node.firstChild)
      node.replaceWith(span)
      spans.push(span)
    })
    if (spans.length) {
      const range = document.createRange()
      range.setStartBefore(spans[0])
      range.setEndAfter(spans[spans.length - 1])
      rangeRef.current = range
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
    setSize(px)
    afterTool()
  }

  function applyColor(color: string) {
    remember()
    restore()
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand('foreColor', false, color)
    afterTool()
  }

  useEffect(() => {
    function onSelect() {
      remember()
      paintMarks()
    }
    document.addEventListener('selectionchange', onSelect)
    return () => document.removeEventListener('selectionchange', onSelect)
  }, [])

  return (
    <div className="phase-note">
      <div className="phase-toolbar" role="toolbar" aria-label="文書工具列">
        <button
          ref={ulBtn}
          type="button"
          aria-pressed={false}
          title="圓點列點"
          onMouseDown={keepFocus}
          onClick={() => run('insertUnorderedList')}
        >
          <ListBulletIcon />
        </button>
        <button
          ref={olBtn}
          type="button"
          aria-pressed={false}
          title="數字列點"
          onMouseDown={keepFocus}
          onClick={() => run('insertOrderedList')}
        >
          <ListNumberIcon />
        </button>
        <i className="phase-sep" aria-hidden />
        <button
          ref={boldBtn}
          type="button"
          aria-pressed={false}
          title="文字粗體"
          onMouseDown={keepFocus}
          onClick={() => run('bold')}
        >
          <BoldIcon />
        </button>
        <i className="phase-sep" aria-hidden />
        <div className="phase-size">
          <select
            aria-label="文字大小"
            value={size}
            onMouseDown={keepFocus}
            onChange={(event) => applySize(event.target.value)}
          >
            {NOTE_SIZES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="phase-colors" aria-label="文字色彩">
          {NOTE_COLORS.map((color) => (
            <button
              key={color.id}
              type="button"
              className="phase-swatch"
              style={{ background: color.id }}
              title={color.label}
              aria-label={color.label}
              onMouseDown={keepFocus}
              onClick={() => applyColor(color.id)}
            />
          ))}
        </div>
      </div>
      <div
        ref={editorRef}
        className={`phase-summary${empty ? ' is-empty' : ''}`}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="開發摘要"
        data-placeholder="這個階段做到哪、接下來要什麼"
        onInput={() => commitNote()}
        onBlur={onSave}
        onPaste={(event) => {
          event.preventDefault()
          const text = event.clipboardData.getData('text/plain')
          document.execCommand('insertText', false, text)
          commitNote()
        }}
      />
    </div>
  )
}

function BoldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 5h6.2c2.4 0 4.2 1.5 4.2 3.6 0 1.4-.8 2.6-2.1 3.1 1.7.4 2.9 1.8 2.9 3.6 0 2.4-2 4.2-4.6 4.2H7V5Zm3.1 2.5v3.3h2.8c1.1 0 1.8-.6 1.8-1.6s-.7-1.7-1.9-1.7H10.1Zm0 5.6v3.8h3.3c1.3 0 2.1-.7 2.1-1.9s-.8-1.9-2.2-1.9H10.1Z"
      />
    </svg>
  )
}

function ListBulletIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="7" r="1.6" fill="currentColor" />
      <circle cx="5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="5" cy="17" r="1.6" fill="currentColor" />
      <path fill="currentColor" d="M9 6h11v2H9V6Zm0 5h11v2H9v-2Zm0 5h11v2H9v-2Z" />
    </svg>
  )
}

function ListNumberIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M5.2 4.2h1.6v4.2H5.4V5.6H4.4V4.5l.8-.3ZM4.3 10.2h3v1.1l-1.8 2.1h1.8v1.2h-3v-1.1l1.8-2.1H4.3v-1.2Zm.2 6.2h1.1v.8h-1v1.1h1v.8h-1v1.2h2.7v-1.1h-1V18h1v-1.1h-1v-.8h1v-1.1H4.5v1.4ZM9 6h11v2H9V6Zm0 5h11v2H9v-2Zm0 5h11v2H9v-2Z"
      />
    </svg>
  )
}
