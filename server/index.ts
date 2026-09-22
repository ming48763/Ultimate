import cors from 'cors'
import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import multer from 'multer'
import { INTEL_SEED } from '../src/lib/intel.ts'
import {
  analyzeNote,
  analyzeResource,
  DIGEST_TAG_RE,
  digestBulletKey,
  digestProjectLog,
  fetchPage,
  groupDigestBullets,
  parseDigestDays,
  webSearch,
} from './ai.ts'
import { collectDigestSource, scanWorkspace, readGit } from './scan.ts'
import { dataDir, nowIso, readJson, uid, uploadDir, writeJson } from './store.ts'
import { PHASE_NAMES, gradeProgress, type GradeCore, type PhaseStatus, type ProjectPhase } from '../src/lib/types.ts'

const root = path.resolve(dataDir, '..')

function stripQuotes(value: string) {
  const text = value.trim()
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1)
  }
  return text
}

async function readDotEnv() {
  try {
    const raw = await fs.readFile(path.join(root, '.env'), 'utf8')
    const map: Record<string, string> = {}
    for (const line of raw.split(/\r?\n/)) {
      const text = line.trim()
      if (!text || text.startsWith('#')) continue
      const at = text.indexOf('=')
      if (at < 0) continue
      map[text.slice(0, at).trim()] = stripQuotes(text.slice(at + 1))
    }
    return map
  } catch {
    return {} as Record<string, string>
  }
}

async function loadSettings() {
  const env = await readDotEnv()
  const settings = await readJson<Settings>('settings.json', defaultSettings)
  const key = env.GEMINI_API_KEY || env.OPENAI_API_KEY || env.API_KEY || settings.apiKey
  return {
    ...settings,
    provider: env.GEMINI_API_KEY ? 'gemini' : settings.provider,
    apiKey: key,
    model: env.GEMINI_MODEL || settings.model,
  }
}

type Settings = {
  provider: 'openai' | 'gemini'
  apiKey: string
  model: string
  apiBase: string
}

type Todo = {
  id: string
  project: string
  text: string
  done: boolean
  createdAt: string
}

type Journal = {
  id: string
  project: string
  date: string
  body: string
  createdAt: string
}

type Milestone = {
  id: string
  project: string
  name: string
  kind: 'named' | 'push'
  gitHash: string
  gitSubject: string
  note: string
  createdAt: string
}

type ProjectMeta = {
  id: string
  summary: string
  progress: number | null
  digestAt: string
  digestSeeded: boolean
  deploy: {
    github: string
    vercel: string
    render: string
    mongo: string
    other: string
    status: string
  }
  grades: GradeCore[]
  phases: ProjectPhase[]
}

function defaultPhases(): ProjectPhase[] {
  return PHASE_NAMES.map(() => ({ status: 'idle' as const, note: '' }))
}

function parseGrades(raw: unknown): GradeCore[] {
  if (!Array.isArray(raw)) return []
  const features = (list: unknown) =>
    Array.isArray(list)
      ? list.slice(0, 80).map((item) => {
          const row = item as { id?: string; name?: string; done?: unknown }
          return {
            id: String(row.id || uid()),
            name: String(row.name || '').slice(0, 80),
            done: Boolean(row.done),
          }
        })
      : []
  return raw.slice(0, 80).map((item) => {
    const row = item as { id?: string; name?: string; parts?: unknown }
    return {
      id: String(row.id || uid()),
      name: String(row.name || '').slice(0, 80),
      parts: Array.isArray(row.parts)
        ? row.parts.slice(0, 80).map((part) => {
            const node = part as { id?: string; name?: string; done?: unknown; features?: unknown }
            return {
              id: String(node.id || uid()),
              name: String(node.name || '').slice(0, 80),
              done: Boolean(node.done),
              features: features(node.features),
            }
          })
        : [],
    }
  })
}

function parsePhases(raw: unknown, fallback: ProjectPhase[] = defaultPhases()): ProjectPhase[] {
  const allowed: PhaseStatus[] = ['idle', 'doing', 'done']
  return PHASE_NAMES.map((_, index) => {
    const row = Array.isArray(raw) ? (raw[index] as { status?: string; note?: string } | undefined) : undefined
    const status = allowed.includes(row?.status as PhaseStatus) ? (row?.status as PhaseStatus) : fallback[index]?.status ?? 'idle'
    return { status, note: String(row?.note ?? fallback[index]?.note ?? '').slice(0, 400) }
  })
}

type DevLog = {
  id: string
  project: string
  date: string
  title?: string
  bullets: string[]
  createdAt: string
}

type Note = {
  id: string
  title: string
  body: string
  media: string[]
  analysis: string
  matches: { title: string; href: string; snippet: string }[]
  createdAt: string
  updatedAt: string
}

