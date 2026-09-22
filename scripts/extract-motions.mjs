import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const css = fs.readFileSync(path.join(root, 'src', 'index.css'), 'utf8').replace(/\r\n/g, '\n')
const current = JSON.parse(fs.readFileSync(path.join(root, 'data', 'motions.json'), 'utf8'))

function extract(header) {
  let from = 0
  while (from < css.length) {
    const idx = css.indexOf(header, from)
    if (idx < 0) throw new Error(`missing CSS block: ${header.split('\n')[0]}`)
    const prev = idx === 0 ? '\n' : css[idx - 1]
    if (prev === '\n') {
      const brace = css.indexOf('{', idx)
      if (brace < 0) throw new Error(`no { after ${header.split('\n')[0]}`)
      let depth = 0
      let i = brace
      for (; i < css.length; i++) {
        if (css[i] === '{') depth++
        else if (css[i] === '}') {
          depth--
          if (depth === 0) {
            i++
            break
          }
        }
      }
      return css.slice(idx, i).trim()
    }
    from = idx + 1
  }
  throw new Error(`missing CSS block: ${header.split('\n')[0]}`)
}

function pack(...headers) {
  return headers.map(extract).join('\n\n')
}

const FX_BASE = pack('.fx-stage {', '.fx-orb {')
const ORB = pack('.orb {', '.orb b,', '.orb-copy {', '.orb-core .orb-copy {', '.orb b {', '.orb-en {')
const CORE_SAT = pack(
  '.orb-core {',
  '.orb-core b {',
  '.orb-core .orb-en {',
  '.core-aura {',
  '.sat {',
  '.orb-sat {',
  '.orb-sat .orb-en {',
  '.sat-fill {',
)
const STAR = pack(
  '.star-chain {',
  '.shell.is-cosmos .star-chain {',
  '.star-field {',
  '.shell.is-cosmos .star-field {',
  '.shell.is-cosmos .star-chain.is-focusable .star-field {',
  '.shell.is-cosmos .star-chain.is-focused .star-field {',
  '.shell.is-cosmos .star-chain.is-focusable {',
  '.shell.is-cosmos .star-chain.is-focused {',
  '.star-links {',
  '.star-links path {',
  '.star-links path.is-lit {',
  '.star-node {',
  '.star-hub {',
  '.star-item {',
  '.star-chain .orb-core,',
  '.star-chain .orb-core {',
  '.star-chain .orb-sat {',
  '.star-chain .orb-copy {',
  '.star-chain .orb b {',
  '.star-chain .orb-core b {',
  '.star-chain .orb-en {',
  '.star-chain .core-aura {',
  '.star-chain.is-plain-cats .star-cat .orb-copy {',
  '.star-chain.is-plain-cats .star-cat .orb b {',
  '.star-chain.is-focusable .orb-core,',
  '.star-chain.is-focusable.is-focused .orb-core {',
  '.star-chain.is-focusable.is-focused .orb-sat {',
  '.star-chain.is-focusable.is-focused .orb-core b {',
  '.star-chain.is-focusable.is-focused .orb-en {',
  '.star-chain.is-focusable.is-focused .star-logo {',
  '.star-chain.is-focusable.is-focused.is-plain-cats .star-cat .orb b {',
  '.star-node.is-hidden {',
  '.star-links path.is-hidden {',
)
const HOLD_SUCK = pack(
  '@property --hold {',
  '.star-hold {',
  '.star-item.is-sucking .orb-sat {',
  '@keyframes hold-charge {',
  '@keyframes star-suck {',
)
const GATE = pack(
  '@property --spark-turn {',
  '.warp-gate {',
  '.spark-portal {',
  '.spark-orbit {',
  '.spark-orbit > i {',
  '.spark-void {',
  '.warp-gate .spark-orbit > i {',
  '@keyframes spark-orbit-turn {',
)
const HOME_VARS = pack(
  '@property --spin {',
  '@property --start {',
  '@property --rest {',
  '@property --r {',
  '.home {',
  '.home-cam {',
  '.cosmos {',
  '.orbit-ring,',
  '.orbit-ring {',
  `.spark {
  width: 5px;`,
)
const HOME_KEYS = pack(
  '@keyframes spark-out {',
  '@keyframes core-bang {',
  '@keyframes sat-arrive {',
  '@keyframes sat-grow {',
  '@keyframes ring-in {',
)

