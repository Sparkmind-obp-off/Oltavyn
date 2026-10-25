// Shared primitives: types, ids, time, crypto (Web Crypto only), validation, errors.

export type Bindings = { DB: D1Database }
export type User = { id: string; email: string; display_name: string | null }
export type AppEnv = { Bindings: Bindings; Variables: { user: User } }

export const nowIso = () => new Date().toISOString()
export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`

const enc = new TextEncoder()
const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function sha256Hex(text: string) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)))
}

export function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return toHex(a.buffer)
}

// Cloudflare Workers caps PBKDF2 at 100k iterations.
export const PBKDF2_ITERATIONS = 100_000
export async function hashPassword(password: string, saltHex: string, iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)))
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
  return toHex(bits)
}

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

// ---------- Errors ----------
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message)
  }
}
export const notFound = () => new ApiError(404, 'not_found', 'Data tidak ditemukan atau Anda tidak memiliki akses.')

// ---------- Minimal schema validation ----------
type FieldRule = {
  type: 'string' | 'int' | 'number' | 'bool' | 'array'
  required?: boolean
  max?: number
  min?: number
  enum?: readonly string[]
  url?: boolean
  date?: boolean
  nullable?: boolean
}
export type Schema = Record<string, FieldRule>

export function validate<T = Record<string, any>>(input: unknown, schema: Schema, partial = false): T {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ApiError(400, 'invalid_body', 'Body permintaan harus berupa objek JSON.')
  }
  const src = input as Record<string, unknown>
  const out: Record<string, unknown> = {}
  const errors: Record<string, string> = {}
  for (const [key, rule] of Object.entries(schema)) {
    let v = src[key]
    if (typeof v === 'string') v = v.trim()
    const empty = v === undefined || v === null || v === ''
    if (empty) {
      if (rule.required && !partial) errors[key] = 'wajib diisi'
      else if (key in src) out[key] = null
      continue
    }
    switch (rule.type) {
      case 'string': {
        if (typeof v !== 'string') { errors[key] = 'harus teks'; break }
        if (rule.max && v.length > rule.max) { errors[key] = `maksimal ${rule.max} karakter`; break }
        if (rule.enum && !rule.enum.includes(v)) { errors[key] = `harus salah satu: ${rule.enum.join(', ')}`; break }
        if (rule.url) {
          try { const u = new URL(v); if (!['http:', 'https:'].includes(u.protocol)) throw 0 } catch { errors[key] = 'URL http(s) tidak valid'; break }
        }
        if (rule.date && isNaN(Date.parse(v))) { errors[key] = 'tanggal tidak valid'; break }
        out[key] = rule.date ? new Date(v).toISOString() : v
        break
      }
      case 'int':
      case 'number': {
        const n = typeof v === 'number' ? v : Number(v)
        if (!Number.isFinite(n) || (rule.type === 'int' && !Number.isInteger(n))) { errors[key] = 'harus angka'; break }
        if (rule.min !== undefined && n < rule.min) { errors[key] = `minimal ${rule.min}`; break }
        if (rule.max !== undefined && n > rule.max) { errors[key] = `maksimal ${rule.max}`; break }
        out[key] = n
        break
      }
      case 'bool':
        if (typeof v !== 'boolean') { errors[key] = 'harus boolean'; break }
        out[key] = v
        break
      case 'array':
        if (!Array.isArray(v)) { errors[key] = 'harus array'; break }
        if (rule.max && v.length > rule.max) { errors[key] = `maksimal ${rule.max} item`; break }
        out[key] = v
        break
    }
  }
  if (Object.keys(errors).length) throw new ApiError(400, 'validation_failed', 'Input tidak valid.', errors)
  return out as T
}

// ---------- Rate limiting (D1-backed, fixed window) ----------
export async function rateLimit(db: D1Database, bucket: string, limit: number, windowSec: number) {
  const now = Math.floor(Date.now() / 1000)
  const row = await db.prepare('SELECT count, window_start FROM rate_limits WHERE bucket = ?').bind(bucket).first<{ count: number; window_start: number }>()
  if (!row || now - row.window_start >= windowSec) {
    await db.prepare('INSERT INTO rate_limits (bucket, count, window_start) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count = 1, window_start = excluded.window_start').bind(bucket, now).run()
    return
  }
  if (row.count >= limit) throw new ApiError(429, 'rate_limited', 'Terlalu banyak permintaan. Coba lagi nanti.')
  await db.prepare('UPDATE rate_limits SET count = count + 1 WHERE bucket = ?').bind(bucket).run()
}

// ---------- Audit (no secrets / content stored) ----------
export async function audit(db: D1Database, e: { workspace_id?: string | null; actor_user_id?: string | null; action: string; resource_type?: string; resource_id?: string; outcome?: string }) {
  await db.prepare('INSERT INTO audit_events (id, workspace_id, actor_user_id, action, resource_type, resource_id, outcome, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(newId('aud'), e.workspace_id ?? null, e.actor_user_id ?? null, e.action, e.resource_type ?? null, e.resource_id ?? null, e.outcome ?? 'success', nowIso()).run()
}