type Resource = {
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

type PromptItem = {
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

type MotionMacro = {
  id: string
  name: string
  kind: 'single' | 'local' | 'transit'
  blurb: string
  source: string
  html: string
  css: string
}

type LayoutRecord = {
  id: string
  url: string
  name: string
  kind: string
  note: string
  createdAt: string
  updatedAt: string
}

type TraceTask = {
  id: string
  title: string
  note: string
  lane: 'inbox' | 'doing' | 'done'
  createdAt: string
}

type Portal = {
  id: string
  name: string
  target: string
  group: string
  mark: string
  hint?: string
}

const defaultSettings: Settings = {
  provider: 'gemini',
  apiKey: '',
  model: 'gemini-3.6-flash',
  apiBase: 'https://api.openai.com/v1',
}

const defaultPortals: Portal[] = [
  { id: 'github', name: 'GitHub', target: 'https://github.com/ming48763', group: '託管', mark: 'GH' },
  { id: 'vercel', name: 'Vercel', target: 'https://vercel.com', group: '部署', mark: '▲' },
  { id: 'render', name: 'Render', target: 'https://dashboard.render.com', group: '部署', mark: 'Rd' },
  { id: 'mongo', name: 'MongoDB', target: 'https://cloud.mongodb.com', group: '資料', mark: 'M' },
  { id: 'cursor', name: 'Cursor', target: 'https://cursor.com', group: '開發', mark: 'Cu' },
  { id: 'railway', name: 'Railway', target: 'https://railway.app', group: '部署', mark: 'Rw' },
]

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname)
      cb(null, `${Date.now()}-${uid().slice(0, 8)}${ext}`)
    },
  }),
})

async function loadAll() {
  const [settings, todos, journals, milestones, metas, notes, resources, prompts, portals] = await Promise.all([
    readJson<Settings>('settings.json', defaultSettings),
    readJson<Todo[]>('todos.json', []),
    readJson<Journal[]>('journals.json', []),
    readJson<Milestone[]>('milestones.json', []),
    readJson<ProjectMeta[]>('projects.json', []),
    readJson<Note[]>('notes.json', []),
    readJson<Resource[]>('resources.json', []),
    readJson<PromptItem[]>('prompts.json', []),
    readJson<Portal[]>('portals.json', defaultPortals),
  ])
  return { settings, todos, journals, milestones, metas, notes, resources, prompts, portals }
}

const app = express()
app.use(cors())
app.use(express.json({ limit: '8mb' }))
app.use('/uploads', express.static(uploadDir))

app.get('/api/overview', async (_req, res) => {
  const scanned = await scanWorkspace()
  const { todos, journals, milestones, metas } = await loadAll()
  const logs = await readJson<DevLog[]>('dev-logs.json', [])
  const projects = scanned.map((project) => {
    const meta = metas.find((item) => item.id === project.id)
    const projectTodos = todos.filter((todo) => todo.project === project.id)
    const resolved = meta ?? {
      id: project.id,
      summary: '',
      progress: null,
      digestAt: '',
      digestSeeded: false,
      deploy: { github: project.git?.remote || '', vercel: '', render: '', mongo: '', other: '', status: 'local' },
      grades: [],
      phases: defaultPhases(),
    }
    return {
      id: project.id,
      name: project.name,
      folder: project.folder,
      workspaces: project.workspaces,
      chatCount: project.chats.length,
      lastActive: project.chats[0]?.updatedAt ?? project.git?.lastCommitAt ?? null,
      chats: project.chats.slice(0, 12).map(({ path: _path, workspace: _workspace, ...chat }) => chat),
      git: project.git,
      todos: projectTodos,
      journals: journals.filter((item) => item.project === project.id),
      milestones: milestones.filter((item) => item.project === project.id),
      logs: logs.filter((item) => item.project === project.id),
      meta: {
        ...resolved,
        grades: resolved.grades ?? [],
        phases: parsePhases(resolved.phases),
      },
      progress: gradeProgress(resolved.grades),
    }
  })

  const activityMap = new Map<string, number>()
  for (const project of scanned) {
    for (const chat of project.chats) {
      const day = chat.updatedAt.slice(0, 10)
      const key = `${project.id}|${day}`
      activityMap.set(key, (activityMap.get(key) || 0) + 1)
    }
  }
  const activity = [...activityMap.entries()].map(([key, count]) => {
    const [project, date] = key.split('|')
    return { project, date, count }
  })

  res.json({ projects, activity, todos, journals, milestones })
})