const SPARKS = [12, 38, 64, 91, 118, 147, 176, 204, 232, 261, 288, 327, 351]
const SATS = [
  { id: 'notes', name: '靈光', en: 'Spark', start: '270deg', rest: '315deg' },
  { id: 'learn', name: '學而', en: 'Study', start: '342deg', rest: '387deg' },
  { id: 'intel', name: '智能', en: 'Craft', start: '414deg', rest: '459deg' },
  { id: 'portal', name: '通道', en: 'Gates', start: '486deg', rest: '531deg' },
  { id: 'traces', name: '軌跡', en: 'Prompts', start: '558deg', rest: '603deg' },
]
const PORTAL = Array.from({ length: 36 }, (_, i) => `${(i * 360) / 36}deg`)
const SPARKLER = Array.from({ length: 48 }, (_, i) => ({
  x: 70 + (i % 12) * 32 + ((i * 9) % 20),
  y: ((i * 17) % 34) - 17,
  delay: (i % 10) * 0.025,
  size: 2 + (i % 4),
}))

const gateSparks = PORTAL.map((a) => `<i style="--a:${a}"></i>`).join('')
const gateHtml = `<button class="warp-gate" type="button"><span class="spark-portal"><span class="spark-orbit" aria-hidden>${gateSparks}</span><i class="spark-void" aria-hidden></i></span></button>`

const sparkHtml = SPARKS.map((deg) => `<span class="spark" style="--d:${deg}deg" aria-hidden></span>`).join('')
const satHtml = SATS.map(
  (item) =>
    `<div class="sat sat-${item.id}" style="--start:${item.start};--rest:${item.rest}"><button class="orb orb-sat" type="button"><span class="orb-copy"><b>${item.name}</b><span class="orb-en">${item.en}</span></span></button></div>`,
).join('')
const homeInner = `<div class="home" style="width:100%;height:100%;min-height:100%"><div class="home-cam" style="min-height:100%"><div class="cosmos" aria-label="模組入口"><div class="orbit-ring" aria-hidden></div>${sparkHtml}${satHtml}<button class="orb orb-core" type="button"><i class="core-aura" aria-hidden></i><span class="orb-copy"><b>核心</b><span class="orb-en">Console</span></span></button></div></div></div>`
const sparklerHtml = SPARKLER.map(
  (spark) =>
    `<i style="--x:${spark.x}px;--y:${spark.y}px;--delay:${spark.delay}s;--size:${spark.size}px"></i>`,
).join('')

const dustBits = [
  ['22px', '-18px'],
  ['-24px', '12px'],
  ['8px', '26px'],
  ['-16px', '-22px'],
  ['28px', '8px'],
  ['-6px', '20px'],
  ['14px', '-28px'],
  ['-28px', '-4px'],
]
  .map(([dx, dy]) => `<i class="fx-dust" style="--dx:${dx};--dy:${dy}"></i>`)
  .join('')

const lineDust = [
  ['-28px', '-22px'],
  ['6px', '-30px'],
  ['32px', '-10px'],
  ['24px', '22px'],
  ['-8px', '28px'],
  ['-30px', '8px'],
  ['0px', '-8px'],
  ['14px', '14px'],
]
  .map(([dx, dy]) => `<i class="line-dust" style="left:50%;top:50%;width:6px;height:6px;--dx:${dx};--dy:${dy}"></i>`)
  .join('')

