export type MotionKind = 'single' | 'local' | 'transit'

export type MotionMacro = {
  id: string
  name: string
  kind: MotionKind
  blurb: string
  source: string
  html: string
  css: string
}

export const MOTION_KINDS: { id: MotionKind; name: string; blurb: string }[] = [
  { id: 'single', name: '單一動畫', blurb: '一次只做一件事，例如淡入、脈衝、波紋。' },
  { id: 'local', name: '局部動畫', blurb: '多個單一效果串成一段，例如展開側欄、吸入傳送門、切換頁籤。' },
  { id: 'transit', name: '轉場動畫', blurb: '換頁時的整段節奏，例如首頁大爆炸、進衛星時的放大虛化。' },
]

export function labDocument(html: string, css: string) {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<style>
:root {
  --ink: #1a2420;
  --ink-soft: #5b6a63;
  --paper: #f4efe4;
  --paper-2: #ebe4d4;
  --card: #fffaf1;
  --line: #d5cbb8;
  --accent: #245c4a;
  --accent-2: #8a3b2b;
  --warn: #8a3b2b;
  --font: "Noto Sans TC", sans-serif;
  --display: "Shippori Mincho", "Noto Sans TC", serif;
}
html, body {
  margin: 0;
  width: 100%;
  height: 100%;
  background: #0c0f0d;
  color: #f3eee4;
  overflow: hidden;
}
body {
  display: grid;
  place-items: center;
  font-family: var(--font);
}
* { box-sizing: border-box; }
button, input, textarea, select {
  font: inherit;
  color: inherit;
}
button { cursor: pointer; }
${css}
</style>
</head>
<body>${html}</body>
</html>`
}

export function prettyCss(css: string) {
  return css
    .replace(/\s*\{\s*/g, ' {\n  ')
    .replace(/;\s*/g, ';\n  ')
    .replace(/\s*\}\s*/g, '\n}\n')
    .replace(/\n\s*\n/g, '\n')
    .trim()
}
