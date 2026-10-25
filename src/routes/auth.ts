import { Hono, type MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { ApiError, AppEnv, PBKDF2_ITERATIONS, audit, hashPassword, newId, nowIso, randomToken, rateLimit, safeEqual, sha256Hex, validate } from '../lib/core'

const COOKIE = 'olt_session'
const SESSION_DAYS = 14

async function startSession(c: any, userId: string) {
  const token = randomToken(32)
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000)
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?,?,?,?)')
    .bind(await sha256Hex(token), userId, nowIso(), expires.toISOString()).run()
  const secure = new URL(c.req.url).protocol === 'https:'
  setCookie(c, COOKIE, token, { httpOnly: true, secure, sameSite: 'Strict', path: '/', expires })
}

const clientKey = (c: any) => c.req.header('cf-connecting-ip') || 'local'

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, COOKIE)
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new ApiError(401, 'unauthenticated', 'Silakan masuk terlebih dahulu.')
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.display_name, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND u.status = 'active'`
  ).bind(await sha256Hex(token)).first<any>()
  if (!row || Date.parse(row.expires_at) < Date.now()) throw new ApiError(401, 'unauthenticated', 'Sesi berakhir. Silakan masuk kembali.')
  c.set('user', { id: row.id, email: row.email, display_name: row.display_name })
  await next()
}

// CSRF defence: SameSite=Strict cookie + mutating requests must be JSON (forces CORS preflight cross-origin)
// + Origin, when present, must match the host.
export const csrfGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('origin')
    if (origin && new URL(origin).host !== new URL(c.req.url).host) throw new ApiError(403, 'bad_origin', 'Origin permintaan tidak diizinkan.')
    const ct = c.req.header('content-type') || ''
    if (c.req.method !== 'DELETE' && !ct.includes('application/json')) throw new ApiError(415, 'json_required', 'Content-Type harus application/json.')
  }
  await next()
}

export const auth = new Hono<AppEnv>()

auth.post('/register', async (c) => {
  await rateLimit(c.env.DB, `register:${clientKey(c)}`, 10, 3600)
  const body = validate<{ email: string; password: string; display_name?: string }>(await c.req.json(), {
    email: { type: 'string', required: true, max: 254 },
    password: { type: 'string', required: true, max: 200 },
    display_name: { type: 'string', max: 80 },
  })
  const email = body.email.toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'validation_failed', 'Input tidak valid.', { email: 'format email tidak valid' })
  if (body.password.length < 10) throw new ApiError(400, 'validation_failed', 'Input tidak valid.', { password: 'minimal 10 karakter' })
  const exists = await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()
  if (exists) throw new ApiError(409, 'email_taken', 'Email sudah terdaftar. Silakan masuk.')
  const salt = randomToken(16)
  const id = newId('usr')
  await c.env.DB.prepare('INSERT INTO users (id, email, display_name, password_hash, password_salt, password_iterations, created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(id, email, body.display_name ?? null, await hashPassword(body.password, salt), salt, PBKDF2_ITERATIONS, nowIso()).run()
  await startSession(c, id)
  await audit(c.env.DB, { actor_user_id: id, action: 'user.register', resource_type: 'user', resource_id: id })
  return c.json({ user: { id, email, display_name: body.display_name ?? null } }, 201)
})

auth.post('/login', async (c) => {
  await rateLimit(c.env.DB, `login:${clientKey(c)}`, 20, 900)
  const body = validate<{ email: string; password: string }>(await c.req.json(), {
    email: { type: 'string', required: true, max: 254 },
    password: { type: 'string', required: true, max: 200 },
  })
  const u = await c.env.DB.prepare("SELECT * FROM users WHERE email = ? AND status = 'active'").bind(body.email.toLowerCase()).first<any>()
  const ok = u && safeEqual(await hashPassword(body.password, u.password_salt, u.password_iterations), u.password_hash)
  if (!ok) {
    await audit(c.env.DB, { actor_user_id: u?.id ?? null, action: 'user.login', outcome: 'failure' })
    throw new ApiError(401, 'invalid_credentials', 'Email atau kata sandi salah.')
  }
  await startSession(c, u.id)
  await audit(c.env.DB, { actor_user_id: u.id, action: 'user.login' })
  return c.json({ user: { id: u.id, email: u.email, display_name: u.display_name } })
})

auth.post('/logout', async (c) => {
  const token = getCookie(c, COOKIE)
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(token)).run()
  deleteCookie(c, COOKIE, { path: '/' })
  return c.json({ ok: true })
})

// Returns { user: null } instead of 401 so the SPA can probe session state quietly.
auth.get('/me', async (c, next) => {
  if (!getCookie(c, COOKIE)) return c.json({ user: null })
  try { await requireAuth(c, next) } catch { return c.json({ user: null }) }
  return c.json({ user: c.get('user') })
})
