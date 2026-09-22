import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { OrbFx, WarpFilters } from './WarpFilters'
import { api } from '../lib/api'
import { logoSrc } from '../lib/logos'

const PORTAL_SPARKS = Array.from({ length: 36 }, (_, i) => ({
  i,
  a: `${(i * 360) / 36}deg`,
}))
const GATE_EMBERS = Array.from({ length: 28 }, (_, i) => ({
  i,
  a: `${(i * 360) / 28 + (i % 5) * 4}deg`,
  delay: `${(i % 9) * 0.14}s`,
  dur: `${1.05 + (i % 6) * 0.16}s`,
  size: 2 + (i % 3),
  fly: 16 + (i % 5) * 7,
}))
const WARP_MS = 560
const ARRIVE_MS = 1250
const HOLD_MS = 500
const HOLD_SHOW_MS = 100
const HOLD_SLOP = 12
const RETURN_MS = 480
const SUCK_MS = 550
const DUST_MS = 1100
const ORBIT_MS = 920
const CAT_R_FOCUS = 292
const FOCUS_ITEM = 172
const FOCUS_HUB = 240
const GATE_SIZE = 168
const HUB_GROUP = ''

export type StarLinkItem = {
  id: string
  name: string
  target: string
  group: string
  mark?: string
  hint?: string
}

type DragState = {
  id: string
  x: number
  y: number
  originX: number
  originY: number
  over: string | null
  phase: 'drag' | 'return' | 'suck'
}

type ChainNode = {
  id: string
  kind: 'hub' | 'cat' | 'item'
  x: number
  y: number
  label: string
  sub?: string
  logo: string
  item?: StarLinkItem
}

type ChainLink = {
  id: string
  from: string
  to: string
  x1: number
  y1: number
  x2: number
  y2: number
}

type LayoutBox = { w: number; h: number }

type Polar = { a: number; r: number }

type Orbit = {
  dir: 'in' | 'out'
  catId: string
  t: number
  hubFrom: { x: number; y: number }
  hubTo: { x: number; y: number }
  catFrom: Polar
  catTo: Polar
  items: Record<string, { relFrom: number; relTo: number; rFrom: number; rTo: number }>
}

export type StarChainProps = {
  hubLabel: string
  hubSub: string
  ariaLabel: string
  fallbackGroups: readonly string[]
  alwaysGroups?: readonly string[]
  defaultGroup: string
  modalTitle: string
  submitLabel: string
  groupPlaceholder: string
  plainCats?: boolean
  focusable?: boolean
  load: () => Promise<StarLinkItem[]>
  add: (body: { name: string; target: string; group: string }) => Promise<StarLinkItem>
  patch: (id: string, body: { group: string }) => Promise<unknown>
  remove: (id: string) => Promise<unknown>
  open: (item: StarLinkItem) => void
}

function clamp(value: number, min = 8, max = 92) {
  return Math.min(max, Math.max(min, value))
}

function hubCorner(box: LayoutBox) {
  const rad = 128
  return {
    x: (rad / Math.max(box.w, 1)) * 100 + 3.2,
    y: 100 - (rad / Math.max(box.h, 1)) * 100 - 4.5,
  }
}

function pageBox(): LayoutBox {
  return { w: window.innerWidth, h: window.innerHeight }
}

function squareFieldBox(): LayoutBox {
  const edge = Math.min(1120, Math.min(window.innerWidth, window.innerHeight))
  return { w: edge, h: edge }
}

function atPolar(hub: { x: number; y: number }, angle: number, px: number, box: LayoutBox) {
  return {
    x: clamp(hub.x + Math.cos(angle) * (px / Math.max(box.w, 1)) * 100),
    y: clamp(hub.y + Math.sin(angle) * (px / Math.max(box.h, 1)) * 100, 8, 93),
  }
}

function distPx(a: { x: number; y: number }, b: { x: number; y: number }, box: LayoutBox) {
  return Math.hypot(((a.x - b.x) / 100) * box.w, ((a.y - b.y) / 100) * box.h)
}

function rayHit(origin: { x: number; y: number }, angle: number, box: LayoutBox, padPx: number) {
  const ox = (origin.x / 100) * box.w
  const oy = (origin.y / 100) * box.h
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  let reach = Infinity
  if (dx > 1e-6) reach = Math.min(reach, (box.w - padPx - ox) / dx)
  else if (dx < -1e-6) reach = Math.min(reach, (padPx - ox) / dx)
  if (dy > 1e-6) reach = Math.min(reach, (box.h - padPx - oy) / dy)
  else if (dy < -1e-6) reach = Math.min(reach, (padPx - oy) / dy)
  return Number.isFinite(reach) ? Math.max(0, reach) : 0
}

function fanAngles(count: number, start: number, end: number) {
  if (count <= 0) return []
  if (count === 1) return [(start + end) / 2]
  return Array.from({ length: count }, (_, index) => start + (index / (count - 1)) * (end - start))
}

function minArcRadius(count: number, sweep: number) {
  const gap = FOCUS_ITEM + 48
  if (count <= 1) return gap
  const chord = 2 * Math.sin(sweep / (2 * Math.max(count - 1, 1)))
  return chord < 0.12 ? gap * 3 : gap / chord
}

function nudgeFocusItem(
  point: { x: number; y: number },
  box: LayoutBox,
  hub: { x: number; y: number },
  cat: { x: number; y: number },
) {
  let next = { ...point }
  for (const [obst, min] of [
    [hub, FOCUS_HUB / 2 + FOCUS_ITEM / 2 + 36],
    [cat, FOCUS_ITEM + 28],
  ] as const) {
    const span = distPx(next, obst, box)
    if (span >= min || span < 0.5) continue
    const dx = ((next.x - obst.x) / 100) * box.w
    const dy = ((next.y - obst.y) / 100) * box.h
    const scale = min / span
    next = {
      x: clamp(obst.x + ((dx * scale) / box.w) * 100),
      y: clamp(obst.y + ((dy * scale) / box.h) * 100, 8, 88),
    }
  }
  return next
}