const html = {
  fade: '<div class="fx-stage"><i class="fx-orb is-fade"></i></div>',
  rise: '<div class="fx-stage"><i class="fx-orb is-rise"></i></div>',
  pop: '<div class="fx-stage"><i class="fx-orb is-pop"></i></div>',
  pulse: '<div class="fx-stage"><i class="fx-orb is-pulse"></i></div>',
  sheen: '<div class="fx-stage"><i class="fx-orb is-sheen"></i></div>',
  ripple:
    '<div class="fx-stage"><i class="fx-orb"></i><i class="fx-ring"></i><i class="fx-ring fx-ring-2"></i></div>',
  orbit:
    '<div class="fx-stage"><span class="fx-orbit-wrap"><i class="fx-orb"></i><i class="fx-spark"></i></span></div>',
  dust: `<div class="fx-stage"><span class="fx-dust-wrap">${dustBits}</span></div>`,
  breathe: '<div class="fx-stage"><i class="fx-orb is-breathe"></i></div>',
  spin: gateHtml,
  suck: '<div class="fx-stage"><i class="fx-orb is-suck"></i></div>',
  expand: '<div class="fx-stage"><i class="fx-bar"></i></div>',
  'star-chain': `<div class="shell is-cosmos" style="width:100%;height:100%;min-height:100%"><section class="star-chain is-plain-cats is-focusable" style="width:100%;height:100%;min-height:100%"><div class="star-field"><svg class="star-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden><path d="M50 50 Q 42 42 34 32"/><path d="M50 50 Q 62 42 70 34"/><path d="M50 50 Q 58 62 66 74"/><path d="M34 32 Q 24 22 18 16"/><path d="M34 32 Q 22 36 14 40"/><path d="M70 34 Q 82 24 88 18"/></svg><div class="star-node star-hub" style="left:50%;top:50%"><div class="orb orb-core"><i class="core-aura"></i><span class="orb-copy"><b>智能</b><span class="orb-en">Craft</span></span></div></div><div class="star-node star-cat" style="left:34%;top:32%"><div class="orb orb-sat"><span class="orb-copy"><b>圖像</b></span></div></div><div class="star-node star-cat" style="left:70%;top:34%"><div class="orb orb-sat"><span class="orb-copy"><b>聲音</b></span></div></div><div class="star-node star-cat" style="left:66%;top:74%"><div class="orb orb-sat"><span class="orb-copy"><b>文字</b></span></div></div><div class="star-node star-item" style="left:18%;top:16%"><button class="orb orb-sat" type="button"></button></div><div class="star-node star-item" style="left:14%;top:40%"><button class="orb orb-sat" type="button"></button></div><div class="star-node star-item" style="left:88%;top:18%"><button class="orb orb-sat" type="button"></button></div></div></section></div>`,
  'rail-open': `<div class="shell is-cosmos" style="width:100%;height:100%"><aside class="rail is-open is-sparking"><button class="rail-toggle" type="button">≡</button><div class="rail-frame"><div class="rail-panel" style="max-width:420px"><div class="rail-panel-inner"><button class="brand-block brand-home" type="button"><div><strong>首頁</strong></div></button><nav><button type="button"><b>核心</b></button><button type="button"><b>通道</b></button><button type="button" class="active"><b>智能</b></button><button type="button"><b>軌跡</b></button></nav></div></div><i class="rail-rim"></i></div><span class="rail-sparks" aria-hidden><i class="rail-fuse"></i>${sparklerHtml}</span></aside></div>`,
  'warp-open': `<div class="modal-back warp-modal" style="--from-x:280px;--from-y:160px;position:absolute"><div class="modal"><h2>送入傳送門</h2></div></div>${gateHtml}`,
  'line-cut': `<div class="star-field" style="position:relative;width:100%;height:100%"><svg class="star-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden><path d="M18 72 Q 50 40 82 22" style="animation:line-dust-fade .28s ease both"></path></svg>${lineDust}</div>`,
  'gate-suck': `<div class="star-chain" style="width:100%;height:100%;min-height:100%"><div class="star-field"><div class="star-node star-item is-holding is-sucking" style="left:38%;top:42%"><i class="star-hold" aria-hidden></i><button class="orb orb-sat" type="button"><span class="orb-copy"><b>節點</b></span></button></div></div>${gateHtml}</div>`,
  'tab-switch': `<div class="trace-switch" style="margin:0"><button class="trace-tab is-prev" type="button"><span class="trace-tab-name">prompt紀錄與效果驗證</span><span class="trace-tab-short">錄</span></button><button class="trace-tab is-now" type="button"><span class="trace-tab-name">CSS動畫彙整</span><span class="trace-tab-short">動</span></button><button class="trace-tab is-next" type="button"><span class="trace-tab-name">布局</span><span class="trace-tab-short">局</span></button></div><div class="trace-pane is-on is-from-next" style="color:#f3eee4">CSS動畫彙整</div>`,
  'star-focus': `<div class="shell is-cosmos" style="width:100%;height:100%;min-height:100%"><section class="star-chain is-plain-cats is-focusable is-focused" style="width:100%;height:100%;min-height:100%"><div class="star-field"><svg class="star-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden><path class="is-lit" d="M12 82 Q 22 70 32 58"/><path class="is-lit" d="M32 58 Q 24 40 18 28"/><path class="is-lit" d="M32 58 Q 28 48 22 44"/><path class="is-hidden" d="M50 50 Q 62 42 70 34"/><path class="is-hidden" d="M50 50 Q 58 62 66 74"/></svg><div class="star-node star-hub" style="left:12%;top:82%"><div class="orb orb-core"><i class="core-aura"></i><span class="orb-copy"><b>智能</b><span class="orb-en">Craft</span></span></div></div><div class="star-node star-cat" style="left:32%;top:58%"><div class="orb orb-sat"><span class="orb-copy"><b>圖像</b></span></div></div><div class="star-node star-item" style="left:18%;top:28%"><button class="orb orb-sat" type="button"></button></div><div class="star-node star-item" style="left:22%;top:44%"><button class="orb orb-sat" type="button"></button></div><div class="star-node star-cat is-hidden" style="left:70%;top:34%"><div class="orb orb-sat"><span class="orb-copy"><b>聲音</b></span></div></div><div class="star-node star-cat is-hidden" style="left:66%;top:74%"><div class="orb orb-sat"><span class="orb-copy"><b>文字</b></span></div></div></div></section></div>`,
  'home-bang': homeInner,
  'home-zoom': `<div class="home is-zooming zoom-sat" style="width:100%;height:100%;min-height:100%;--zx:68%;--zy:32%;--zscale:8"><div class="home-cam" style="min-height:100%"><div class="cosmos">${sparkHtml}<div class="sat sat-intel is-target" style="--start:414deg;--rest:459deg"><button class="orb orb-sat" type="button"><span class="orb-copy"><b>智能</b><span class="orb-en">Craft</span></span></button></div>${SATS.filter((item) => item.id !== 'intel')
    .map(
      (item) =>
        `<div class="sat sat-${item.id}" style="--start:${item.start};--rest:${item.rest}"><button class="orb orb-sat" type="button"><span class="orb-copy"><b>${item.name}</b><span class="orb-en">${item.en}</span></span></button></div>`,
    )
    .join('')}<button class="orb orb-core" type="button"><i class="core-aura"></i><span class="orb-copy"><b>核心</b><span class="orb-en">Console</span></span></button></div></div></div>`,
  'zoom-back': `<div class="home is-zooming-out zoom-sat" style="width:100%;height:100%;min-height:100%;--zx:68%;--zy:32%;--zscale:8"><div class="home-cam" style="min-height:100%"><div class="cosmos"><div class="sat sat-intel is-target" style="--start:414deg;--rest:459deg"><button class="orb orb-sat" type="button"><span class="orb-copy"><b>智能</b><span class="orb-en">Craft</span></span></button></div>${SATS.filter((item) => item.id !== 'intel')
    .map(
      (item) =>
        `<div class="sat sat-${item.id}" style="--start:${item.start};--rest:${item.rest}"><button class="orb orb-sat" type="button"><span class="orb-copy"><b>${item.name}</b><span class="orb-en">${item.en}</span></span></button></div>`,
    )
    .join('')}<button class="orb orb-core" type="button"><i class="core-aura"></i><span class="orb-copy"><b>核心</b><span class="orb-en">Console</span></span></button></div></div></div>`,
}

