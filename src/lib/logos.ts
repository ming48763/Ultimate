const FILES: Record<string, string> = {
  hub: '/logos/gate.svg',
  通道: '/logos/gate.svg',
  智能: '/logos/intel.svg',
  託管: '/logos/hosting.svg',
  部署: '/logos/deploy.svg',
  資料: '/logos/data.svg',
  開發: '/logos/code.svg',
  圖像生成: '/logos/image.svg',
  'ICON 生成': '/logos/icon.svg',
  音樂生成: '/logos/music.svg',
  '文本式 AI': '/logos/text.svg',
  '3D 建模': '/logos/cube.svg',
  github: '/logos/github.svg',
  'github.com': '/logos/github.svg',
  vercel: '/logos/vercel.svg',
  'vercel.com': '/logos/vercel.svg',
  render: '/logos/render.svg',
  'render.com': '/logos/render.svg',
  'dashboard.render.com': '/logos/render.svg',
  mongodb: '/logos/mongodb.svg',
  'mongodb.com': '/logos/mongodb.svg',
  'cloud.mongodb.com': '/logos/mongodb.svg',
  railway: '/logos/railway.svg',
  'railway.app': '/logos/railway.svg',
  cursor: '/logos/cursor.svg',
  'cursor.com': '/logos/cursor.svg',
  midjourney: '/logos/midjourney.png',
  'midjourney.com': '/logos/midjourney.png',
  ideogram: '/logos/ideogram.png',
  'ideogram.ai': '/logos/ideogram.png',
  recraft: '/logos/recraft.png',
  'recraft.ai': '/logos/recraft.png',
  krea: '/logos/krea.png',
  'krea.ai': '/logos/krea.png',
  iconscout: '/logos/iconscout.png',
  'iconscout.com': '/logos/iconscout.png',
  'flaticon-ai': '/logos/flaticon.png',
  flaticon: '/logos/flaticon.png',
  'flaticon.com': '/logos/flaticon.png',
  magician: '/logos/magician.svg',
  'magician.design': '/logos/magician.svg',
  mongo: '/logos/mongodb.svg',
  'icons8-ai': '/logos/icons8.svg',
  icons8: '/logos/icons8.svg',
  'icons8.com': '/logos/icons8.svg',
  suno: '/logos/suno.svg',
  'suno.com': '/logos/suno.svg',
  udio: '/logos/udio.png',
  'udio.com': '/logos/udio.png',
  'stable-audio': '/logos/stable-audio.png',
  'stableaudio.com': '/logos/stable-audio.png',
  soundraw: '/logos/soundraw.png',
  'soundraw.io': '/logos/soundraw.png',
  copyai: '/logos/copyai.png',
  'copy.ai': '/logos/copyai.png',
  jasper: '/logos/jasper.png',
  'jasper.ai': '/logos/jasper.png',
  'deepl-write': '/logos/deepl.svg',
  deepl: '/logos/deepl.svg',
  'deepl.com': '/logos/deepl.svg',
  wordtune: '/logos/wordtune.png',
  'wordtune.com': '/logos/wordtune.png',
  spline: '/logos/spline.png',
  'spline.design': '/logos/spline.png',
  meshy: '/logos/meshy.png',
  'meshy.ai': '/logos/meshy.png',
  tripo: '/logos/tripo.png',
  'tripo3d.ai': '/logos/tripo.png',
  'luma-genie': '/logos/luma.png',
  luma: '/logos/luma.png',
  'lumalabs.ai': '/logos/luma.png',
}

function keysOf(name: string, target = '') {
  const keys = [name, name.trim().toLowerCase(), name.replace(/\s+/g, '').toLowerCase()]
  try {
    if (/^https?:/i.test(target)) {
      keys.push(new URL(target).hostname.replace(/^www\./, ''))
    }
  } catch {
    /* ignore */
  }
  return keys
}

export function logoSrc(name: string, target = '') {
  for (const key of keysOf(name, target)) {
    if (FILES[key]) return FILES[key]
  }
  try {
    if (/^https?:/i.test(target)) {
      const host = new URL(target).hostname.replace(/^www\./, '')
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`
    }
  } catch {
    /* ignore */
  }
  return '/logos/gate.svg'
}