app.get('/api/chats/:id', async (req, res) => {
  const scanned = await scanWorkspace()
  for (const project of scanned) {
    const chat = project.chats.find((item) => item.id === req.params.id)
    if (!chat) continue
    try {
      const raw = await fs.readFile(chat.path, 'utf8')
      const messages = raw
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line) as { role?: string; message?: { content?: unknown } }
          } catch {
            return null
          }
        })
        .filter(Boolean)
        .filter((entry) => entry && (entry.role === 'user' || entry.role === 'assistant'))
        .map((entry) => {
          const content = entry!.message?.content
          const text = Array.isArray(content)
            ? content
                .map((block) => (block && typeof block === 'object' && 'text' in block ? String(block.text) : ''))
                .join('\n')
            : String(content ?? '')
          const query = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/)
          return {
            role: entry!.role,
            text: (query?.[1] || text.replace(/<[^>]+>/g, ' ')).trim().slice(0, 4000),
          }
        })
      res.json({ ...chat, messages })
      return
    } catch {
      res.status(404).json({ error: '讀取對話失敗' })
      return
    }
  }
  res.status(404).json({ error: '找不到這則對話' })
})

app.get('/api/settings', async (_req, res) => {
  const settings = await loadSettings()
  res.json({ ...settings, apiKey: settings.apiKey ? '••••••••' : '', hasKey: Boolean(settings.apiKey) })
})

app.put('/api/settings', async (req, res) => {
  const current = await readJson<Settings>('settings.json', defaultSettings)
  const next: Settings = {
    provider: req.body.provider === 'openai' ? 'openai' : 'gemini',
    apiKey: typeof req.body.apiKey === 'string' && req.body.apiKey && !req.body.apiKey.includes('•') ? req.body.apiKey : current.apiKey,
    model: req.body.model || current.model,
    apiBase: req.body.apiBase || current.apiBase,
  }
  await writeJson('settings.json', next)
  res.json({ ok: true, hasKey: Boolean((await loadSettings()).apiKey) })
})

app.put('/api/projects/:id', async (req, res) => {
  const metas = await readJson<ProjectMeta[]>('projects.json', [])
  const current = metas.find((item) => item.id === req.params.id)
  const next: ProjectMeta = {
    id: req.params.id,
    summary: req.body.summary ?? current?.summary ?? '',
    progress: typeof req.body.progress === 'number' ? req.body.progress : (current?.progress ?? null),
    digestAt: typeof req.body.digestAt === 'string' ? req.body.digestAt : (current?.digestAt ?? ''),
    digestSeeded: typeof req.body.digestSeeded === 'boolean' ? req.body.digestSeeded : Boolean(current?.digestSeeded),
    deploy: {
      github: req.body.deploy?.github ?? current?.deploy.github ?? '',
      vercel: req.body.deploy?.vercel ?? current?.deploy.vercel ?? '',
      render: req.body.deploy?.render ?? current?.deploy.render ?? '',
      mongo: req.body.deploy?.mongo ?? current?.deploy.mongo ?? '',
      other: req.body.deploy?.other ?? current?.deploy.other ?? '',
      status: req.body.deploy?.status ?? current?.deploy.status ?? 'local',
    },
    grades: Array.isArray(req.body.grades) ? parseGrades(req.body.grades) : (current?.grades ?? []),
    phases: Array.isArray(req.body.phases) ? parsePhases(req.body.phases, current?.phases) : parsePhases(current?.phases),
  }
  const list = [...metas.filter((item) => item.id !== req.params.id), next]
  await writeJson('projects.json', list)
  res.json(next)
})