function focusItemPoints(count: number, box: LayoutBox, hub: { x: number; y: number }, cat: { x: number; y: number }) {
  if (count <= 0) return []
  const sweep = Math.PI / 2
  const a0 = -Math.PI / 2
  const a1 = 0
  const mid = (a0 + a1) / 2
  const beyondCat = CAT_R_FOCUS + FOCUS_ITEM + 36
  const edge = FOCUS_ITEM / 2 + 28
  const maxR = Math.max(
    beyondCat,
    Math.min(
      rayHit(hub, a0, box, edge),
      rayHit(hub, mid, box, edge),
      rayHit(hub, a1, box, GATE_SIZE + FOCUS_ITEM / 2 + 16),
    ) * 0.92,
  )
  const rows = count > 4 ? 2 : 1
  const innerN = rows === 1 ? count : Math.ceil(count / 2)
  const outerN = count - innerN
  const rInner = Math.min(
    maxR,
    Math.max(beyondCat, minArcRadius(innerN, sweep), rows === 1 ? beyondCat + (maxR - beyondCat) * 0.22 : beyondCat),
  )
  const rOuter = Math.min(maxR, Math.max(rInner + FOCUS_ITEM + 52, minArcRadius(Math.max(outerN, 1), sweep)))

  const place = (total: number, radius: number) =>
    fanAngles(total, a0, a1).map((angle) => nudgeFocusItem(atPolar(hub, angle, radius, box), box, hub, cat))

  if (rows === 1) return place(count, rInner)
  return [...place(innerN, rInner), ...place(outerN, rOuter)]
}

function polarOf(hub: { x: number; y: number }, point: { x: number; y: number }, box: LayoutBox): Polar {
  const dx = ((point.x - hub.x) / 100) * box.w
  const dy = ((point.y - hub.y) / 100) * box.h
  return { a: Math.atan2(dy, dx), r: Math.hypot(dx, dy) }
}

function relAngle(value: number) {
  let angle = value
  while (angle > Math.PI) angle -= Math.PI * 2
  while (angle < -Math.PI) angle += Math.PI * 2
  return angle
}

function easeOrbit(t: number) {
  return 1 - (1 - t) ** 3
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t
}

function relink(nodes: ChainNode[], links: ChainLink[]) {
  const pos = new Map(nodes.map((node) => [node.id, node]))
  return links.map((link) => {
    const from = pos.get(link.from)
    const to = pos.get(link.to)
    if (!from || !to) return link
    return { ...link, x1: from.x, y1: from.y, x2: to.x, y2: to.y }
  })
}

function layoutChain(groups: [string, StarLinkItem[]][], hubLabel: string, hubSub: string) {
  const hub = { x: 50, y: 50 }
  const nodes: ChainNode[] = [
    { id: 'hub', kind: 'hub', x: hub.x, y: hub.y, label: hubLabel, sub: hubSub, logo: logoSrc(hubLabel) },
  ]
  const links: ChainLink[] = []
  const catGroups = groups.filter(([label]) => label !== HUB_GROUP)
  const hubItems = groups.find(([label]) => label === HUB_GROUP)?.[1] ?? []
  const count = Math.max(catGroups.length, 1)
  const slot = (Math.PI * 2) / count

  catGroups.forEach(([label, list], index) => {
    const angle = -Math.PI / 2 + index * slot
    const catId = `cat-${label}`
    const catPos = { x: 50 + Math.cos(angle) * 16, y: 50 + Math.sin(angle) * 16 }
    const cat: ChainNode = {
      id: catId,
      kind: 'cat',
      x: catPos.x,
      y: catPos.y,
      label,
      logo: logoSrc(label),
    }
    nodes.push(cat)
    links.push({ id: `hub-${catId}`, from: 'hub', to: catId, x1: hub.x, y1: hub.y, x2: cat.x, y2: cat.y })

    const total = list.length
    const fan = Math.min(slot * 0.5, 0.28 * Math.max(total, 1))
    list.forEach((item, itemIndex) => {
      const offset = total === 1 ? 0 : (itemIndex / (total - 1) - 0.5) * fan
      const ray = angle + offset
      const nodePos = {
        x: 50 + Math.cos(ray) * (38 + (itemIndex % 2 ? 11 : 0)),
        y: 50 + Math.sin(ray) * (38 + (itemIndex % 2 ? 11 : 0)),
      }
      const node: ChainNode = {
        id: item.id,
        kind: 'item',
        x: nodePos.x,
        y: nodePos.y,
        label: item.name,
        sub: item.hint || item.target,
        logo: logoSrc(item.name, item.target),
        item,
      }
      nodes.push(node)
      links.push({ id: `${catId}-${item.id}`, from: catId, to: item.id, x1: cat.x, y1: cat.y, x2: node.x, y2: node.y })
    })
  })

  if (hubItems.length) {
    const ring = catGroups.length ? 28 : 32
    const step = (Math.PI * 2) / hubItems.length
    hubItems.forEach((item, itemIndex) => {
      const angle = -Math.PI / 2 + itemIndex * step + (catGroups.length ? step / 2 : 0)
      const node: ChainNode = {
        id: item.id,
        kind: 'item',
        x: 50 + Math.cos(angle) * ring,
        y: 50 + Math.sin(angle) * ring,
        label: item.name,
        sub: item.hint || item.target,
        logo: logoSrc(item.name, item.target),
        item,
      }
      nodes.push(node)
      links.push({ id: `hub-${item.id}`, from: 'hub', to: item.id, x1: hub.x, y1: hub.y, x2: node.x, y2: node.y })
    })
  }

  return { nodes, links }
}

function layoutCatEdit(labels: string[], hubLabel: string, hubSub: string, box: LayoutBox) {
  const hub = { x: 50, y: 50 }
  const nodes: ChainNode[] = [
    { id: 'hub', kind: 'hub', x: hub.x, y: hub.y, label: hubLabel, sub: hubSub, logo: logoSrc(hubLabel) },
  ]
  const links: ChainLink[] = []
  const count = Math.max(labels.length, 1)
  const slot = (Math.PI * 2) / count
  labels.forEach((label, index) => {
    const angle = -Math.PI / 2 + index * slot
    const catId = `cat-${label}`
    const catPos = atPolar(hub, angle, CAT_R_FOCUS, box)
    nodes.push({
      id: catId,
      kind: 'cat',
      x: catPos.x,
      y: catPos.y,
      label,
      logo: logoSrc(label),
    })
    links.push({ id: `hub-${catId}`, from: 'hub', to: catId, x1: hub.x, y1: hub.y, x2: catPos.x, y2: catPos.y })
  })
  return { nodes, links }
}

