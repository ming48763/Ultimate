export type View = 'home' | 'console' | 'notes' | 'learn' | 'portal' | 'intel' | 'traces'

export type ChatSummary = {
  id: string
  title: string
  project: string
  updatedAt: string
  turns: number
  preview: string
}

export type GitInfo = {
  available: boolean
  remote: string
  host: string
  branch: string
  dirty: boolean
  lastCommit: string
  lastCommitAt: string
  commitCount: number
  recent: { hash: string; date: string; subject: string }[]
}

export type Todo = {
  id: string
  project: string
  text: string
  done: boolean
  createdAt: string
}

export type Journal = {
  id: string
  project: string
  date: string
  body: string
  createdAt: string
}

export type Milestone = {
  id: string
  project: string
  name: string
  kind: 'named' | 'push'
  gitHash: string
  gitSubject: string
  note: string
  createdAt: string
}

export type DevLog = {
  id: string
  project: string
  date: string
  title?: string
  bullets: string[]
  createdAt: string
}

export type Deploy = {
  github: string
  vercel: string
  render: string
  mongo: string
  other: string
  status: string
}

export const PHASE_NAMES = [
  '需求與架構規劃',
  'UI刻版與元件化',
  '功能開發與API串接',
  '測試與效能最佳化',
  '部署與監控維運',
] as const

export type PhaseStatus = 'idle' | 'doing' | 'done'
export type ProjectPhase = { status: PhaseStatus; note: string }
export type GradeFeature = { id: string; name: string; done?: boolean }
export type GradePart = { id: string; name: string; done?: boolean; features: GradeFeature[] }
export type GradeCore = { id: string; name: string; parts: GradePart[] }

export function partLit(part: { features: GradeFeature[] }): boolean {
  return part.features.length > 0 && part.features.every((item) => Boolean(item.done))
}

export function gradeProgress(grades?: GradeCore[]): number {
  const features = (grades ?? []).flatMap((core) => core.parts.flatMap((part) => part.features))
  if (!features.length) return 0
  return Math.round((features.filter((item) => item.done).length / features.length) * 100)
}

export type ProjectCard = {
  id: string
  name: string
  folder: string | null
  chatCount: number
  lastActive: string | null
  chats: ChatSummary[]
  git: GitInfo | null
  todos: Todo[]
  journals: Journal[]
  milestones: Milestone[]
  logs: DevLog[]
  meta: {
    id: string
    summary: string
    progress: number | null
    digestAt?: string
    digestSeeded?: boolean
    deploy: Deploy
    grades?: GradeCore[]
    phases?: ProjectPhase[]
  }
  progress: number
}

export type Overview = {
  projects: ProjectCard[]
  activity: { project: string; date: string; count: number }[]
}

export type Note = {
  id: string
  title: string
  body: string
  media: string[]
  analysis: string
  matches: { title: string; href: string; snippet: string }[]
  createdAt: string
  updatedAt: string
}

export type Resource = {
  id: string
  title: string
  url: string
  description: string
  excerpt: string
  image: string
  kind: string
  tags: string[]
  status: 'inbox' | 'saved' | 'dismissed'
  analysis: string
  createdAt: string
}

export type TraceTask = {
  id: string
  title: string
  note: string
  lane: 'inbox' | 'doing' | 'done'
  createdAt: string
}

export type PromptItem = {
  id: string
  title: string
  body: string
  category: string
  note: string
  rating: number
  correction: string
  favorite: boolean
  createdAt: string
  updatedAt: string
}

export type LayoutRecord = {
  id: string
  url: string
  name: string
  kind: string
  note: string
  createdAt: string
  updatedAt: string
}

export type Portal = {
  id: string
  name: string
  target: string
  group: string
  mark: string
  hint?: string
}

export type Settings = {
  provider: 'openai' | 'gemini'
  apiKey: string
  model: string
  apiBase: string
  hasKey: boolean
}
