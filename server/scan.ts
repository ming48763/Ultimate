import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const projectsRoot = path.join(os.homedir(), 'Desktop', 'Project')
export const cursorProjects = path.join(os.homedir(), '.cursor', 'projects')

export type ChatSummary = {
  id: string
  title: string
  project: string
  workspace: string
  path: string
  updatedAt: string
  createdAt: string
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

export type ScannedProject = {
  id: string
  name: string
  folder: string | null
  workspaces: string[]
  chats: ChatSummary[]
  git: GitInfo | null
}

function stripTags(text: string) {
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractUserQuery(text: string) {
  const match = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/)
  if (match) return match[1].trim()
  return stripTags(text.replace(/<timestamp>[\s\S]*?<\/timestamp>/g, ''))
}

function extractTimestamp(text: string) {
  const match = text.match(/<timestamp>\s*([^<]+)\s*<\/timestamp>/)
  return match?.[1]?.trim() ?? null
}

function textFromMessage(entry: Record<string, unknown>) {
  const message = (entry.message ?? entry) as Record<string, unknown>
  const content = message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (block && typeof block === 'object' && 'text' in block) {
          return String((block as { text?: string }).text ?? '')
        }
        return ''
      })
      .join('\n')
  }
  return ''
}

function nameFromSlug(slug: string) {
  if (slug === 'empty-window' || /Temp/i.test(slug) || /AppData/i.test(slug)) return null
  const lower = slug.toLowerCase()
  for (const marker of ['desktop-project-', 'desktop-']) {
    const index = lower.lastIndexOf(marker)
    if (index >= 0) return slug.slice(index + marker.length)
  }
  return null
}

async function slugFolderExists(slug: string) {
  const candidate = `${path.sep}${slug.replace(/-/g, path.sep)}`
  try {
    const st = await fs.stat(candidate)
    return st.isDirectory()
  } catch {
    return false
  }
}

async function git(cwd: string, args: string[]) {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      windowsHide: true,
      timeout: 8000,
    })
    return stdout.trim()
  } catch {
    return ''
  }
}

function hostFromRemote(remote: string) {
  if (!remote) return ''
  if (remote.includes('github.com')) return 'GitHub'
  if (remote.includes('gitlab.com')) return 'GitLab'
  if (remote.includes('bitbucket.org')) return 'Bitbucket'
  return 'Git'
}

export async function readGit(folder: string): Promise<GitInfo | null> {
  const available = await git(folder, ['rev-parse', '--is-inside-work-tree'])
  if (available !== 'true') return null
  const remote = (await git(folder, ['remote', 'get-url', 'origin'])) || ''
  const branch = (await git(folder, ['rev-parse', '--abbrev-ref', 'HEAD'])) || ''
  const status = await git(folder, ['status', '--porcelain'])
  const last = await git(folder, ['log', '-1', '--pretty=format:%h|%ad|%s', '--date=short'])
  const countRaw = await git(folder, ['rev-list', '--count', 'HEAD'])
  const log = await git(folder, ['log', '-12', '--pretty=format:%h|%ad|%s', '--date=short'])
  const [hash, date, ...rest] = last.split('|')
  return {
    available: true,
    remote,
    host: hostFromRemote(remote),
    branch,
    dirty: Boolean(status),
    lastCommit: rest.join('|') || '',
    lastCommitAt: date || '',
    commitCount: Number(countRaw) || 0,
    recent: log
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [h, d, ...s] = line.split('|')
        return { hash: h, date: d, subject: s.join('|') }
      }),
  }
}

async function parseTranscript(file: string, workspace: string, project: string): Promise<ChatSummary | null> {
  if (file.includes(`${path.sep}subagents${path.sep}`)) return null
  let raw = ''
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch {
    return null
  }
  const lines = raw.split('\n').filter(Boolean)
  if (!lines.length) return null
  const stat = await fs.stat(file)
  let title = '未命名對話'
  let preview = ''
  let createdAt = stat.birthtime.toISOString()
  let turns = 0
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as Record<string, unknown>
      if (entry.role === 'user') {
        turns += 1
        const text = extractUserQuery(textFromMessage(entry))
        if (text && title === '未命名對話') {
          title = text.slice(0, 80)
          preview = text.slice(0, 180)
          const stamped = extractTimestamp(textFromMessage(entry))
          if (stamped) {
            const parsed = new Date(stamped)
            if (!Number.isNaN(parsed.getTime())) createdAt = parsed.toISOString()
          }
        }
      } else if (entry.role === 'assistant') {
        turns += 1
      }
    } catch {
      // skip broken jsonl rows
    }
  }
  const id = path.basename(path.dirname(file))
  return {
    id,
    title,
    project,
    workspace,
    path: file,
    updatedAt: stat.mtime.toISOString(),
    createdAt,
    turns,
    preview,
  }
}

