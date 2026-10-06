import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const dataDir = path.join(root, 'data')
export const uploadDir = path.join(dataDir, 'uploads')

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

export async function readJson<T>(name: string, fallback: T): Promise<T> {
  await ensureDir(dataDir)
  const file = path.join(dataDir, name)
  try {
    const raw = await fs.readFile(file, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export async function writeJson(name: string, value: unknown) {
  await ensureDir(dataDir)
  const file = path.join(dataDir, name)
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await fs.rename(tmp, file)
}

export function uid() {
  return crypto.randomUUID()
}

export function nowIso() {
  return new Date().toISOString()
}
