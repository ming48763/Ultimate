export type IntelTool = {
  id: string
  name: string
  url: string
  mark: string
  blurb: string
  group: string
}

export const INTEL_GROUPS = ['圖像生成', 'ICON 生成', '音樂生成', '文本式 AI', '3D 建模'] as const

export const INTEL_TOOLS: IntelTool[] = [
  {
    id: 'midjourney',
    name: 'Midjourney',
    url: 'https://www.midjourney.com',
    mark: 'MJ',
    blurb: '風格化概念圖',
    group: '圖像生成',
  },
  {
    id: 'ideogram',
    name: 'Ideogram',
    url: 'https://ideogram.ai',
    mark: 'Ig',
    blurb: '海報與文字入圖',
    group: '圖像生成',
  },
  {
    id: 'recraft',
    name: 'Recraft',
    url: 'https://www.recraft.ai',
    mark: 'Rc',
    blurb: '向量與品牌插畫',
    group: '圖像生成',
  },
  {
    id: 'krea',
    name: 'Krea',
    url: 'https://www.krea.ai',
    mark: 'Kr',
    blurb: '即時圖像迭代',
    group: '圖像生成',
  },
  {
    id: 'iconscout',
    name: 'IconScout AI',
    url: 'https://iconscout.com/ai',
    mark: 'IS',
    blurb: '圖示與插畫生成',
    group: 'ICON 生成',
  },
  {
    id: 'flaticon-ai',
    name: 'Flaticon AI',
    url: 'https://www.flaticon.com/ai',
    mark: 'Fl',
    blurb: '線稿圖示生成',
    group: 'ICON 生成',
  },
  {
    id: 'magician',
    name: 'Magician',
    url: 'https://magician.design',
    mark: 'Mg',
    blurb: 'Figma 圖示法術',
    group: 'ICON 生成',
  },
  {
    id: 'icons8-ai',
    name: 'Icons8 AI',
    url: 'https://icons8.com/icons/ai',
    mark: 'I8',
    blurb: '風格一致的圖示',
    group: 'ICON 生成',
  },
  {
    id: 'suno',
    name: 'Suno',
    url: 'https://suno.com',
    mark: 'Su',
    blurb: '歌曲與人聲生成',
    group: '音樂生成',
  },
  {
    id: 'udio',
    name: 'Udio',
    url: 'https://www.udio.com',
    mark: 'Ud',
    blurb: '完整曲目生成',
    group: '音樂生成',
  },
  {
    id: 'stable-audio',
    name: 'Stable Audio',
    url: 'https://www.stableaudio.com',
    mark: 'SA',
    blurb: '音效與配樂素材',
    group: '音樂生成',
  },
  {
    id: 'soundraw',
    name: 'Soundraw',
    url: 'https://soundraw.io',
    mark: 'Sr',
    blurb: '可商用背景配樂',
    group: '音樂生成',
  },
  {
    id: 'copyai',
    name: 'Copy.ai',
    url: 'https://www.copy.ai',
    mark: 'Cp',
    blurb: '落地頁與行銷文案',
    group: '文本式 AI',
  },
  {
    id: 'jasper',
    name: 'Jasper',
    url: 'https://www.jasper.ai',
    mark: 'Jp',
    blurb: '品牌口吻寫作',
    group: '文本式 AI',
  },
  {
    id: 'deepl-write',
    name: 'DeepL Write',
    url: 'https://www.deepl.com/write',
    mark: 'DL',
    blurb: '句子潤飾與改寫',
    group: '文本式 AI',
  },
  {
    id: 'wordtune',
    name: 'Wordtune',
    url: 'https://www.wordtune.com',
    mark: 'Wt',
    blurb: '短句與微文案改寫',
    group: '文本式 AI',
  },
  {
    id: 'spline',
    name: 'Spline',
    url: 'https://spline.design',
    mark: 'Sp',
    blurb: '網頁 3D 場景',
    group: '3D 建模',
  },
  {
    id: 'meshy',
    name: 'Meshy',
    url: 'https://www.meshy.ai',
    mark: 'Mh',
    blurb: '文字／圖生 3D 模型',
    group: '3D 建模',
  },
  {
    id: 'tripo',
    name: 'Tripo3D',
    url: 'https://www.tripo3d.ai',
    mark: 'Tr',
    blurb: '快速 3D 資產',
    group: '3D 建模',
  },
  {
    id: 'luma-genie',
    name: 'Luma Genie',
    url: 'https://lumalabs.ai/genie',
    mark: 'Lm',
    blurb: '文字生成 3D 物件',
    group: '3D 建模',
  },
]

export const INTEL_SEED = INTEL_TOOLS.map((item) => ({
  id: item.id,
  name: item.name,
  target: item.url,
  group: item.group,
  mark: item.mark,
  hint: item.blurb,
}))