app.post('/api/projects/:id/digest', async (req, res) => {
  const scanned = await scanWorkspace()
  const project = scanned.find((item) => item.id === req.params.id)
  if (!project) {
    res.status(404).json({ error: '找不到專案' })
    return
  }
  const settings = await loadSettings()
  const metas = await readJson<ProjectMeta[]>('projects.json', [])
  const current = metas.find((item) => item.id === project.id)
  const full = req.body?.mode === 'full'
  const sinceStamp = current?.digestAt || ''
  if (!full && !sinceStamp) {
    res.json({
      logs: await readJson<DevLog[]>('dev-logs.json', []).then((list) => list.filter((item) => item.project === project.id)),
      digestAt: '',
      empty: true,
      needFull: true,
    })
    return
  }
  const since = full ? '' : sinceStamp
  const source = await collectDigestSource(project, since || null)
  if (!source.git.length && !source.chats.length) {
    res.json({
      logs: await readJson<DevLog[]>('dev-logs.json', []).then((list) => list.filter((item) => item.project === project.id)),
      digestAt: since,
      empty: true,
    })
    return
  }
  try {
    const text = await digestProjectLog(settings, {
      name: project.name,
      since: since || null,
      git: source.git,
      chats: source.chats,
    })
    const days = parseDigestDays(text)
    if (!days.length && text.trim() && !/沒有新的/.test(text)) {
      days.push({
        date: nowIso().slice(0, 10),
        bullets: groupDigestBullets(
          text
            .trim()
            .split('\n')
            .map((line) => line.replace(/^\s*[-*#]+\s*/, '').trim())
            .filter(Boolean)
            .slice(0, 16),
        ),
      })
    }
    const stamp = nowIso()
    const seeded = true
    const logs = await readJson<DevLog[]>('dev-logs.json', [])
    for (const day of days) {
      const existing = logs.find((item) => item.project === project.id && item.date === day.date)
      const grouped = groupDigestBullets(day.bullets)
      if (existing) {
        if (full) {
          existing.bullets = grouped
        } else {
          const seen = new Map(existing.bullets.map((bullet) => [digestBulletKey(bullet), bullet]))
          for (const bullet of grouped) {
            const key = digestBulletKey(bullet)
            const prev = seen.get(key)
            if (!prev) {
              existing.bullets.push(bullet)
              seen.set(key, bullet)
              continue
            }
            if (!DIGEST_TAG_RE.test(prev) && DIGEST_TAG_RE.test(bullet)) {
              existing.bullets[existing.bullets.indexOf(prev)] = bullet
              seen.set(key, bullet)
            }
          }
          if (grouped.some((bullet) => DIGEST_TAG_RE.test(bullet))) {
            existing.bullets = existing.bullets.filter((bullet) => DIGEST_TAG_RE.test(bullet))
          }
          existing.bullets = groupDigestBullets(existing.bullets)
        }
      } else {
        logs.unshift({
          id: uid(),
          project: project.id,
          date: day.date,
          title: '',
          bullets: grouped,
          createdAt: stamp,
        })
      }
    }
    await writeJson('dev-logs.json', logs)
    const next: ProjectMeta = {
      id: project.id,
      summary: current?.summary ?? '',
      progress: current?.progress ?? null,
      digestAt: stamp,
      digestSeeded: seeded,
      deploy: current?.deploy ?? { github: project.git?.remote || '', vercel: '', render: '', mongo: '', other: '', status: 'local' },
      grades: current?.grades ?? [],
      phases: parsePhases(current?.phases),
    }
    await writeJson('projects.json', [...metas.filter((item) => item.id !== project.id), next])
    res.json({
      logs: logs.filter((item) => item.project === project.id),
      digestAt: stamp,
      empty: !days.length,
      raw: days.length ? '' : text,
    })
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : '整理失敗' })
  }
})

app.patch('/api/dev-logs/:id', async (req, res) => {
  const logs = await readJson<DevLog[]>('dev-logs.json', [])
  const item = logs.find((log) => log.id === req.params.id)
  if (!item) {
    res.status(404).json({ error: '找不到這則日誌' })
    return
  }
  if (typeof req.body.title === 'string') item.title = req.body.title.trim()
  if (Array.isArray(req.body.bullets)) {
    item.bullets = req.body.bullets.map((bullet: unknown) => String(bullet).trim()).filter(Boolean)
  }
  await writeJson('dev-logs.json', logs)
  res.json(item)
})

app.post('/api/todos', async (req, res) => {
  const todos = await readJson<Todo[]>('todos.json', [])
  const item: Todo = {
    id: uid(),
    project: String(req.body.project || ''),
    text: String(req.body.text || '').trim(),
    done: Boolean(req.body.done),
    createdAt: nowIso(),
  }
  if (!item.project || !item.text) {
    res.status(400).json({ error: '需要專案與內容' })
    return
  }
  todos.unshift(item)
  await writeJson('todos.json', todos)
  res.json(item)
})

app.patch('/api/todos/:id', async (req, res) => {
  const todos = await readJson<Todo[]>('todos.json', [])
  const item = todos.find((todo) => todo.id === req.params.id)
  if (!item) {
    res.status(404).json({ error: '找不到待辦' })
    return
  }
  if (typeof req.body.done === 'boolean') item.done = req.body.done
  if (typeof req.body.text === 'string') item.text = req.body.text
  await writeJson('todos.json', todos)
  res.json(item)
})

app.delete('/api/todos/:id', async (req, res) => {
  const todos = await readJson<Todo[]>('todos.json', [])
  await writeJson(
    'todos.json',
    todos.filter((todo) => todo.id !== req.params.id),
  )
  res.json({ ok: true })
})

app.post('/api/journals', async (req, res) => {
  const journals = await readJson<Journal[]>('journals.json', [])
  const item: Journal = {
    id: uid(),
    project: String(req.body.project || ''),
    date: String(req.body.date || nowIso().slice(0, 10)),
    body: String(req.body.body || '').trim(),
    createdAt: nowIso(),
  }
  if (!item.project || !item.body) {
    res.status(400).json({ error: '需要專案與內容' })
    return
  }
  journals.unshift(item)
  await writeJson('journals.json', journals)
  res.json(item)
})

app.delete('/api/journals/:id', async (req, res) => {
  const journals = await readJson<Journal[]>('journals.json', [])
  await writeJson(
    'journals.json',
    journals.filter((item) => item.id !== req.params.id),
  )
  res.json({ ok: true })
})

app.post('/api/milestones', async (req, res) => {
  const milestones = await readJson<Milestone[]>('milestones.json', [])
  const item: Milestone = {
    id: uid(),
    project: String(req.body.project || ''),
    name: String(req.body.name || '').trim(),
    kind: req.body.kind === 'push' ? 'push' : 'named',
    gitHash: String(req.body.gitHash || ''),
    gitSubject: String(req.body.gitSubject || ''),
    note: String(req.body.note || ''),
    createdAt: nowIso(),
  }
  if (!item.project || !item.name) {
    res.status(400).json({ error: '需要專案與名稱' })
    return
  }
  milestones.unshift(item)
  await writeJson('milestones.json', milestones)
  res.json(item)
})

app.post('/api/milestones/from-git', async (req, res) => {
  const folder = String(req.body.folder || '')
  const project = String(req.body.project || '')
  const name = String(req.body.name || '').trim()
  if (!folder || !project || !name) {
    res.status(400).json({ error: '需要專案、資料夾與名稱' })
    return
  }
  const git = await readGit(folder)
  const milestones = await readJson<Milestone[]>('milestones.json', [])
  const item: Milestone = {
    id: uid(),
    project,
    name,
    kind: 'push',
    gitHash: git?.recent[0]?.hash || '',
    gitSubject: git?.recent[0]?.subject || git?.lastCommit || '',
    note: String(req.body.note || ''),
    createdAt: nowIso(),
  }
  milestones.unshift(item)
  await writeJson('milestones.json', milestones)
  res.json(item)
})

app.delete('/api/milestones/:id', async (req, res) => {
  const milestones = await readJson<Milestone[]>('milestones.json', [])
  await writeJson(
    'milestones.json',
    milestones.filter((item) => item.id !== req.params.id),
  )
  res.json({ ok: true })
})

app.get('/api/notes', async (_req, res) => {
  res.json(await readJson<Note[]>('notes.json', []))
})

app.post('/api/notes', async (req, res) => {
  const notes = await readJson<Note[]>('notes.json', [])
  const item: Note = {
    id: uid(),
    title: String(req.body.title || '未命名靈感').trim(),
    body: String(req.body.body || ''),
    media: Array.isArray(req.body.media) ? req.body.media : [],
    analysis: '',
    matches: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  notes.unshift(item)
  await writeJson('notes.json', notes)
  res.json(item)
})

app.put('/api/notes/:id', async (req, res) => {
  const notes = await readJson<Note[]>('notes.json', [])
  const item = notes.find((note) => note.id === req.params.id)
  if (!item) {
    res.status(404).json({ error: '找不到筆記' })
    return
  }
  if (typeof req.body.title === 'string') item.title = req.body.title
  if (typeof req.body.body === 'string') item.body = req.body.body
  if (Array.isArray(req.body.media)) item.media = req.body.media
  item.updatedAt = nowIso()
  await writeJson('notes.json', notes)
  res.json(item)
})

app.delete('/api/notes/:id', async (req, res) => {
  const notes = await readJson<Note[]>('notes.json', [])
  await writeJson(
    'notes.json',
    notes.filter((note) => note.id !== req.params.id),
  )
  res.json({ ok: true })
})

app.post('/api/notes/:id/analyze', async (req, res) => {
  const notes = await readJson<Note[]>('notes.json', [])
  const item = notes.find((note) => note.id === req.params.id)
  if (!item) {
    res.status(404).json({ error: '找不到筆記' })
    return
  }
  const settings = await loadSettings()
  try {
    const result = await analyzeNote(settings, item)
    item.analysis = result.analysis
    item.matches = result.matches
    item.updatedAt = nowIso()
    await writeJson('notes.json', notes)
    res.json(item)
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : '分析失敗' })
  }
})

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: '沒有檔案' })
    return
  }
  res.json({ url: `/uploads/${req.file.filename}`, name: req.file.originalname })
})