function layoutFocus(
  entry: [string, StarLinkItem[]] | undefined,
  hubLabel: string,
  hubSub: string,
  box: LayoutBox,
) {
  const [label, list] = entry ?? ['', [] as StarLinkItem[]]
  const hub = hubCorner(box)
  const catAngle = -Math.PI / 4
  const catPos = atPolar(hub, catAngle, CAT_R_FOCUS, box)
  const nodes: ChainNode[] = [
    { id: 'hub', kind: 'hub', x: hub.x, y: hub.y, label: hubLabel, sub: hubSub, logo: logoSrc(hubLabel) },
  ]
  const links: ChainLink[] = []
  const catId = `cat-${label}`
  const cat: ChainNode = {
    id: catId,
    kind: 'cat',
    x: catPos.x,
    y: catPos.y,
    label,
    logo: logoSrc(label),
  }
  nodes.push(cat)
  links.push({ id: `hub-${catId}`, from: 'hub', to: catId, x1: hub.x, y1: hub.y, x2: cat.x, y2: cat.y })

  const spots = focusItemPoints(list.length, box, hub, cat)
  list.forEach((item, itemIndex) => {
    const nodePos = spots[itemIndex] ?? { x: 50, y: 36 }
    const node: ChainNode = {
      id: item.id,
      kind: 'item',
      x: nodePos.x,
      y: nodePos.y,
      label: item.name,
      sub: item.hint || item.target,
      logo: logoSrc(item.name, item.target),
      item,
    }
    nodes.push(node)
    links.push({ id: `${catId}-${item.id}`, from: catId, to: item.id, x1: cat.x, y1: cat.y, x2: node.x, y2: node.y })
  })

  return { nodes, links }
}

function applyOrbit(chain: { nodes: ChainNode[]; links: ChainLink[] }, orbit: Orbit, box: LayoutBox) {
  const t = easeOrbit(orbit.t)
  const hub = {
    x: lerp(orbit.hubFrom.x, orbit.hubTo.x, t),
    y: lerp(orbit.hubFrom.y, orbit.hubTo.y, t),
  }
  const angle = lerp(orbit.catFrom.a, orbit.catTo.a, t)
  const cat = atPolar(hub, angle, lerp(orbit.catFrom.r, orbit.catTo.r, t), box)
  const pos = new Map<string, { x: number; y: number }>([
    ['hub', hub],
    [orbit.catId, cat],
  ])
  for (const [id, item] of Object.entries(orbit.items)) {
    pos.set(id, atPolar(hub, angle + lerp(item.relFrom, item.relTo, t), lerp(item.rFrom, item.rTo, t), box))
  }
  const nodes = chain.nodes.map((node) => {
    const next = pos.get(node.id)
    return next ? { ...node, x: next.x, y: next.y } : node
  })
  return { nodes, links: relink(nodes, chain.links) }
}

function curve(link: ChainLink) {
  const mx = (link.x1 + link.x2) / 2
  const my = (link.y1 + link.y2) / 2
  const dx = link.x2 - link.x1
  const dy = link.y2 - link.y1
  return `M ${link.x1} ${link.y1} Q ${mx - dy * 0.08} ${my + dx * 0.08} ${link.x2} ${link.y2}`
}

function burstLink(link: ChainLink) {
  const mx = (link.x1 + link.x2) / 2
  const my = (link.y1 + link.y2) / 2
  const dx = link.x2 - link.x1
  const dy = link.y2 - link.y1
  const len = Math.hypot(dx, dy) || 1
  const cx = mx - dy * 0.08
  const cy = my + dx * 0.08
  const nx = -dy / len
  const ny = dx / len
  const alongCount = Math.max(48, Math.min(88, Math.round(len * 2.2)))
  const offsets = [-1.35, -0.55, 0, 0.55, 1.35]
  const sparks: { i: number; x: number; y: number; dx: string; dy: string; size: number }[] = []
  let i = 0
  for (let s = 0; s < alongCount; s++) {
    const t = s / (alongCount - 1)
    const u = 1 - t
    const px = u * u * link.x1 + 2 * u * t * cx + t * t * link.x2
    const py = u * u * link.y1 + 2 * u * t * cy + t * t * link.y2
    for (const offset of offsets) {
      const ang = (i / 11) * Math.PI + s * 0.37
      const dist = 22 + (i % 6) * 14
      sparks.push({
        i,
        x: px + nx * offset,
        y: py + ny * offset,
        dx: `${Math.cos(ang) * dist}px`,
        dy: `${Math.sin(ang) * dist}px`,
        size: 2 + (i % 4),
      })
      i += 1
    }
  }
  return sparks
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

function pointInBox(box: DOMRect, x: number, y: number, pad = 0) {
  return x >= box.left - pad && x <= box.right + pad && y >= box.top - pad && y <= box.bottom + pad
}

function fieldPoint(field: DOMRect, x: number, y: number) {
  return {
    x: ((x - field.left) / field.width) * 100,
    y: ((y - field.top) / field.height) * 100,
  }
}

function animatePoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  ms: number,
  onFrame: (point: { x: number; y: number }) => void,
  ease = (t: number) => 1 - (1 - t) ** 3,
) {
  if (ms <= 0) {
    onFrame(to)
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    const t0 = performance.now()
    function frame(now: number) {
      const t = Math.min(1, (now - t0) / ms)
      onFrame({
        x: from.x + (to.x - from.x) * ease(t),
        y: from.y + (to.y - from.y) * ease(t),
      })
      if (t < 1) requestAnimationFrame(frame)
      else resolve()
    }
    requestAnimationFrame(frame)
  })
}