async function listTranscripts(workspaceDir: string, workspace: string, project: string) {
  const root = path.join(workspaceDir, 'agent-transcripts')
  let ids: string[] = []
  try {
    ids = await fs.readdir(root)
  } catch {
    return []
  }
  const chats: ChatSummary[] = []
  for (const id of ids) {
    const file = path.join(root, id, `${id}.jsonl`)
    const chat = await parseTranscript(file, workspace, project)
    if (chat) chats.push(chat)
  }
  return chats
}

export async function readGitLog(folder: string, since?: string | null, limit = 40) {
  const args = ['log', `-n${limit}`, '--pretty=format:%h|%ad|%s', '--date=short']
  if (since) args.splice(1, 0, `--since=${since}`)
  const log = await git(folder, args)
  return log
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, date, ...rest] = line.split('|')
      return { hash, date, subject: rest.join('|') }
    })
}

export async function readChatMessagesSince(file: string, sinceMs: number) {
  let raw = ''
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch {
    return [] as { role: string; text: string; at: string }[]
  }
  const rows: { role: string; text: string; at: string }[] = []
  for (const line of raw.split('\n')) {
    if (!line) continue
    try {
      const entry = JSON.parse(line) as Record<string, unknown>
      if (entry.role !== 'user' && entry.role !== 'assistant') continue
      const rawText = textFromMessage(entry)
      const stamped = extractTimestamp(rawText)
      const at = stamped && !Number.isNaN(Date.parse(stamped)) ? new Date(stamped).toISOString() : ''
      if (sinceMs && at && Date.parse(at) <= sinceMs) continue
      const query = rawText.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/)
      const text = (query?.[1] || stripTags(rawText.replace(/<timestamp>[\s\S]*?<\/timestamp>/g, ''))).trim().slice(0, 1200)
      if (!text) continue
      rows.push({ role: String(entry.role), text, at })
    } catch {
      /* skip broken jsonl rows */
    }
  }
  return rows
}

function packDigestMessages(
  messages: { role: string; text: string; at: string }[],
  first: boolean,
) {
  if (!first) return messages.slice(-24)
  const clipped = messages.map((message) => ({ ...message, text: message.text.slice(0, 500) }))
  const pool = clipped.length > 60 ? clipped.filter((message) => message.role === 'user') : clipped
  if (pool.length <= 48) return pool
  const sampled = [] as typeof pool
  for (let index = 0; index < 48; index += 1) {
    sampled.push(pool[Math.floor((index * pool.length) / 48)])
  }
  return sampled
}

export async function collectDigestSource(project: ScannedProject, since?: string | null) {
  const first = !since
  const sinceMs = since ? Date.parse(since) : 0
  const git = project.folder ? await readGitLog(project.folder, since || null, first ? 200 : 40) : []
  const chats: { title: string; updatedAt: string; messages: { role: string; text: string; at: string }[] }[] = []
  for (const chat of project.chats) {
    if (sinceMs && Date.parse(chat.updatedAt) <= sinceMs) continue
    const messages = await readChatMessagesSince(chat.path, sinceMs)
    const kept = packDigestMessages(messages, first)
    if (!kept.length) continue
    chats.push({ title: chat.title, updatedAt: chat.updatedAt, messages: kept })
  }
  return { git, chats }
}

export async function scanWorkspace() {
  const projects = new Map<string, ScannedProject>()

  const ensure = (id: string, name: string, folder: string | null) => {
    const existing = projects.get(id)
    if (existing) {
      if (folder && !existing.folder) existing.folder = folder
      return existing
    }
    const created: ScannedProject = {
      id,
      name,
      folder,
      workspaces: [],
      chats: [],
      git: null,
    }
    projects.set(id, created)
    return created
  }

  try {
    const dirs = await fs.readdir(projectsRoot, { withFileTypes: true })
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue
      const folder = path.join(projectsRoot, dir.name)
      const item = ensure(dir.name, dir.name, folder)
      item.git = await readGit(folder)
    }
  } catch {
    // no Project folder yet
  }

  try {
    const workspaces = await fs.readdir(cursorProjects, { withFileTypes: true })
    for (const dir of workspaces) {
      if (!dir.isDirectory()) continue
      const name = nameFromSlug(dir.name)
      if (!name) continue
      const known = projects.get(name)
      if (!known?.folder && !(await slugFolderExists(dir.name))) continue
      const item = ensure(name, name, known?.folder ?? null)
      if (!item.workspaces.includes(dir.name)) item.workspaces.push(dir.name)
      const chats = await listTranscripts(path.join(cursorProjects, dir.name), dir.name, name)
      const seen = new Set(item.chats.map((chat) => chat.id))
      for (const chat of chats) {
        if (!seen.has(chat.id)) item.chats.push(chat)
      }
    }
  } catch {
    // no cursor projects folder
  }

  for (const item of projects.values()) {
    item.chats.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  return [...projects.values()].sort((a, b) => {
    const aTime = a.chats[0]?.updatedAt ?? a.git?.lastCommitAt ?? ''
    const bTime = b.chats[0]?.updatedAt ?? b.git?.lastCommitAt ?? ''
    return bTime.localeCompare(aTime)
  })
}
