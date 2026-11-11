import { Hono, type MiddlewareHandler } from 'hono'
import { getCookie, deleteCookie } from 'hono/cookie'
import { ApiError, AppEnv, PBKDF2_ITERATIONS, audit, hashPassword, newId, nowIso, randomToken, rateLimit, sha256Hex } from '../lib/core'

const COOKIE = 'olt_session'

function b64urlBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const raw = atob(normalized)
  return Uint8Array.from(raw, ch => ch.charCodeAt(0))
}
function decodeJwtPart(value: string) {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(value)))
}
async function verifyClerkToken(token: string, c: any) {
  const pem = c.env.CLERK_JWT_PUBLIC_KEY as string
  if (!pem) throw new ApiError(503, 'clerk_not_configured', 'Google Sign-In belum dikonfigurasi oleh administrator.')
  const parts = token.split('.')
  if (parts.length !== 3) throw new ApiError(401, 'invalid_session', 'Sesi Google tidak valid.')
  let header: any, claims: any
  try { header = decodeJwtPart(parts[0]); claims = decodeJwtPart(parts[1]) }
  catch { throw new ApiError(401, 'invalid_session', 'Token autentikasi tidak valid.') }
  if (header.alg !== 'RS256') throw new ApiError(401, 'invalid_session', 'Algoritma token tidak diizinkan.')
  const keyBytes = Uint8Array.from(atob(pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\\s/g, '')), ch => ch.charCodeAt(0))
  const key = await crypto.subtle.importKey('spki', keyBytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]))
  const now = Math.floor(Date.now() / 1000)
  const allowed = (c.env.CLERK_AUTHORIZED_PARTIES || new URL(c.req.url).origin).split(',').map((x: string) => x.trim()).filter(Boolean)
  if (!valid || !claims.sub || !claims.exp || claims.exp <= now || (claims.nbf && claims.nbf > now + 30) ||
      (c.env.CLERK_ISSUER && claims.iss !== c.env.CLERK_ISSUER) || !claims.azp || !allowed.includes(claims.azp)) {
    throw new ApiError(401, 'invalid_session', 'Sesi autentikasi tidak valid atau telah kedaluwarsa.')
  }
  return claims
}

async function ensureFreeStarter(db: D1Database, userId: string) {
  const now = nowIso()
  await db.prepare("INSERT OR IGNORE INTO user_plans (user_id, plan_code, status, source, started_at, expires_at, created_at, updated_at) VALUES (?, 'free_starter', 'active', 'google_signup', ?, NULL, ?, ?)")
    .bind(userId, now, now, now).run()
  return db.prepare('SELECT plan_code, status, started_at, expires_at FROM user_plans WHERE user_id = ?').bind(userId).first<any>()
}