function nameFromTarget(value: string) {
  const text = value.trim()
  if (!text || /^[a-zA-Z]:[\\/]/.test(text) || text.startsWith('\\\\') || text.startsWith('/')) return ''
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`)
    if (!/^https?:$/.test(url.protocol)) return ''
    const host = url.hostname.replace(/^www\./i, '')
    const parts = host.split('.').filter(Boolean)
    if (!parts.length) return ''
    const label =
      parts.length === 1
        ? parts[0]
        : parts.length > 2 && parts[parts.length - 1].length <= 2 && parts[parts.length - 2].length <= 3
          ? parts[parts.length - 3]
          : parts[parts.length - 2]
    return label.charAt(0).toUpperCase() + label.slice(1)
  } catch {
    return ''
  }
}

function SparkRing() {
  return (
    <span className="spark-portal">
      <span className="spark-orbit" aria-hidden>
        {PORTAL_SPARKS.map((spark) => (
          <i key={spark.i} style={{ '--a': spark.a } as CSSProperties} />
        ))}
      </span>
      <i className="spark-void" aria-hidden />
    </span>
  )
}

export function StarChain({
  hubLabel,
  hubSub,
  ariaLabel,
  fallbackGroups,
  alwaysGroups = [],
  defaultGroup,
  modalTitle,
  submitLabel,
  groupPlaceholder,
  plainCats = false,
  focusable = false,
  load,
  add,
  patch,
  remove,
  open,
}: StarChainProps) {
  const [items, setItems] = useState<StarLinkItem[]>([])
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [group, setGroup] = useState(defaultGroup)
  const [namedByUser, setNamedByUser] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [pick, setPick] = useState(false)
  const [from, setFrom] = useState({ x: '0px', y: '0px' })
  const [hot, setHot] = useState<string | null>(null)
  const [arriving, setArriving] = useState<string | null>(null)
  const [holding, setHolding] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [dust, setDust] = useState<{ linkId: string; sparks: ReturnType<typeof burstLink> } | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [editingCats, setEditingCats] = useState(false)
  const [extraCats, setExtraCats] = useState<string[]>([])
  const [hiddenCats, setHiddenCats] = useState<string[]>([])
  const [catDraft, setCatDraft] = useState('')
  const [orbit, setOrbit] = useState<Orbit | null>(null)
  const [fieldBox, setFieldBox] = useState<LayoutBox>(() => (typeof window === 'undefined' ? { w: 1120, h: 1120 } : squareFieldBox()))
  const gateRef = useRef<HTMLButtonElement>(null)
  const fieldRef = useRef<HTMLDivElement>(null)
  const comboRef = useRef<HTMLDivElement>(null)
  const arriveTimer = useRef(0)
  const holdTimer = useRef(0)
  const holdShowTimer = useRef(0)
  const dustTimer = useRef(0)
  const orbitRaf = useRef(0)
  const orbitRun = useRef(0)
  const dragRef = useRef<DragState | null>(null)
  const itemsRef = useRef<StarLinkItem[]>([])
  const chainRef = useRef({ nodes: [] as ChainNode[], links: [] as ChainLink[] })
  const clickBlock = useRef<((event: MouseEvent) => void) | null>(null)
  const skipClick = useRef(false)
  const skipClickTimer = useRef(0)
  const busy = useRef(false)
  const orbitOutRef = useRef<(id: string) => void>(() => {})
  const extraCatsRef = useRef<string[]>([])
  const hiddenCatsRef = useRef<string[]>([])
  const catsRef = useRef<string[]>([])

  async function reload() {
    setItems(await load())
  }

  useEffect(() => {
    if (!modalOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (pick) {
        setPick(false)
        return
      }
      if (!exiting) setModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalOpen, pick, exiting])

  useEffect(() => {
    if (!pick) return
    function onDoc(event: MouseEvent) {
      if (!comboRef.current?.contains(event.target as Node)) setPick(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [pick])

  useEffect(() => {
    if (modalOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (editingCats) {
        setEditingCats(false)
        return
      }
      if (focusId) orbitOutRef.current(focusId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusId, modalOpen, editingCats])

  useEffect(() => {
    const field = fieldRef.current
    if (!field) return
    const read = () => {
      const width = field.clientWidth
      const height = field.clientHeight
      if (width && height) setFieldBox({ w: width, h: height })
    }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(field)
    return () => observer.disconnect()
  }, [])

  const hiddenCatSet = useMemo(() => new Set(hiddenCats), [hiddenCats])
  const namedCatLabels = useMemo(() => {
    const order: string[] = []
    for (const label of alwaysGroups) {
      if (label && !hiddenCatSet.has(label)) order.push(label)
    }
    for (const label of extraCats) {
      if (label && !hiddenCatSet.has(label) && !order.includes(label)) order.push(label)
    }
    for (const item of items) {
      const label = item.group.trim()
      if (label && !hiddenCatSet.has(label) && !order.includes(label)) order.push(label)
    }
    return order
  }, [alwaysGroups, extraCats, hiddenCatSet, items])
  const groups = useMemo(() => {
    const map = new Map<string, StarLinkItem[]>()
    for (const label of namedCatLabels) map.set(label, [])
    const hubItems: StarLinkItem[] = []
    for (const item of items) {
      const label = item.group.trim()
      if (!label || hiddenCatSet.has(label) || !map.has(label)) {
        hubItems.push(item)
        continue
      }
      map.get(label)!.push(item)
    }
    const entries = [...map.entries()] as [string, StarLinkItem[]][]
    if (hubItems.length) entries.push([HUB_GROUP, hubItems])
    return entries
  }, [items, namedCatLabels, hiddenCatSet])

  extraCatsRef.current = extraCats
  hiddenCatsRef.current = hiddenCats
  catsRef.current = namedCatLabels

  const fullChain = useMemo(() => layoutChain(groups, hubLabel, hubSub), [groups, hubLabel, hubSub])
  const focusChain = useMemo(() => {
    if (!focusId || editingCats) return null
    const label = focusId.slice(4)
    return layoutFocus(
      groups.find(([name]) => name === label),
      hubLabel,
      hubSub,
      fieldBox,
    )
  }, [focusId, editingCats, groups, hubLabel, hubSub, fieldBox])
  const catEditChain = useMemo(() => {
    if (!editingCats) return null
    return layoutCatEdit(namedCatLabels, hubLabel, hubSub, fieldBox)
  }, [editingCats, namedCatLabels, hubLabel, hubSub, fieldBox])
  const revealOthers = Boolean(orbit && orbit.dir === 'out' && orbit.t > 0.58)
  const hiddenNodes = useMemo(() => {
    const ids = new Set<string>()
    if (editingCats) {
      for (const node of fullChain.nodes) {
        if (node.kind === 'item') ids.add(node.id)
      }
      return ids
    }
    if (!focusId || revealOthers) return ids
    const keep = new Set(focusChain?.nodes.map((node) => node.id) ?? ['hub', focusId])
    for (const node of fullChain.nodes) {
      if (!keep.has(node.id)) ids.add(node.id)
    }
    return ids
  }, [fullChain, focusChain, focusId, revealOthers, editingCats])
  const hiddenLinks = useMemo(() => {
    const ids = new Set<string>()
    if (editingCats) {
      for (const link of fullChain.links) {
        if (!(link.from === 'hub' && link.to.startsWith('cat-'))) ids.add(link.id)
      }
      return ids
    }
    if (!focusId || revealOthers) return ids
    const keep = new Set(focusChain?.links.map((link) => link.id) ?? [])
    keep.add(`hub-${focusId}`)
    for (const link of fullChain.links) {
      if (link.from === focusId) keep.add(link.id)
    }
    for (const link of fullChain.links) {
      if (!keep.has(link.id)) ids.add(link.id)
    }
    return ids
  }, [fullChain, focusChain, focusId, revealOthers, editingCats])
  const chain = useMemo(() => {
    const overlay = catEditChain ?? focusChain
    if (!overlay) return fullChain
    const next = new Map(overlay.nodes.map((node) => [node.id, node]))
    const nextLinks = new Map(overlay.links.map((link) => [link.id, link]))
    return {
      nodes: [
        ...fullChain.nodes.map((node) => next.get(node.id) ?? node),
        ...overlay.nodes.filter((node) => !fullChain.nodes.some((item) => item.id === node.id)),
      ],
      links: [
        ...fullChain.links.map((link) => nextLinks.get(link.id) ?? link),
        ...overlay.links.filter((link) => !fullChain.links.some((item) => item.id === link.id)),
      ],
    }
  }, [fullChain, focusChain, catEditChain])
  itemsRef.current = items
  chainRef.current = chain
  const shown = useMemo(() => {
    const moving = drag
      ? chain.nodes.map((node) => (node.id === drag.id ? { ...node, x: drag.x, y: drag.y } : node))
      : chain.nodes
    const base = {
      nodes: moving,
      links: chain.links.filter((link) => link.id !== dust?.linkId),
    }
    const next = orbit ? applyOrbit(base, orbit, fieldBox) : { ...base, links: relink(base.nodes, base.links) }
    return next
  }, [chain, drag, dust, orbit, fieldBox])
  const groupNames = useMemo(
    () => [...new Set([...namedCatLabels, ...fallbackGroups.filter((label) => !hiddenCatSet.has(label))])],
    [namedCatLabels, fallbackGroups, hiddenCatSet],
  )
  const lit = useMemo(() => {
    const focus = drag?.over?.startsWith('cat-') ? drag.over : hot
    const ids = new Set<string>()
    if (drag) {
      const cord = chain.links.find((link) => link.to === drag.id)
      if (cord) ids.add(cord.id)
    }
    if (!focus) return ids
    const node = chain.nodes.find((item) => item.id === focus)
    if (!node || node.kind === 'hub') {
      for (const link of chain.links) {
        if (!hiddenLinks.has(link.id)) ids.add(link.id)
      }
      return ids
    }
    if (node.kind === 'cat') {
      for (const link of chain.links) {
        if (link.from === focus || link.to === focus) ids.add(link.id)
      }
      return ids
    }
    const toCat = chain.links.find((link) => link.to === focus)
    if (toCat) {
      ids.add(toCat.id)
      const toHub = chain.links.find((link) => link.to === toCat.from && link.from === 'hub')
      if (toHub) ids.add(toHub.id)
    }
    return ids
  }, [hot, chain, drag, hiddenLinks])

  useEffect(() => {
    void reload()
    void api
      .starCats(hubLabel)
      .then((book) => {
        setExtraCats(book.extra || [])
        setHiddenCats(book.hidden || [])
      })
      .catch(() => undefined)
    return () => {
      window.clearTimeout(arriveTimer.current)
      window.clearTimeout(holdTimer.current)
      window.clearTimeout(holdShowTimer.current)
      window.clearTimeout(dustTimer.current)
      window.clearTimeout(skipClickTimer.current)
      window.cancelAnimationFrame(orbitRaf.current)
      if (clickBlock.current) document.removeEventListener('click', clickBlock.current, true)
    }
  }, [])

  function startOrbit(dir: 'in' | 'out', catId: string) {
    if (!focusable || busy.current || dragRef.current || editingCats) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setOrbit(null)
      setFocusId(dir === 'in' ? catId : null)
      return
    }
    const fromChain = dir === 'in' ? fullChain : (focusChain ?? fullChain)
    const destBox = dir === 'in' ? pageBox() : squareFieldBox()
    const toChain = dir === 'in' ? layoutFocus(groups.find(([name]) => name === catId.slice(4)), hubLabel, hubSub, destBox) : fullChain
    const hubFrom = fromChain.nodes.find((node) => node.id === 'hub')
    const hubTo = toChain.nodes.find((node) => node.id === 'hub')
    const catFromNode = fromChain.nodes.find((node) => node.id === catId)
    const catToNode = toChain.nodes.find((node) => node.id === catId)
    if (!hubFrom || !hubTo || !catFromNode || !catToNode) return

    const fromBox = fieldBox
    const catFrom = polarOf(hubFrom, catFromNode, fromBox)
    const catToRaw = polarOf(hubTo, catToNode, destBox)
    const catTo = { ...catToRaw }
    if (dir === 'in') {
      while (catTo.a < catFrom.a) catTo.a += Math.PI * 2
    } else {
      while (catTo.a > catFrom.a) catTo.a -= Math.PI * 2
    }

    const extras: Orbit['items'] = {}
    for (const node of toChain.nodes) {
      if (node.kind !== 'item') continue
      const fromNode = fromChain.nodes.find((item) => item.id === node.id) ?? node
      const fromPol = polarOf(hubFrom, fromNode, fromBox)
      const toPol = polarOf(hubTo, node, destBox)
      extras[node.id] = {
        relFrom: relAngle(fromPol.a - catFrom.a),
        relTo: relAngle(toPol.a - catToRaw.a),
        rFrom: fromPol.r,
        rTo: toPol.r,
      }
    }

    const next: Orbit = {
      dir,
      catId,
      t: 0,
      hubFrom: { x: hubFrom.x, y: hubFrom.y },
      hubTo: { x: hubTo.x, y: hubTo.y },
      catFrom,
      catTo,
      items: extras,
    }
    if (dir === 'in') setFocusId(catId)
    setOrbit(next)
    busy.current = true
    orbitRun.current += 1
    const run = orbitRun.current
    window.cancelAnimationFrame(orbitRaf.current)
    const t0 = performance.now()
    function frame(now: number) {
      if (run !== orbitRun.current) return
      const t = Math.min(1, (now - t0) / ORBIT_MS)
      setOrbit((current) => (current && current.catId === catId && current.dir === dir ? { ...current, t } : current))
      if (t < 1) {
        orbitRaf.current = window.requestAnimationFrame(frame)
        return
      }
      setOrbit(null)
      if (dir === 'out') setFocusId(null)
      busy.current = false
    }
    orbitRaf.current = window.requestAnimationFrame(frame)
  }

  function toggleFocus(node: ChainNode) {
    if (editingCats) {
      if (node.kind === 'hub') setEditingCats(false)
      return
    }
    if (!focusable || dragRef.current || skipClick.current || busy.current || modalOpen) return
    if (node.kind === 'hub') {
      if (focusId) startOrbit('out', focusId)
      return
    }
    if (node.kind !== 'cat') return
    if (focusId === node.id) startOrbit('out', node.id)
    else if (!focusId) startOrbit('in', node.id)
  }

  orbitOutRef.current = (id) => startOrbit('out', id)

  function clearSkipClick() {
    skipClick.current = false
    window.clearTimeout(skipClickTimer.current)
    if (clickBlock.current) {
      document.removeEventListener('click', clickBlock.current, true)
      clickBlock.current = null
    }
  }

  function armClickBlock() {
    skipClick.current = true
    window.clearTimeout(skipClickTimer.current)
    if (clickBlock.current) document.removeEventListener('click', clickBlock.current, true)
    const block = (event: MouseEvent) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      event.stopPropagation()
      clearSkipClick()
    }
    clickBlock.current = block
    document.addEventListener('click', block, true)
    skipClickTimer.current = window.setTimeout(clearSkipClick, 400)
  }

  function hitDrop(x: number, y: number, dragId: string, allowCats = true) {
    const gate = gateRef.current?.getBoundingClientRect()
    if (gate && pointInBox(gate, x, y, 10)) return 'gate'
    if (!allowCats) return null
    const nodes = fieldRef.current?.querySelectorAll<HTMLElement>('[data-kind="cat"]')
    if (!nodes) return null
    for (const node of nodes) {
      if (node.dataset.node === dragId) continue
      if (pointInBox(node.getBoundingClientRect(), x, y, 18)) return node.dataset.node || null
    }
    return null
  }

  function writeDrag(next: DragState | null) {
    dragRef.current = next
    setDrag(next)
  }

  function persistCats(extra: string[], hidden: string[]) {
    extraCatsRef.current = extra
    hiddenCatsRef.current = hidden
    setExtraCats(extra)
    setHiddenCats(hidden)
    void api.saveStarCats(hubLabel, { extra, hidden }).catch(() => undefined)
  }

  async function deleteCat(label: string) {
    const current = catsRef.current
    const index = current.indexOf(label)
    const remain = current.filter((name) => name !== label)
    const home = remain[Math.min(Math.max(index, 0), Math.max(remain.length - 1, 0))] ?? HUB_GROUP
    const moved = itemsRef.current.filter((item) => item.group === label)
    if (moved.length) {
      setItems((list) => list.map((item) => (item.group === label ? { ...item, group: home } : item)))
      await Promise.all(moved.map((item) => patch(item.id, { group: home }).catch(() => undefined)))
    }
    persistCats(
      extraCatsRef.current.filter((name) => name !== label),
      alwaysGroups.includes(label)
        ? [...new Set([...hiddenCatsRef.current, label])]
        : hiddenCatsRef.current.filter((name) => name !== label),
    )
  }

  function addCat(label: string) {
    const extra = extraCatsRef.current.includes(label) || alwaysGroups.includes(label)
      ? extraCatsRef.current
      : [...extraCatsRef.current, label]
    persistCats(
      extra,
      hiddenCatsRef.current.filter((name) => name !== label),
    )
  }

  async function finishDrag(x: number, y: number) {
    const live = dragRef.current
    if (!live || live.phase !== 'drag' || busy.current) {
      setHolding(null)
      return
    }
    busy.current = true
    const isCat = live.id.startsWith('cat-')
    const over = hitDrop(x, y, live.id, !isCat)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (over === 'gate') {
      const field = fieldRef.current?.getBoundingClientRect()
      const gate = gateRef.current?.getBoundingClientRect()
      const dest =
        field && gate
          ? fieldPoint(field, gate.left + gate.width / 2, gate.top + gate.height / 2)
          : { x: live.x, y: live.y }
      const cord = chainRef.current.links.find((link) => link.to === live.id)
      if (cord && !reduce) {
        const stretched = { ...cord, x2: live.x, y2: live.y }
        window.clearTimeout(dustTimer.current)
        setDust({ linkId: cord.id, sparks: burstLink(stretched) })
        dustTimer.current = window.setTimeout(() => setDust(null), DUST_MS)
      }
      writeDrag({ ...live, over: 'gate', phase: 'suck' })
      await animatePoint(
        { x: live.x, y: live.y },
        dest,
        reduce ? 0 : SUCK_MS,
        (point) => {
          const current = dragRef.current
          if (!current) return
          writeDrag({ ...current, ...point, over: 'gate', phase: 'suck' })
        },
        (t) => t * t,
      )
      if (isCat) await deleteCat(live.id.slice(4))
      else {
        await remove(live.id)
        setItems((list) => list.filter((item) => item.id !== live.id))
      }
      writeDrag(null)
      setHolding(null)
      busy.current = false
      return
    }

    if (!isCat && over?.startsWith('cat-')) {
      const label = over.slice(4)
      const item = itemsRef.current.find((entry) => entry.id === live.id)
      if (item && label && item.group !== label) {
        const next = { ...item, group: label }
        writeDrag(null)
        setHolding(null)
        setItems((list) => [...list.filter((entry) => entry.id !== live.id), next])
        setArriving(live.id)
        window.clearTimeout(arriveTimer.current)
        arriveTimer.current = window.setTimeout(() => setArriving(null), ARRIVE_MS)
        void patch(live.id, { group: label }).catch(() => undefined)
        busy.current = false
        return
      }
    }

    writeDrag({ ...live, over: null, phase: 'return' })
    await animatePoint(
      { x: live.x, y: live.y },
      { x: live.originX, y: live.originY },
      reduce ? 0 : RETURN_MS,
      (point) => {
        const current = dragRef.current
        if (!current) return
        writeDrag({ ...current, ...point, over: null, phase: 'return' })
      },
    )
    writeDrag(null)
    setHolding(null)
    busy.current = false
  }

  function onNodeDragPointerDown(event: ReactPointerEvent<HTMLElement>, node: ChainNode) {
    if (event.button !== 0 || modalOpen || dragRef.current || busy.current || arriving === node.id) return
    window.clearTimeout(holdTimer.current)
    window.clearTimeout(holdShowTimer.current)
    const startX = event.clientX
    const startY = event.clientY
    const pointerId = event.pointerId
    const target = event.currentTarget
    const allowCats = node.kind !== 'cat'
    let armed = false
    let captured = false

    holdShowTimer.current = window.setTimeout(() => {
      setHolding(node.id)
    }, HOLD_SHOW_MS)

    holdTimer.current = window.setTimeout(() => {
      armed = true
      window.clearTimeout(holdShowTimer.current)
      try {
        target.setPointerCapture(pointerId)
        captured = true
      } catch {
        captured = false
      }
      armClickBlock()
      setHolding(null)
      writeDrag({
        id: node.id,
        x: node.x,
        y: node.y,
        originX: node.x,
        originY: node.y,
        over: null,
        phase: 'drag',
      })
    }, HOLD_MS)

    function releaseCapture() {
      if (!captured) return
      try {
        if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
      } catch {
        /* already released */
      }
      captured = false
    }

    function onMove(move: PointerEvent) {
      if (move.pointerId !== pointerId) return
      if (!armed) {
        if (Math.hypot(move.clientX - startX, move.clientY - startY) > HOLD_SLOP) {
          window.clearTimeout(holdTimer.current)
          window.clearTimeout(holdShowTimer.current)
          setHolding((id) => (id === node.id ? null : id))
        }
        return
      }
      const field = fieldRef.current?.getBoundingClientRect()
      const current = dragRef.current
      if (!field || !current || current.phase !== 'drag') return
      const point = fieldPoint(field, move.clientX, move.clientY)
      writeDrag({ ...current, ...point, over: hitDrop(move.clientX, move.clientY, current.id, allowCats) })
    }

    function onUp(up: PointerEvent) {
      if (up.pointerId !== pointerId) return
      window.clearTimeout(holdTimer.current)
      window.clearTimeout(holdShowTimer.current)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      releaseCapture()
      if (!armed) {
        setHolding((id) => (id === node.id ? null : id))
        return
      }
      void finishDrag(up.clientX, up.clientY)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  function onHubPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || modalOpen || dragRef.current || busy.current || editingCats || focusId || orbit) return
    window.clearTimeout(holdTimer.current)
    window.clearTimeout(holdShowTimer.current)
    const startX = event.clientX
    const startY = event.clientY
    const pointerId = event.pointerId

    holdShowTimer.current = window.setTimeout(() => {
      setHolding('hub')
    }, HOLD_SHOW_MS)

    holdTimer.current = window.setTimeout(() => {
      window.clearTimeout(holdShowTimer.current)
      armClickBlock()
      setHolding(null)
      setEditingCats(true)
    }, HOLD_MS)

    function onMove(move: PointerEvent) {
      if (move.pointerId !== pointerId) return
      if (Math.hypot(move.clientX - startX, move.clientY - startY) > HOLD_SLOP) {
        window.clearTimeout(holdTimer.current)
        window.clearTimeout(holdShowTimer.current)
        setHolding((id) => (id === 'hub' ? null : id))
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
      }
    }

    function onUp(up: PointerEvent) {
      if (up.pointerId !== pointerId) return
      window.clearTimeout(holdTimer.current)
      window.clearTimeout(holdShowTimer.current)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      setHolding((id) => (id === 'hub' ? null : id))
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  function openGate() {
    if (dragRef.current || skipClick.current || busy.current) return
    const box = gateRef.current?.getBoundingClientRect()
    if (box) {
      setFrom({
        x: `${box.left + box.width / 2 - window.innerWidth / 2}px`,
        y: `${box.top + box.height / 2 - window.innerHeight / 2}px`,
      })
    }
    setExiting(false)
    setPick(false)
    if (editingCats) {
      setCatDraft('')
    } else {
      setNamedByUser(Boolean(name.trim()))
      if (group && !groupNames.includes(group) && groupNames[0]) setGroup(groupNames[0])
    }
    setModalOpen(true)
  }

  function onTarget(value: string) {
    setTarget(value)
    if (namedByUser) return
    const auto = nameFromTarget(value)
    if (auto) setName(auto)
  }

  async function submit() {
    if (exiting) return
    if (editingCats) {
      const label = catDraft.trim()
      if (!label) return
      setExiting(true)
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const exists = catsRef.current.includes(label)
      await wait(reduce ? 0 : WARP_MS)
      if (!exists) addCat(label)
      setModalOpen(false)
      setExiting(false)
      setCatDraft('')
      setArriving(`cat-${label}`)
      window.clearTimeout(arriveTimer.current)
      arriveTimer.current = window.setTimeout(() => setArriving(null), ARRIVE_MS)
      return
    }
    if (!name.trim() || !target.trim()) return
    setPick(false)
    setExiting(true)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    try {
      const created = await Promise.all([
        add({ name: name.trim(), target: target.trim(), group: group.trim() || groupNames[0] || '其他' }),
        wait(reduce ? 0 : WARP_MS),
      ]).then(([item]) => item)
      setModalOpen(false)
      setExiting(false)
      setName('')
      setTarget('')
      setNamedByUser(false)
      setItems((list) => [...list.filter((item) => item.id !== created.id), created])
      setArriving(created.id)
      window.clearTimeout(arriveTimer.current)
      arriveTimer.current = window.setTimeout(() => setArriving(null), ARRIVE_MS)
    } catch {
      setExiting(false)
    }
  }

  return (
    <div className="portal-page">
      <WarpFilters />
      <section
        className={`star-chain${drag ? ' is-shifting' : ''}${plainCats ? ' is-plain-cats' : ''}${focusable ? ' is-focusable' : ''}${focusId && orbit?.dir !== 'out' ? ' is-focused' : ''}${editingCats ? ' is-editing-cats' : ''}${orbit ? ` is-orbiting is-orbit-${orbit.dir}` : ''}`}
        aria-label={ariaLabel}
      >
        <div className="star-field" ref={fieldRef}>
          <svg className="star-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {shown.links.map((link) => (
              <path
                key={link.id}
                className={[lit.has(link.id) ? 'is-lit' : '', hiddenLinks.has(link.id) ? 'is-hidden' : '']
                  .filter(Boolean)
                  .join(' ') || undefined}
                d={curve(link)}
              />
            ))}
          </svg>
          {dust
            ? dust.sparks.map((spark) => (
                <i
                  key={spark.i}
                  className="line-dust"
                  style={
                    {
                      left: `${spark.x}%`,
                      top: `${spark.y}%`,
                      width: spark.size,
                      height: spark.size,
                      '--dx': spark.dx,
                      '--dy': spark.dy,
                    } as CSSProperties
                  }
                  aria-hidden
                />
              ))
            : null}
          {shown.nodes.map((node) => {
            const dragging = drag?.id === node.id
            const classes = [
              'star-node',
              `star-${node.kind}`,
              arriving === node.id ? 'is-arriving' : '',
              holding === node.id ? 'is-holding' : '',
              dragging && drag.phase === 'drag' ? 'is-dragging' : '',
              dragging && drag.phase === 'return' ? 'is-returning' : '',
              dragging && drag.phase === 'suck' ? 'is-sucking' : '',
              node.kind === 'cat' && drag?.over === node.id ? 'is-drop' : '',
              hiddenNodes.has(node.id) ? 'is-hidden' : '',
            ]
            return (
              <div
                key={node.id}
                className={classes.filter(Boolean).join(' ')}
                data-node={node.id}
                data-kind={node.kind}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
              onPointerEnter={() => {
                if (!drag && !hiddenNodes.has(node.id)) setHot(node.id)
              }}
              onPointerLeave={() => setHot((id) => (id === node.id ? null : id))}
              onClick={() => toggleFocus(node)}
              >
                {holding === node.id ? <i className="star-hold" aria-hidden /> : null}
                {arriving === node.id ? (
                  <span className="star-arrive" aria-hidden>
                    <SparkRing />
                  </span>
                ) : null}
                {node.kind === 'item' && node.item ? (
                  <button
                    className="orb orb-sat"
                    onPointerDown={(event) => onNodeDragPointerDown(event, node)}
                    onContextMenu={(event) => event.preventDefault()}
                    onClick={() => {
                      if (dragRef.current || skipClick.current || busy.current) return
                      open(node.item!)
                    }}
                    title={node.sub}
                  >
                    <OrbFx />
                    <span className="orb-copy">
                      <img className="star-logo" src={node.logo} alt="" draggable={false} />
                      <b>{node.label}</b>
                    </span>
                  </button>
                ) : (
                  <div
                    className={node.kind === 'hub' ? 'orb orb-core' : 'orb orb-sat'}
                    onPointerDown={(event) => {
                      if (node.kind === 'hub') onHubPointerDown(event)
                      else if (node.kind === 'cat' && editingCats) onNodeDragPointerDown(event, node)
                    }}
                    onContextMenu={(event) => {
                      if (node.kind === 'cat' && editingCats) event.preventDefault()
                    }}
                  >
                    <OrbFx />
                    {node.kind === 'hub' ? <i className="core-aura" aria-hidden /> : null}
                    <span className="orb-copy">
                      {node.kind !== 'hub' && !(plainCats && node.kind === 'cat') ? (
                        <img className="star-logo" src={node.logo} alt="" draggable={false} />
                      ) : null}
                      <b>{node.label}</b>
                      {node.kind === 'hub' && node.sub ? <span className="orb-en">{node.sub}</span> : null}
                    </span>
                  </div>
                )}
                {node.kind === 'item' && node.item ? (
                  <button
                    className="star-drop"
                    onClick={() => {
                      if (dragRef.current || skipClick.current || busy.current) return
                      void remove(node.item!.id).then(reload)
                    }}
                  >
                    移除
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
        <button
          ref={gateRef}
          className={`warp-gate${drag?.over === 'gate' ? ' is-drop' : ''}`}
          onClick={openGate}
          aria-label={editingCats ? '開啟傳送門，新增分類' : '開啟傳送門，新增入口'}
        >
          <SparkRing />
          <span className="spark-embers" aria-hidden>
            {GATE_EMBERS.map((ember) => (
              <i
                key={ember.i}
                style={
                  {
                    '--a': ember.a,
                    '--delay': ember.delay,
                    '--dur': ember.dur,
                    '--sz': `${ember.size}px`,
                    '--fly': `${ember.fly}px`,
                  } as CSSProperties
                }
              />
            ))}
          </span>
        </button>
      </section>
      {modalOpen ? (
        <div
          className={`modal-back warp-modal${exiting ? ' is-out' : ''}`}
          onClick={() => {
            if (!exiting) setModalOpen(false)
          }}
        >
          <form
            className="modal"
            style={{ '--from-x': from.x, '--from-y': from.y } as CSSProperties}
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <h2>{editingCats ? '新增分類' : modalTitle}</h2>
            {editingCats ? (
              <label>
                分類名稱
                <input
                  value={catDraft}
                  onChange={(event) => setCatDraft(event.target.value)}
                  placeholder="新分類"
                  autoFocus
                />
              </label>
            ) : (
              <>
            <label>
              網址或路徑
              <input
                value={target}
                onChange={(event) => onTarget(event.target.value)}
                placeholder="https:// 或 C:\\..."
                autoFocus
              />
            </label>
            <label>
              名稱
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  setNamedByUser(true)
                }}
                placeholder="GitHub"
              />
            </label>
            <div className="field-block">
              分組
              <div className="gate-combo" ref={comboRef}>
                <div className="gate-combo-head">
                  <input
                    value={group}
                    onChange={(event) => setGroup(event.target.value)}
                    onFocus={() => setPick(true)}
                    placeholder={groupPlaceholder}
                    autoComplete="off"
                    aria-label="分組"
                  />
                  <button
                    type="button"
                    className={pick ? 'is-open' : undefined}
                    aria-label="選擇分組"
                    aria-expanded={pick}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setPick((value) => !value)}
                  />
                </div>
                {pick ? (
                  <ul className="gate-combo-list" role="listbox">
                    {groupNames.map((label) => (
                      <li key={label}>
                        <button
                          type="button"
                          role="option"
                          className={label === group ? 'is-on' : undefined}
                          aria-selected={label === group}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setGroup(label)
                            setPick(false)
                          }}
                        >
                          {label}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
              </>
            )}
            <div className="row-end">
              <button type="button" className="ghost" disabled={exiting} onClick={() => setModalOpen(false)}>
                取消
              </button>
              <button type="submit" className="solid" disabled={exiting}>
                {editingCats ? '加入分類' : submitLabel}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