app.get('/api/resources', async (_req, res) => {
  res.json(await readJson<Resource[]>('resources.json', []))
})

app.post('/api/resources/ingest', async (req, res) => {
  const url = String(req.body.url || '').trim()
  if (!url) {
    res.status(400).json({ error: '需要網址' })
    return
  }
  try {
    const page = await fetchPage(url)
    const resources = await readJson<Resource[]>('resources.json', [])
    const item: Resource = {
      id: uid(),
      title: page.title,
      url: page.url,
      description: page.description,
      excerpt: page.excerpt,
      image: page.image,
      kind: page.kind,
      tags: Array.isArray(req.body.tags) ? req.body.tags : [],
      status: 'inbox',
      analysis: '',
      createdAt: nowIso(),
    }
    resources.unshift(item)
    await writeJson('resources.json', resources)
    res.json(item)
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : '擷取失敗' })
  }
})

app.patch('/api/resources/:id', async (req, res) => {
  const resources = await readJson<Resource[]>('resources.json', [])
  const item = resources.find((resource) => resource.id === req.params.id)
  if (!item) {
    res.status(404).json({ error: '找不到資源' })
    return
  }
  if (Array.isArray(req.body.tags)) item.tags = req.body.tags
  if (req.body.status === 'inbox' || req.body.status === 'saved' || req.body.status === 'dismissed') {
    item.status = req.body.status
  }
  if (typeof req.body.title === 'string') item.title = req.body.title
  await writeJson('resources.json', resources)
  res.json(item)
})