async function resolveClerkUser(c: any, claims: any) {
  let user = await c.env.DB.prepare("SELECT id, email, display_name FROM users WHERE clerk_user_id = ? AND status = 'active'")
    .bind(claims.sub).first<any>()
  if (!user) {
    if (!c.env.CLERK_SECRET_KEY) throw new ApiError(503, 'clerk_not_configured', 'CLERK_SECRET_KEY belum dipasang.')
    const response = await fetch('https://api.clerk.com/v1/users/' + encodeURIComponent(claims.sub), {
      headers: { Authorization: 'Bearer ' + c.env.CLERK_SECRET_KEY }
    })
    if (!response.ok) throw new ApiError(502, 'clerk_profile_unavailable', 'Profil akun Google belum dapat diverifikasi.')
    const profile: any = await response.json()
    const primary = profile.email_addresses?.find((x: any) => x.id === profile.primary_email_address_id)
    if (!primary?.email_address || primary.verification?.status !== 'verified') {
      throw new ApiError(403, 'verified_google_email_required', 'Gunakan akun Google dengan email terverifikasi.')
    }
    const email = String(primary.email_address).trim().toLowerCase()
    const display = [profile.first_name, profile.last_name].filter(Boolean).join(' ').slice(0, 80) || null
    const existing = await c.env.DB.prepare('SELECT id, clerk_user_id, status FROM users WHERE email = ?').bind(email).first<any>()
    if (existing) {
      if (existing.status !== 'active') throw new ApiError(403, 'account_disabled', 'Akun OLTAVYN ini tidak aktif. Hubungi dukungan.')
      if (existing.clerk_user_id && existing.clerk_user_id !== claims.sub) throw new ApiError(409, 'identity_conflict', 'Email sudah terhubung ke identitas lain.')
      await c.env.DB.prepare('UPDATE users SET clerk_user_id = ?, display_name = COALESCE(display_name, ?) WHERE id = ?')
        .bind(claims.sub, display, existing.id).run()
      user = { id: existing.id, email, display_name: display }
    } else {
      const id = newId('usr'), salt = randomToken(16)
      const dummy = await hashPassword(randomToken(32), salt)
      await c.env.DB.prepare("INSERT INTO users (id, email, display_name, password_hash, password_salt, password_iterations, status, created_at, clerk_user_id) VALUES (?,?,?,?,?,?, 'active',?,?)")
        .bind(id, email, display, dummy, salt, PBKDF2_ITERATIONS, nowIso(), claims.sub).run()
      user = { id, email, display_name: display }
      await audit(c.env.DB, { actor_user_id: id, action: 'user.register.google', resource_type: 'user', resource_id: id })
    }
  }
  const plan = await ensureFreeStarter(c.env.DB, user.id)
  if (plan?.status !== 'active') throw new ApiError(403, 'plan_suspended', 'Akses paket akun sedang ditangguhkan. Hubungi dukungan OLTAVYN.')
  return { ...user, plan_code: plan?.plan_code || 'free_starter', plan_label: 'Free Starter', plan_status: plan?.status || 'active' }
}

// Google via Clerk is the only accepted identity provider. Legacy password cookies are intentionally rejected.
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const clerkToken = getCookie(c, '__session')
  if (!clerkToken || !c.env.CLERK_PUBLISHABLE_KEY || !c.env.CLERK_JWT_PUBLIC_KEY || !c.env.CLERK_SECRET_KEY) {
    throw new ApiError(401, 'google_sign_in_required', 'Silakan masuk menggunakan akun Google.')
  }
  const claims = await verifyClerkToken(clerkToken, c)
  const user = await resolveClerkUser(c, claims)
  c.set('user', user)
  await next()
}

// CSRF defence: SameSite cookies + JSON-only mutations + same-origin requests.
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

auth.get('/config', c => c.json({
  auth_method: 'google_only',
  google_only: true,
  clerk_enabled: !!(c.env.CLERK_PUBLISHABLE_KEY && c.env.CLERK_JWT_PUBLIC_KEY && c.env.CLERK_SECRET_KEY),
  publishable_key: c.env.CLERK_PUBLISHABLE_KEY || null
}))

auth.post('/register', async c => {
  await rateLimit(c.env.DB, 'legacy-auth:' + (c.req.header('cf-connecting-ip') || 'local'), 10, 3600)
  throw new ApiError(410, 'google_only_auth', 'Pendaftaran hanya tersedia melalui akun Google.')
})
auth.post('/login', async c => {
  await rateLimit(c.env.DB, 'legacy-auth:' + (c.req.header('cf-connecting-ip') || 'local'), 10, 3600)
  throw new ApiError(410, 'google_only_auth', 'Login hanya tersedia melalui akun Google.')
})
auth.post('/logout', async c => {
  const token = getCookie(c, COOKIE)
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(token)).run().catch(() => {})
  deleteCookie(c, COOKIE, { path: '/' })
  return c.json({ ok: true })
})
auth.get('/me', async (c, next) => {
  if (!getCookie(c, '__session')) return c.json({ user: null })
  try { await requireAuth(c, next) } catch { return c.json({ user: null }) }
  return c.json({ user: c.get('user') })
})
