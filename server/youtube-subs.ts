import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { youtubeId } from '../src/lib/youtube.ts'

const execFileAsync = promisify(execFile)

const MANUAL_LANGS = 'zh-TW,zh-Hant,en'
const AUTO_LANGS = 'zh-Hant,en'
const LANG_ORDER = ['zh-TW', 'zh-Hant', 'zh-HK', 'zh', 'en']

export async function fetchYoutubeCaptions(url: string) {
  const id = youtubeId(url)
  if (!id) return { text: '', lang: '', missing: true as const }

  const bin = await resolveYtDlp()
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ultimate-subs-'))
  try {
    await pullSubs(bin, url, dir, false)
    let picked = await pickSrt(dir, id)
    if (!picked) {
      await pullSubs(bin, url, dir, true)
      picked = await pickSrt(dir, id)
    }
    if (!picked) return { text: '', lang: '', missing: true as const }
    const text = parseSrt(await fs.readFile(picked.file, 'utf8')).slice(0, 24000)
    if (!text) return { text: '', lang: picked.lang, missing: true as const }
    return { text, lang: picked.lang, missing: false as const }
  } catch {
    return { text: '', lang: '', missing: true as const }
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

async function resolveYtDlp() {
  if (process.env.YT_DLP) return process.env.YT_DLP
  const extra = [
    path.join(os.homedir(), 'anaconda3', 'bin'),
    path.join(os.homedir(), 'miniconda3', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ]
  const envPath = [process.env.PATH, ...extra].filter(Boolean).join(path.delimiter)
  try {
    const { stdout } = await execFileAsync('which', ['yt-dlp'], {
      env: { ...process.env, PATH: envPath },
      timeout: 3000,
      windowsHide: true,
    })
    if (stdout.trim()) return stdout.trim()
  } catch {
    // fall through to known paths
  }
  for (const dir of extra) {
    const candidate = path.join(dir, 'yt-dlp')
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // try next
    }
  }
  throw new Error('找不到 yt-dlp')
}

async function pullSubs(bin: string, url: string, cwd: string, auto: boolean) {
  const args = [
    '--skip-download',
    auto ? '--write-auto-subs' : '--write-subs',
    '--sub-langs',
    auto ? AUTO_LANGS : MANUAL_LANGS,
    '--convert-subs',
    'srt',
    '--no-playlist',
    '--no-warnings',
    '-o',
    '%(id)s',
    url,
  ]
  if (!auto) args.splice(4, 0, '--sub-format', 'srt')
  try {
    await execFileAsync(bin, args, { cwd, timeout: 60000, windowsHide: true })
  } catch {
    // 沒有對應字幕時 yt-dlp 可能非 0；交給後面看檔案
  }
}

async function pickSrt(dir: string, id: string) {
  const files = await fs.readdir(dir)
  const srts = files
    .filter((name) => name.endsWith('.srt'))
    .map((name) => {
      const match = name.match(/\.([A-Za-z0-9-]+)\.srt$/)
      return { file: path.join(dir, name), lang: match?.[1] || '', name }
    })
    .filter((item) => item.name.startsWith(id) || !id)
  for (const lang of LANG_ORDER) {
    const hit = srts.find((item) => item.lang === lang || item.lang.startsWith(`${lang}-`))
    if (hit) return hit
  }
  return srts[0] || null
}

function parseSrt(raw: string) {
  const lines: string[] = []
  for (const block of raw.replace(/^\uFEFF/, '').split(/\r?\n\r?\n/)) {
    const body = block
      .split(/\r?\n/)
      .filter((line) => line && !/^\d+$/.test(line.trim()) && !/^\d{2}:\d{2}:\d{2}/.test(line))
      .map((line) => line.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean)
      .join(' ')
    if (body && body !== lines[lines.length - 1]) lines.push(body)
  }
  return lines.join('\n')
}