app.delete('/api/resources/:id', async (req, res) => {
  const resources = await readJson<Resource[]>('resources.json', [])
  await writeJson(
    'resources.json',
    resources.filter((item) => item.id !== req.params.id),
  )
  res.json({ ok: true })
})

app.post('/api/resources/:id/analyze', async (req, res) => {
  const resources = await readJson<Resource[]>('resources.json', [])
  const item = resources.find((resource) => resource.id === req.params.id)
  if (!item) {
    res.status(404).json({ error: '找不到資源' })
    return
  }
  const settings = await loadSettings()
  try {
    item.analysis = await analyzeResource(settings, item)
    await writeJson('resources.json', resources)
    res.json(item)
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : '分析失敗' })
  }
})

app.post('/api/resources/similar', async (req, res) => {
  const seed = String(req.body.query || req.body.title || '').trim()
  const tags = Array.isArray(req.body.tags) ? req.body.tags.join(' ') : ''
  const hits = await webSearch(`${seed} ${tags}`.trim() || 'software development notes', 8)
  res.json(hits)
})

app.get('/api/prompts', async (_req, res) => {
  const prompts = await readJson<PromptItem[]>('prompts.json', [])
  res.json(
    prompts.map((item) => ({
      ...item,
      rating: Math.max(0, Math.min(5, Number(item.rating) || 0)),
      correction: item.correction || '',
      note: item.note || '',
    })),
  )
})

