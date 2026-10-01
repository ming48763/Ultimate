import type { DevLog, GradeCore, LayoutRecord, Note, Overview, Portal, ProjectPhase, PromptItem, Resource, Settings, StudyNote, TraceTask } from './types'
import type { MotionMacro } from './motion'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body) headers.set('Content-Type', 'application/json')
  const res = await fetch(url, {
    ...init,
    headers,
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || '請求失敗')
  return data
}

export const api = {
  overview: () => request<Overview>('/api/overview'),
  chat: (id: string) => request<{ title: string; messages: { role: string; text: string }[] }>(`/api/chats/${id}`),
  settings: () => request<Settings>('/api/settings'),
  saveSettings: (body: Partial<Settings>) => request('/api/settings', { method: 'PUT', body: JSON.stringify(body) }),
  saveProject: (id: string, body: unknown) => request(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  composeAgentPrompt: (id: string, body: { kind: 'architecture' | 'feasibility'; grades: GradeCore[]; phases: ProjectPhase[] }) =>
    request<{ prompt: string; saved?: boolean }>(`/api/projects/${id}/agent-prompt`, { method: 'POST', body: JSON.stringify(body) }),
  digestProject: (id: string, mode: 'since' | 'full' = 'since') =>
    request<{ logs: DevLog[]; digestAt: string; empty: boolean; raw?: string; needFull?: boolean }>(
      `/api/projects/${id}/digest`,
      { method: 'POST', body: JSON.stringify({ mode }) },
    ),
  saveDevLog: (id: string, body: { title?: string; bullets?: string[] }) =>
    request<DevLog>(`/api/dev-logs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  addTodo: (project: string, text: string, done = false) =>
    request('/api/todos', { method: 'POST', body: JSON.stringify({ project, text, done }) }),
  toggleTodo: (id: string, done: boolean) => request(`/api/todos/${id}`, { method: 'PATCH', body: JSON.stringify({ done }) }),
  removeTodo: (id: string) => request(`/api/todos/${id}`, { method: 'DELETE' }),
  addJournal: (project: string, date: string, body: string) =>
    request('/api/journals', { method: 'POST', body: JSON.stringify({ project, date, body }) }),
  removeJournal: (id: string) => request(`/api/journals/${id}`, { method: 'DELETE' }),
  addMilestone: (body: unknown) => request('/api/milestones', { method: 'POST', body: JSON.stringify(body) }),
  milestoneFromGit: (body: unknown) => request('/api/milestones/from-git', { method: 'POST', body: JSON.stringify(body) }),
  removeMilestone: (id: string) => request(`/api/milestones/${id}`, { method: 'DELETE' }),
  notes: () => request<Note[]>('/api/notes'),
  addNote: (title: string, body: string, media: string[]) =>
    request<Note>('/api/notes', { method: 'POST', body: JSON.stringify({ title, body, media }) }),
  saveNote: (id: string, body: unknown) => request<Note>(`/api/notes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  removeNote: (id: string) => request(`/api/notes/${id}`, { method: 'DELETE' }),
  analyzeNote: (id: string) => request<Note>(`/api/notes/${id}/analyze`, { method: 'POST' }),
  studyNotes: () => request<StudyNote[]>('/api/study-notes'),
  addStudyNote: (title: string, body = '', resourceIds: string[] = [], tags: string[] = [], layout: 'single' | 'spread' = 'single') =>
    request<StudyNote>('/api/study-notes', { method: 'POST', body: JSON.stringify({ title, body, resourceIds, tags, layout }) }),
  saveStudyNote: (id: string, body: unknown) =>
    request<StudyNote>(`/api/study-notes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  removeStudyNote: (id: string) => request(`/api/study-notes/${id}`, { method: 'DELETE' }),
  resources: () => request<Resource[]>('/api/resources'),
  ingest: (url: string, tags: string[]) =>
    request<Resource>('/api/resources/ingest', { method: 'POST', body: JSON.stringify({ url, tags }) }),
  patchResource: (id: string, body: unknown) =>
    request<Resource>(`/api/resources/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  removeResource: (id: string) => request(`/api/resources/${id}`, { method: 'DELETE' }),
  refreshResourceImage: (id: string) => request<Resource>(`/api/resources/${id}/image`, { method: 'POST' }),
  analyzeResource: (id: string) => request<Resource>(`/api/resources/${id}/analyze`, { method: 'POST' }),
  fetchResourceCaptions: (id: string) => request<Resource>(`/api/resources/${id}/captions`, { method: 'POST' }),
  similar: (query: string, tags: string[]) =>
    request<{ title: string; href: string; snippet: string }[]>('/api/resources/similar', {
      method: 'POST',
      body: JSON.stringify({ query, tags }),
    }),
  prompts: () => request<PromptItem[]>('/api/prompts'),
  addPrompt: (body: unknown) => request<PromptItem>('/api/prompts', { method: 'POST', body: JSON.stringify(body) }),
  savePrompt: (id: string, body: unknown) =>
    request<PromptItem>(`/api/prompts/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  removePrompt: (id: string) => request(`/api/prompts/${id}`, { method: 'DELETE' }),
  motions: () => request<MotionMacro[]>('/api/motions'),
  saveMotion: (body: unknown) => request<MotionMacro>('/api/motions', { method: 'POST', body: JSON.stringify(body) }),
  layouts: () => request<LayoutRecord[]>('/api/layouts'),
  addLayout: (body: unknown) => request<LayoutRecord>('/api/layouts', { method: 'POST', body: JSON.stringify(body) }),
  saveLayout: (id: string, body: unknown) =>
    request<LayoutRecord>(`/api/layouts/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  removeLayout: (id: string) => request(`/api/layouts/${id}`, { method: 'DELETE' }),
  traces: () => request<TraceTask[]>('/api/traces'),
  addTrace: (body: unknown) => request<TraceTask>('/api/traces', { method: 'POST', body: JSON.stringify(body) }),
  patchTrace: (id: string, body: unknown) =>
    request<TraceTask>(`/api/traces/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  removeTrace: (id: string) => request(`/api/traces/${id}`, { method: 'DELETE' }),
  portals: () => request<Portal[]>('/api/portals'),
  addPortal: (body: unknown) => request<Portal>('/api/portals', { method: 'POST', body: JSON.stringify(body) }),
  patchPortal: (id: string, body: unknown) =>
    request<Portal>(`/api/portals/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  removePortal: (id: string) => request(`/api/portals/${id}`, { method: 'DELETE' }),
  openPortal: (id: string) => request(`/api/portals/${id}/open`, { method: 'POST' }),
  intel: () => request<Portal[]>('/api/intel'),
  addIntel: (body: unknown) => request<Portal>('/api/intel', { method: 'POST', body: JSON.stringify(body) }),
  patchIntel: (id: string, body: unknown) =>
    request<Portal>(`/api/intel/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  removeIntel: (id: string) => request(`/api/intel/${id}`, { method: 'DELETE' }),
  openIntel: (id: string) => request(`/api/intel/${id}/open`, { method: 'POST' }),
  starCats: (hub: string) => request<{ extra: string[]; hidden: string[] }>(`/api/star-cats/${encodeURIComponent(hub)}`),
  saveStarCats: (hub: string, body: { extra: string[]; hidden: string[] }) =>
    request<{ extra: string[]; hidden: string[] }>(`/api/star-cats/${encodeURIComponent(hub)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
}

export async function uploadFile(file: File) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/upload', { method: 'POST', body: form })
  const data = (await res.json()) as { url?: string; error?: string }
  if (!res.ok) throw new Error(data.error || '上傳失敗')
  return data.url as string
}