const cssMap = {
  fade: pack('.fx-stage {', '.fx-orb {', '.fx-orb.is-fade {', '@keyframes trace-fx-fade {'),
  rise: pack('.fx-stage {', '.fx-orb {', '.fx-orb.is-rise {', '@keyframes trace-fx-rise {'),
  pop: pack('.fx-stage {', '.fx-orb {', '.fx-orb.is-pop {', '@keyframes trace-fx-pop {'),
  pulse: pack('.fx-stage {', '.fx-orb {', '.fx-orb.is-pulse {', '@keyframes trace-fx-pulse {'),
  sheen: pack('.fx-stage {', '.fx-orb {', '.fx-orb.is-sheen {', '.fx-orb.is-sheen::after {', '@keyframes trace-fx-sheen {'),
  ripple: pack('.fx-stage {', '.fx-orb {', '.fx-ring {', '.fx-ring-2 {', '@keyframes trace-fx-ripple {'),
  orbit: pack(
    '.fx-stage {',
    '.fx-orb {',
    '.fx-orbit-wrap,',
    '.fx-orbit-wrap {',
    '.fx-spark {',
    '@keyframes trace-fx-orbit {',
  ),
  dust: pack('.fx-stage {', '.fx-orbit-wrap,', '.fx-dust {', '@keyframes trace-fx-dust {'),
  breathe: pack('.fx-stage {', '.fx-orb {', '.fx-orb.is-breathe {', '@keyframes trace-fx-breathe {'),
  spin: GATE,
  suck: pack('.fx-stage {', '.fx-orb {', '.fx-orb.is-suck {', '@keyframes trace-fx-suck {'),
  expand: pack('.fx-stage {', '.fx-bar {', '@keyframes trace-fx-expand {'),
  'star-chain': [ORB, CORE_SAT, STAR].join('\n\n'),
  'rail-open': pack(
    '.rail {',
    '.brand-block {',
    '.brand-home {',
    '.brand-block strong {',
    '.rail nav {',
    '.rail nav button,',
    '.rail nav button b {',
    '.shell.is-cosmos {',
    '.shell.is-cosmos .rail {',
    '.rail-toggle {',
    '.rail-panel-inner {',
    '.shell.is-cosmos .rail-frame {',
    '.shell.is-cosmos .rail.is-open .rail-frame {',
    '.shell.is-cosmos .rail-panel {',
    '.shell.is-cosmos .rail-panel-inner {',
    '.shell.is-cosmos .rail-rim {',
    '.shell.is-cosmos .brand-block {',
    '.shell.is-cosmos .brand-block em {',
    '.shell.is-cosmos .brand-block strong {',
    '.shell.is-cosmos .rail nav {',
    '.shell.is-cosmos .rail nav button,',
    '.shell.is-cosmos .rail nav button span {',
    '.shell.is-cosmos .rail nav button {',
    '.shell.is-cosmos .rail nav button.active {',
    '.rail-sparks {',
    '.rail-fuse {',
    '.rail-sparks > i:not(.rail-fuse) {',
    '.shell.is-cosmos .rail.is-sparking .rail-fuse {',
    '.shell.is-cosmos .rail.is-sparking .rail-sparks > i:not(.rail-fuse) {',
    '@keyframes fuse-draw {',
    '@keyframes sparkler-fly {',
    '@keyframes rail-rim-run {',
    '.shell.is-cosmos .rail.is-open .rail-panel {',
    '.shell.is-cosmos .rail.is-open .rail-rim {',
    '.shell.is-cosmos .rail.is-sparking .rail-toggle {',
  ),
  'warp-open': [
    pack(
      '.modal-back {',
      '.modal {',
      '.warp-modal {',
      '.warp-modal .modal {',
      '@keyframes warp-veil-in {',
      '@keyframes warp-modal-in {',
    ),
    GATE,
  ].join('\n\n'),
  'line-cut': pack('.star-links {', '.star-links path {', '.line-dust {', '@keyframes line-dust-fade {'),
  'gate-suck': [STAR, HOLD_SUCK, GATE, ORB, CORE_SAT].join('\n\n'),
  'tab-switch': pack(
    '.trace-switch {',
    '.trace-tab {',
    '.trace-tab.is-now {',
    '.trace-tab.is-prev {',
    '.trace-tab.is-next {',
    '.trace-tab-name,',
    '.trace-tab-name {',
    '.trace-tab-short {',
    '.trace-tab.is-now .trace-tab-short {',
    '.trace-tab.is-now .trace-tab-name {',
    '.trace-tab:not(.is-now) .trace-tab-name {',
    '.trace-tab:not(.is-now) .trace-tab-short {',
    '.trace-pane.is-on.is-from-next {',
    '@keyframes trace-pane-next {',
  ),
  'star-focus': [ORB, CORE_SAT, STAR].join('\n\n'),
  'home-bang': [HOME_VARS, ORB, CORE_SAT, HOME_KEYS].join('\n\n'),
  'home-zoom': [
    HOME_VARS,
    ORB,
    CORE_SAT,
    pack(
      '@property --zscale {',
      '.home.zoom-sat .home-cam::after {',
      '.home.is-zooming.zoom-sat .home-cam::after {',
      '.home.is-zooming,',
      '.home.is-zooming .home-cam {',
      '.home.is-zooming .home-brand,',
      '.home.is-zooming .sat:not(.is-target),',
      '.home.is-zooming .is-target,',
      '.home.is-zooming .orb-copy,',
      '.home.is-zooming .orb-core,',
      '.home.is-zooming .is-target .orb-sat,',
      '@keyframes home-zoom {',
      '@keyframes sat-corner-wash {',
    ),
  ].join('\n\n'),
  'zoom-back': [
    HOME_VARS,
    ORB,
    CORE_SAT,
    pack(
      '@property --zscale {',
      '.home.is-zooming-out.zoom-sat .home-cam::after {',
      '.home.is-zooming,',
      '.home.is-zooming-out .home-cam {',
      '.home.is-zooming-out .home-brand,',
      '.home.is-zooming-out .moire-field,',
      '.home.is-zooming-out .sat:not(.is-target),',
      '.home.is-zooming .is-target,',
      '.home.is-zooming-out .orb-ripples,',
      '.home.is-zooming .orb-core,',
      '.home.is-zooming-out .orb-copy {',
      '.home.is-zooming .is-target .orb-sat,',
      '@keyframes home-zoom-out {',
      '@keyframes zoom-others-in {',
    ),
  ].join('\n\n'),
}

