import type { View } from './types'

export type ModuleId = Exclude<View, 'home'>

export const MODULES: {
  id: ModuleId
  name: string
  en: string
  blurb: string
}[] = [
  { id: 'console', name: '核心', en: 'Console', blurb: '專案進度' },
  { id: 'notes', name: '靈光', en: 'Spark', blurb: '靈感評估' },
  { id: 'learn', name: '學而', en: 'Study', blurb: '學習筆記' },
  { id: 'portal', name: '通道', en: 'Gates', blurb: '開發入口' },
  { id: 'intel', name: '智能', en: 'Craft', blurb: 'AI 工具' },
  { id: 'traces', name: '軌跡', en: 'Prompts', blurb: 'prompt 紀錄' },
]

type SatelliteSeed = {
  id: ModuleId
  name: string
  en: string
  blurb: string
}

const SATELLITE_SEEDS: SatelliteSeed[] = [
  { id: 'notes', name: '靈光', en: 'Spark', blurb: '靈感評估' },
  { id: 'learn', name: '學而', en: 'Study', blurb: '學習筆記' },
  { id: 'intel', name: '智能', en: 'Craft', blurb: 'AI 工具' },
  { id: 'portal', name: '通道', en: 'Gates', blurb: '開發入口' },
  { id: 'traces', name: '軌跡', en: 'Prompts', blurb: 'prompt 紀錄' },
]

function deg(value: number) {
  return `${value}deg`
}

function placeOnOrbit(items: SatelliteSeed[]) {
  const gap = 360 / items.length
  return items.map((item, index) => {
    const rest = 315 + index * gap
    return {
      ...item,
      start: deg(rest - 45),
      rest: deg(rest),
    }
  })
}

export const SATELLITES = placeOnOrbit(SATELLITE_SEEDS)
