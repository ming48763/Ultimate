import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { SATELLITES } from '../lib/nav'
import type { View } from '../lib/types'

const SPARKS = [12, 38, 64, 91, 118, 147, 176, 204, 232, 261, 288, 327, 351]
const ZOOM_MS = 900
const TAP_MS = 1800

type Zoom = {
  id: View
  x: number
  y: number
  scale: number
}

type TapRipple = {
  id: number
  x: number
  y: number
}

function zoomFromOrb(id: View, el: Element, home: DOMRect): Zoom {
  const orb = el.getBoundingClientRect()
  const cx = orb.left + orb.width / 2
  const cy = orb.top + orb.height / 2
  const radius = Math.max(orb.width, orb.height, 1) / 2
  const farthest = Math.max(
    Math.hypot(cx, cy),
    Math.hypot(window.innerWidth - cx, cy),
    Math.hypot(cx, window.innerHeight - cy),
    Math.hypot(window.innerWidth - cx, window.innerHeight - cy),
  )
  return {
    id,
    x: cx - home.left,
    y: cy - home.top,
    scale: (farthest / radius) * 1.08,
  }
}

export function HomePage({
  returnFrom = null,
  onView,
  onSettings,
}: {
  returnFrom?: View | null
  onView: (view: View) => void
  onSettings: () => void
}) {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [settled, setSettled] = useState(false)
  const [zoom, setZoom] = useState<Zoom | null>(null)
  const [returning, setReturning] = useState(Boolean(returnFrom))
  const [taps, setTaps] = useState<TapRipple[]>([])
  const homeRef = useRef<HTMLDivElement>(null)
  const zoomTimer = useRef(0)
  const tapId = useRef(0)
  const tapTimers = useRef<number[]>([])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (media.matches) {
      setReduced(true)
      setSettled(true)
      setReturning(false)
      setZoom(null)
      return
    }
    if (returnFrom) return
    const timer = window.setTimeout(() => setSettled(true), 3200)
    return () => window.clearTimeout(timer)
  }, [returnFrom])

  useLayoutEffect(() => {
    if (!returnFrom || reduced) return
    const root = homeRef.current
    if (!root) return
    const home = root.getBoundingClientRect()
    const el =
      returnFrom === 'console'
        ? root.querySelector('.orb-core')
        : root.querySelector(`.sat-${returnFrom} .orb-sat`)
    if (!el) {
      setReturning(false)
      setSettled(true)
      return
    }
    setZoom(zoomFromOrb(returnFrom, el, home))
    zoomTimer.current = window.setTimeout(() => {
      setZoom(null)
      setReturning(false)
      setSettled(true)
    }, ZOOM_MS)
    return () => window.clearTimeout(zoomTimer.current)
  }, [returnFrom, reduced])

  useEffect(
    () => () => {
      window.clearTimeout(zoomTimer.current)
      tapTimers.current.forEach((timer) => window.clearTimeout(timer))
    },
    [],
  )

  function launch(next: View, el: HTMLButtonElement) {
    if (zoom || returning) return
    if (reduced) {
      onView(next)
      return
    }
    const home = homeRef.current?.getBoundingClientRect()
    if (!home) {
      onView(next)
      return
    }
    setZoom(zoomFromOrb(next, el, home))
    zoomTimer.current = window.setTimeout(() => onView(next), ZOOM_MS)
  }

  function rippleAt(event: PointerEvent<HTMLDivElement>) {
    if (reduced || zoom || returning) return
    if ((event.target as HTMLElement).closest('button, a, .home-brand')) return
    const home = homeRef.current?.getBoundingClientRect()
    if (!home) return
    const id = ++tapId.current
    setTaps((current) => [...current.slice(-5), { id, x: event.clientX - home.left, y: event.clientY - home.top }])
    tapTimers.current.push(
      window.setTimeout(() => {
        setTaps((current) => current.filter((item) => item.id !== id))
      }, TAP_MS),
    )
  }

  const satZoom = Boolean(zoom && zoom.id !== 'console')
  const stage = reduced
    ? 'is-reduced is-settled'
    : returning
      ? 'is-instant'
      : settled
        ? 'is-settled'
        : 'is-banging'
  const motion = zoom ? (returning ? ' is-zooming-out' : ' is-zooming') : ''
  const arming = returning && !zoom
  const homeStyle = zoom
    ? ({
        '--zx': `${zoom.x}px`,
        '--zy': `${zoom.y}px`,
        '--zscale': String(zoom.scale),
      } as CSSProperties)
    : undefined

  return (
    <div
      ref={homeRef}
      className={`home ${stage}${motion}${satZoom ? ' zoom-sat' : ''}${arming ? ' is-arming' : ''}`}
      onPointerDown={rippleAt}
    >
      <div className="home-cam" style={homeStyle}>
      <svg className="home-filters" aria-hidden>
        <defs>
          <filter id="orb-warp" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="1" seed="2" result="noise">
              <animate attributeName="baseFrequency" dur="2.4s" values="0.014;0.024;0.014" repeatCount="indefinite" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <filter id="ring-bend" x="-50%" y="-50%" width="200%" height="200%">
            <feTurbulence type="turbulence" baseFrequency="0.01" numOctaves="2" seed="4" result="n">
              <animate attributeName="baseFrequency" dur="22s" values="0.006;0.014;0.006" repeatCount="indefinite" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G">
              <animate attributeName="scale" dur="18s" values="8;18;8" repeatCount="indefinite" />
            </feDisplacementMap>
          </filter>
        </defs>
      </svg>
      <div className="home-flash" aria-hidden />
      <div className="page-ripples" aria-hidden>
        <i className="page-ripple r1" />
        <i className="page-ripple r2" />
        <i className="page-ripple r3" />
        <i className="page-ripple r4" />
      </div>
      <div className="tap-ripples" aria-hidden>
        {taps.map((tap) => (
          <span key={tap.id} className="tap-ripple" style={{ left: tap.x, top: tap.y }}>
            <i />
            <i />
            <i />
          </span>
        ))}
      </div>
      <div className="moire-field" aria-hidden>
        {(
          [
            { id: 'tl', cx: 0, cy: 0 },
            { id: 'tr', cx: 400, cy: 0 },
            { id: 'bl', cx: 0, cy: 400 },
            { id: 'br', cx: 400, cy: 400 },
          ] as const
        ).map((corner) => (
          <svg key={corner.id} className={`moire ${corner.id}`} viewBox="0 0 400 400">
            <g className="ring-pack" filter="url(#ring-bend)">
              {Array.from({ length: 6 }, (_, index) => (
                <circle
                  key={index}
                  className="warp-ring"
                  cx={corner.cx}
                  cy={corner.cy}
                  r="26"
                  style={{ animationDelay: `${index * 4.4}s` }}
                />
              ))}
            </g>
          </svg>
        ))}
      </div>
      <header className="home-brand">
        <span className="brand-mark">極</span>
        <div>
          <strong>Ultimate</strong>
          <em>開發整理筆記</em>
        </div>
      </header>
      <button className="home-settings" onClick={onSettings}>
        API 設定
      </button>
      <div className="cosmos" aria-label="模組入口">
        <div className="orbit-ring" aria-hidden />
        {SPARKS.map((deg) => (
          <span key={deg} className="spark" style={{ '--d': `${deg}deg` } as CSSProperties} aria-hidden />
        ))}
        {SATELLITES.map((item, index) => (
          <div
            key={item.id}
            className={`sat sat-${item.id}${zoom?.id === item.id ? ' is-target' : ''}`}
            style={{
              '--start': item.start,
              '--rest': item.rest,
              '--float-delay': `${index * 0.14}s`,
              '--float-dur': `${3.6 + (index % 4) * 0.2}s`,
            } as CSSProperties}
          >
            <i className="sat-fill" aria-hidden />
            <button
              className="orb orb-sat"
              onClick={(event) => launch(item.id, event.currentTarget)}
              aria-label={item.name}
              title={item.blurb}
            >
              <i className="orb-ripples" aria-hidden>
                <i className="orb-ripple" />
                <i className="orb-ripple" />
                <i className="orb-ripple" />
              </i>
              <i className="orb-sheen" aria-hidden />
              <span className="orb-copy">
                <b>{item.name}</b>
                <span className="orb-en">{item.en}</span>
              </span>
            </button>
          </div>
        ))}
        <button
          className={`orb orb-core${zoom?.id === 'console' ? ' is-target' : ''}`}
          onClick={(event) => launch('console', event.currentTarget)}
          aria-label="核心"
          title="專案進度"
        >
          <i className="orb-ripples" aria-hidden>
            <i className="orb-ripple" />
            <i className="orb-ripple" />
            <i className="orb-ripple" />
          </i>
          <i className="core-aura" aria-hidden />
          <span className="orb-copy">
            <b>核心</b>
            <span className="orb-en">Console</span>
          </span>
        </button>
      </div>
      </div>
    </div>
  )
}