const sources = {
  fade: 'src/index.css .fx-orb.is-fade / @keyframes trace-fx-fade',
  rise: 'src/index.css .fx-orb.is-rise / @keyframes trace-fx-rise',
  pop: 'src/index.css .fx-orb.is-pop / @keyframes trace-fx-pop',
  pulse: 'src/index.css .fx-orb.is-pulse / @keyframes trace-fx-pulse',
  sheen: 'src/index.css .fx-orb.is-sheen / @keyframes trace-fx-sheen',
  ripple: 'src/index.css .fx-ring / @keyframes trace-fx-ripple',
  orbit: 'src/index.css .fx-orbit-wrap / @keyframes trace-fx-orbit',
  dust: 'src/index.css .fx-dust / @keyframes trace-fx-dust',
  breathe: 'src/index.css .fx-orb.is-breathe / @keyframes trace-fx-breathe',
  spin: 'src/index.css .spark-orbit / @keyframes spark-orbit-turn',
  suck: 'src/index.css .fx-orb.is-suck / @keyframes trace-fx-suck',
  expand: 'src/index.css .fx-bar / @keyframes trace-fx-expand',
  'star-chain': 'src/index.css .star-chain .star-node .star-links',
  'rail-open': 'src/index.css .shell.is-cosmos .rail.is-sparking / @keyframes fuse-draw sparkler-fly',
  'warp-open': 'src/index.css .warp-modal / @keyframes warp-modal-in',
  'line-cut': 'src/index.css .line-dust / @keyframes line-dust-fade',
  'gate-suck': 'src/index.css .star-item.is-sucking / @keyframes star-suck hold-charge',
  'tab-switch': 'src/index.css .trace-tab / @keyframes trace-pane-next',
  'star-focus': 'src/index.css .star-chain.is-focused / .star-chain.is-focusable.is-focused',
  'home-bang': 'src/index.css @keyframes core-bang sat-arrive sat-grow spark-out / .orb-core .sat',
  'home-zoom': 'src/index.css .home.is-zooming / @keyframes home-zoom',
  'zoom-back': 'src/index.css .home.is-zooming-out / @keyframes home-zoom-out',
}

const next = current.map((item) => {
  if (!html[item.id] || !cssMap[item.id]) throw new Error(`no transplant for ${item.id}`)
  return {
    ...item,
    source: sources[item.id],
    html: html[item.id],
    css: cssMap[item.id],
  }
})

fs.writeFileSync(path.join(root, 'data', 'motions.json'), `${JSON.stringify(next, null, 2)}\n`)
console.log(`wrote ${next.length} motions`)
