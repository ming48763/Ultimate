export function WarpFilters() {
  return (
    <svg className="home-filters" aria-hidden>
      <defs>
        <filter id="orb-warp" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="1" seed="2" result="noise">
            <animate attributeName="baseFrequency" dur="2.4s" values="0.014;0.024;0.014" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  )
}

export function OrbFx() {
  return (
    <>
      <i className="orb-ripples" aria-hidden>
        <i className="orb-ripple" />
        <i className="orb-ripple" />
        <i className="orb-ripple" />
      </i>
      <i className="orb-sheen" aria-hidden />
    </>
  )
}