app.post('/api/prompts', async (req, res) => {
  const prompts = await readJson<PromptItem[]>('prompts.json', [])
  const item: PromptItem = {
    id: uid(),
    title: String(req.body.title || '未命名 prompt').trim(),
    body: String(req.body.body || ''),
    category: String(req.body.category || '未分類'),
    note: String(req.body.note || ''),
    rating: Math.max(0, Math.min(5, Number(req.body.rating) || 0)),
    correction: String(req.body.correction || ''),
    favorite: Boolean(req.body.favorite),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  if (!item.body) {
    res.status(400).json({ error: '需要 prompt 內容' })
    return
  }
  prompts.unshift(item)
  await writeJson('prompts.json', prompts)
  res.json(item)
})

app.put('/api/prompts/:id', async (req, res) => {
  const prompts = await readJson<PromptItem[]>('prompts.json', [])
  const item = prompts.find((prompt) => prompt.id === req.params.id)
  if (!item) {
    res.status(404).json({ error: '找不到 prompt' })
    return
  }
  if (typeof req.body.title === 'string') item.title = req.body.title
  if (typeof req.body.body === 'string') item.body = req.body.body
  if (typeof req.body.category === 'string') item.category = req.body.category
  if (typeof req.body.note === 'string') item.note = req.body.note
  if (typeof req.body.correction === 'string') item.correction = req.body.correction
  if (typeof req.body.rating === 'number' || typeof req.body.rating === 'string') {
    item.rating = Math.max(0, Math.min(5, Number(req.body.rating) || 0))
  }
  if (typeof req.body.favorite === 'boolean') item.favorite = req.body.favorite
  item.updatedAt = nowIso()
  await writeJson('prompts.json', prompts)
  res.json(item)
})

app.delete('/api/prompts/:id', async (req, res) => {
  const prompts = await readJson<PromptItem[]>('prompts.json', [])
  await writeJson(
    'prompts.json',
    prompts.filter((item) => item.id !== req.params.id),
  )
  res.json({ ok: true })
})

app.get('/api/portals', async (_req, res) => {
  res.json(await readJson<Portal[]>('portals.json', defaultPortals))
})

app.post('/api/portals', async (req, res) => {
  const portals = await readJson<Portal[]>('portals.json', defaultPortals)
  const item: Portal = {
    id: uid(),
    name: String(req.body.name || '').trim(),
    target: String(req.body.target || '').trim(),
    group: String(req.body.group || '其他'),
    mark: String(req.body.mark || '').slice(0, 3) || '·',
  }
  if (!item.name || !item.target) {
    res.status(400).json({ error: '需要名稱與網址／路徑' })
    return
  }
  portals.push(item)
  await writeJson('portals.json', portals)
  res.json(item)
})

app.patch('/api/portals/:id', async (req, res) => {
  const portals = await readJson<Portal[]>('portals.json', defaultPortals)
  const item = portals.find((portal) => portal.id === req.params.id)
  if (!item) {
    res.status(404).json({ error: '找不到入口' })
    return
  }
  const group = String(req.body.group ?? '').trim()
  if (!('group' in req.body)) {
    res.status(400).json({ error: '需要分組' })
    return
  }
  item.group = group
  await writeJson('portals.json', portals)
  res.json(item)
})

app.delete('/api/portals/:id', async (req, res) => {
  const portals = await readJson<Portal[]>('portals.json', defaultPortals)
  await writeJson(
    'portals.json',
    portals.filter((item) => item.id !== req.params.id),
  )
  res.json({ ok: true })
})

app.post('/api/portals/:id/open', async (req, res) => {
  const portals = await readJson<Portal[]>('portals.json', defaultPortals)
  const item = portals.find((portal) => portal.id === req.params.id)
  if (!item) {
    res.status(404).json({ error: '找不到入口' })
    return
  }
  spawn('cmd', ['/c', 'start', '', item.target], { detached: true, stdio: 'ignore' }).unref()
  res.json({ ok: true })
})

const defaultIntel: Portal[] = INTEL_SEED.map((item) => ({
  id: item.id,
  name: item.name,
  target: item.target,
  group: item.group,
  mark: item.mark || '·',
  hint: item.hint,
}))

app.get('/api/intel', async (_req, res) => {
  res.json(await readJson<Portal[]>('intel.json', defaultIntel))
})

app.post('/api/intel', async (req, res) => {
  const tools = await readJson<Portal[]>('intel.json', defaultIntel)
  const item: Portal = {
    id: uid(),
    name: String(req.body.name || '').trim(),
    target: String(req.body.target || '').trim(),
    group: String(req.body.group || '其他'),
    mark: String(req.body.mark || '').slice(0, 3) || '·',
    hint: String(req.body.hint || '').trim() || undefined,
  }
  if (!item.name || !item.target) {
    res.status(400).json({ error: '需要名稱與網址／路徑' })
    return
  }
  tools.push(item)
  await writeJson('intel.json', tools)
  res.json(item)
})

app.patch('/api/intel/:id', async (req, res) => {
  const tools = await readJson<Portal[]>('intel.json', defaultIntel)
  const item = tools.find((tool) => tool.id === req.params.id)
  if (!item) {
    res.status(404).json({ error: '找不到工具' })
    return
  }
  const group = String(req.body.group ?? '').trim()
  if (!('group' in req.body)) {
    res.status(400).json({ error: '需要分組' })
    return
  }
  item.group = group
  await writeJson('intel.json', tools)
  res.json(item)
})

app.delete('/api/intel/:id', async (req, res) => {
  const tools = await readJson<Portal[]>('intel.json', defaultIntel)
  await writeJson(
    'intel.json',
    tools.filter((item) => item.id !== req.params.id),
  )
  res.json({ ok: true })
})

app.post('/api/intel/:id/open', async (req, res) => {
  const tools = await readJson<Portal[]>('intel.json', defaultIntel)
  const item = tools.find((tool) => tool.id === req.params.id)
  if (!item) {
    res.status(404).json({ error: '找不到工具' })
    return
  }
  spawn('cmd', ['/c', 'start', '', item.target], { detached: true, stdio: 'ignore' }).unref()
  res.json({ ok: true })
})

app.get('/api/traces', async (_req, res) => {
  res.json(await readJson<TraceTask[]>('traces.json', []))
})

app.post('/api/traces', async (req, res) => {
  const tasks = await readJson<TraceTask[]>('traces.json', [])
  const item: TraceTask = {
    id: uid(),
    title: String(req.body.title || '').trim(),
    note: String(req.body.note || '').trim(),
    lane: req.body.lane === 'doing' || req.body.lane === 'done' ? req.body.lane : 'inbox',
    createdAt: nowIso(),
  }
  if (!item.title) {
    res.status(400).json({ error: '需要標題' })
    return
  }
  tasks.unshift(item)
  await writeJson('traces.json', tasks)
  res.json(item)
})

app.patch('/api/traces/:id', async (req, res) => {
  const tasks = await readJson<TraceTask[]>('traces.json', [])
  const item = tasks.find((task) => task.id === req.params.id)
  if (!item) {
    res.status(404).json({ error: '找不到項目' })
    return
  }
  const lane = req.body.lane
  if (lane === 'inbox' || lane === 'doing' || lane === 'done') item.lane = lane
  if (typeof req.body.title === 'string' && req.body.title.trim()) item.title = req.body.title.trim()
  if (typeof req.body.note === 'string') item.note = req.body.note.trim()
  await writeJson('traces.json', tasks)
  res.json(item)
})

app.delete('/api/traces/:id', async (req, res) => {
  const tasks = await readJson<TraceTask[]>('traces.json', [])
  await writeJson(
    'traces.json',
    tasks.filter((item) => item.id !== req.params.id),
  )
  res.json({ ok: true })
})

app.get('/api/star-cats/:hub', async (req, res) => {
  const book = await readJson<Record<string, { extra: string[]; hidden: string[] }>>('star-cats.json', {})
  const hub = decodeURIComponent(req.params.hub)
  res.json(book[hub] || { extra: [], hidden: [] })
})

app.put('/api/star-cats/:hub', async (req, res) => {
  const book = await readJson<Record<string, { extra: string[]; hidden: string[] }>>('star-cats.json', {})
  const hub = decodeURIComponent(req.params.hub)
  const extra = Array.isArray(req.body.extra) ? req.body.extra.map((value: unknown) => String(value).trim()).filter(Boolean) : []
  const hidden = Array.isArray(req.body.hidden) ? req.body.hidden.map((value: unknown) => String(value).trim()).filter(Boolean) : []
  book[hub] = { extra: [...new Set(extra)], hidden: [...new Set(hidden)] }
  await writeJson('star-cats.json', book)
  res.json(book[hub])
})

app.get('/api/motions', async (_req, res) => {
  res.json(await readJson<MotionMacro[]>('motions.json', []))
})

app.post('/api/motions', async (req, res) => {
  const motions = await readJson<MotionMacro[]>('motions.json', [])
  const id = String(req.body.id || '').trim() || uid()
  const item: MotionMacro = {
    id,
    name: String(req.body.name || '').trim() || '未命名動畫',
    kind: req.body.kind === 'local' || req.body.kind === 'transit' ? req.body.kind : 'single',
    blurb: String(req.body.blurb || ''),
    source: String(req.body.source || ''),
    html: String(req.body.html || ''),
    css: String(req.body.css || ''),
  }
  const index = motions.findIndex((motion) => motion.id === id)
  if (index >= 0) motions[index] = item
  else motions.push(item)
  await writeJson('motions.json', motions)
  res.json(item)
})

app.get('/api/layouts', async (_req, res) => {
  res.json(await readJson<LayoutRecord[]>('layouts.json', []))
})

app.post('/api/layouts', async (req, res) => {
  const layouts = await readJson<LayoutRecord[]>('layouts.json', [])
  const item: LayoutRecord = {
    id: uid(),
    url: String(req.body.url || '').trim(),
    name: String(req.body.name || '').trim() || '未命名布局',
    kind: String(req.body.kind || '').trim() || '未分類',
    note: String(req.body.note || '').trim(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  if (!item.url) {
    res.status(400).json({ error: '需要網址' })
    return
  }
  layouts.unshift(item)
  await writeJson('layouts.json', layouts)
  res.json(item)
})

app.put('/api/layouts/:id', async (req, res) => {
  const layouts = await readJson<LayoutRecord[]>('layouts.json', [])
  const item = layouts.find((layout) => layout.id === req.params.id)
  if (!item) {
    res.status(404).json({ error: '找不到布局' })
    return
  }
  if (typeof req.body.url === 'string' && req.body.url.trim()) item.url = req.body.url.trim()
  if (typeof req.body.name === 'string' && req.body.name.trim()) item.name = req.body.name.trim()
  if (typeof req.body.kind === 'string' && req.body.kind.trim()) item.kind = req.body.kind.trim()
  if (typeof req.body.note === 'string') item.note = req.body.note.trim()
  item.updatedAt = nowIso()
  await writeJson('layouts.json', layouts)
  res.json(item)
})

app.delete('/api/layouts/:id', async (req, res) => {
  const layouts = await readJson<LayoutRecord[]>('layouts.json', [])
  await writeJson(
    'layouts.json',
    layouts.filter((item) => item.id !== req.params.id),
  )
  res.json({ ok: true })
})

await fs.mkdir(uploadDir, { recursive: true })
await fs.mkdir(dataDir, { recursive: true })

app.listen(4877, () => {
  console.log('Ultimate server http://127.0.0.1:4877')
})
