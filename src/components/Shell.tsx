import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { MODULES } from '../lib/nav'
import type { View } from '../lib/types'

const SPARKLER = Array.from({ length: 48 }, (_, i) => ({
  i,
  x: 70 + (i % 12) * 32 + ((i * 9) % 20),
  y: ((i * 17) % 34) - 17,
  delay: (i % 10) * 0.025,
  size: 2 + (i % 4),
}))

function burstRail(width: number, height: number, left: number, top: number) {
  const alongCount = Math.max(48, Math.min(88, Math.round(width / 5)))
  const offsets = [-0.38, -0.18, 0, 0.18, 0.38]
  const sparks: { i: number; x: number; y: number; dx: string; dy: string; size: number }[] = []
  let i = 0
  for (let s = 0; s < alongCount; s++) {
    const x = left + (s / (alongCount - 1)) * width
    const midY = top + height / 2
    for (const offset of offsets) {
      const ang = (i / 11) * Math.PI + s * 0.37
      const dist = 22 + (i % 6) * 14
      sparks.push({
        i,
        x,
        y: midY + offset * height,
        dx: `${Math.cos(ang) * dist}px`,
        dy: `${Math.sin(ang) * dist}px`,
        size: 2 + (i % 4),
      })
      i += 1
    }
  }
  return sparks
}

export function Shell({
  view,
  fromHome = false,
  leaving = false,
  onView,
  children,
}: {
  view: View
  fromHome?: boolean
  leaving?: boolean
  onView: (view: View) => void
  children: ReactNode
}) {
  const current = MODULES.find((item) => item.id === view)
  const cosmos = view === 'console' || view === 'portal' || view === 'intel' || view === 'traces'
  const [railOpen, setRailOpen] = useState(false)
  const [sparking, setSparking] = useState(false)
  const [retracting, setRetracting] = useState(false)
  const [railDust, setRailDust] = useState<ReturnType<typeof burstRail> | null>(null)
  const sparkTimer = useRef(0)
  const openTimer = useRef(0)
  const dustTimer = useRef(0)
  const retractTimer = useRef(0)
  const railRef = useRef<HTMLElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const shellClass = ['shell', cosmos && 'is-cosmos', fromHome && 'from-home', leaving && 'is-leaving']
    .filter(Boolean)
    .join(' ')

  useEffect(() => {
    window.clearTimeout(sparkTimer.current)
    window.clearTimeout(openTimer.current)
    window.clearTimeout(dustTimer.current)
    window.clearTimeout(retractTimer.current)
    setRailOpen(false)
    setSparking(false)
    setRetracting(false)
    setRailDust(null)
    if (panelRef.current) panelRef.current.style.maxWidth = ''
  }, [view])

  useEffect(() => {
    if (!railOpen) return
    const panel = panelRef.current
    const inner = panel?.querySelector('.rail-panel-inner')
    if (panel) panel.style.maxWidth = `${(inner?.scrollWidth ?? 0) + 14}px`
  }, [railOpen])

  useEffect(
    () => () => {
      window.clearTimeout(sparkTimer.current)
      window.clearTimeout(openTimer.current)
      window.clearTimeout(dustTimer.current)
      window.clearTimeout(retractTimer.current)
    },
    [],
  )

  function fitRail(open: boolean) {
    const panel = panelRef.current
    if (!panel) return
    if (!open) {
      const width = panel.getBoundingClientRect().width
      panel.style.maxWidth = `${width}px`
      void panel.offsetWidth
      panel.style.maxWidth = '0px'
      return
    }
    const inner = panel.querySelector('.rail-panel-inner')
    panel.style.maxWidth = `${(inner?.scrollWidth ?? 0) + 14}px`
  }

  function toggleRail() {
    window.clearTimeout(sparkTimer.current)
    window.clearTimeout(openTimer.current)
    if (retracting) return
    if (railOpen || sparking) {
      const panel = panelRef.current?.getBoundingClientRect()
      const rail = railRef.current?.getBoundingClientRect()
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (panel && rail && panel.width > 8 && !reduce) {
        setRailDust(burstRail(panel.width, panel.height, panel.left - rail.left, panel.top - rail.top))
        window.clearTimeout(dustTimer.current)
        dustTimer.current = window.setTimeout(() => setRailDust(null), 1000)
      }
      fitRail(false)
      setRetracting(true)
      setRailOpen(false)
      setSparking(false)
      window.clearTimeout(retractTimer.current)
      retractTimer.current = window.setTimeout(() => setRetracting(false), 520)
      return
    }
    setSparking(true)
    openTimer.current = window.setTimeout(() => {
      setRailOpen(true)
    }, 300)
    sparkTimer.current = window.setTimeout(() => setSparking(false), 1300)
  }

  return (
    <div className={shellClass}>
      <aside ref={railRef} className={`rail${railOpen ? ' is-open' : ''}${sparking ? ' is-sparking' : ''}${retracting ? ' is-retracting' : ''}`}>
        {cosmos ? (
          <button className="rail-toggle" onClick={toggleRail} aria-label={railOpen ? '收合選單' : '展開選單'} aria-expanded={railOpen}>
            ≡
          </button>
        ) : (
          <button className="brand-block brand-home" onClick={() => onView('home')}>
            <span className="brand-mark">極</span>
            <div>
              <strong>首頁</strong>
            </div>
          </button>
        )}
        <div className="rail-frame">
          <div className="rail-panel" ref={panelRef}>
            <div className="rail-panel-inner">
            {cosmos ? (
              <button className="brand-block brand-home" onClick={() => onView('home')}>
                <div>
                  <strong>首頁</strong>
                </div>
              </button>
            ) : null}
            <nav>
              {MODULES.map((item) => (
                <button
                  key={item.id}
                  className={item.id === view ? 'active' : ''}
                  onClick={() => onView(item.id)}
                >
                  <b>{item.name}</b>
                  <span>{item.en}</span>
                </button>
              ))}
            </nav>
            </div>
          </div>
          {cosmos ? <i className="rail-rim" aria-hidden /> : null}
        </div>
        {cosmos ? (
          <span className="rail-sparks" aria-hidden>
            <i className="rail-fuse" />
            {SPARKLER.map((spark) => (
              <i
                key={spark.i}
                style={{
                  '--x': `${spark.x}px`,
                  '--y': `${spark.y}px`,
                  '--delay': `${spark.delay}s`,
                  '--size': `${spark.size}px`,
                } as CSSProperties}
              />
            ))}
          </span>
        ) : null}
        {railDust
          ? railDust.map((spark) => (
              <i
                key={spark.i}
                className="rail-dust"
                style={
                  {
                    left: spark.x,
                    top: spark.y,
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
      </aside>
      <div className="stage">
        {cosmos ? null : (
          <header className="stage-head">
            <div>
              <p className="eyebrow">個人程式專案開發進度整理</p>
              <h1>{current?.name}</h1>
            </div>
            <p className="stage-note">{current?.en}</p>
          </header>
        )}
        <main>{children}</main>
      </div>
    </div>
  )
}
