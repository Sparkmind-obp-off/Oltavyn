import { Hono, type MiddlewareHandler } from 'hono'
import { getCookie, deleteCookie } from 'hono/cookie'
import { ApiError, AppEnv, sha256Hex } from '../lib/core'
import { clerkProfileFetcher, parseAuthorizedParties, resolveClerkUser, verifyClerkToken } from '../lib/clerkAuth'

const COOKIE = 'olt_session'

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  // No session → 401 regardless of configuration (accurate status; never leaks config state).
  const clerkToken = getCookie(c, '__session')
  if (!clerkToken) throw new ApiError(401, 'unauthenticated', 'Silakan masuk menggunakan Google.')
  if (!c.env.CLERK_PUBLISHABLE_KEY || !c.env.CLERK_JWT_PUBLIC_KEY || !c.env.CLERK_SECRET_KEY || !c.env.CLERK_ISSUER)
    throw new ApiError(503, 'google_auth_not_configured', 'Autentikasi Google OLTAVYN belum dikonfigurasi.')
  const claims = await verifyClerkToken(clerkToken, {
    publicKeyPem: c.env.CLERK_JWT_PUBLIC_KEY,
    issuer: c.env.CLERK_ISSUER,
    authorizedParties: parseAuthorizedParties(c.env.CLERK_AUTHORIZED_PARTIES, new URL(c.req.url).origin),
  })
  const user = await resolveClerkUser(c.env.DB, claims.sub, clerkProfileFetcher(c.env.CLERK_SECRET_KEY))
  c.set('user', user)
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

auth.get('/config', c => c.json({ auth_mode: 'google_only', clerk_enabled: !!(c.env.CLERK_PUBLISHABLE_KEY && c.env.CLERK_JWT_PUBLIC_KEY && c.env.CLERK_SECRET_KEY), publishable_key: c.env.CLERK_PUBLISHABLE_KEY || null }))

auth.post('/register', async () => { throw new ApiError(410, 'google_only_auth', 'Pendaftaran email dan kata sandi telah dinonaktifkan. Gunakan Google.') })
auth.post('/login', async () => { throw new ApiError(410, 'google_only_auth', 'Login email dan kata sandi telah dinonaktifkan. Gunakan Google.') })

auth.post('/logout', async (c) => {
  const token = getCookie(c, COOKIE)
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(token)).run()
  deleteCookie(c, COOKIE, { path: '/' })
  return c.json({ ok: true })
})

// Returns { user: null } instead of 401 so the SPA can probe session state quietly.
// Identity-policy failures (non-Google, unverified email, disabled, conflict, misconfiguration) are
// returned as a safe { code, message } so the UI can explain them instead of silently looping to login.
const SURFACED_AUTH_ERRORS = new Set(['google_sign_in_required','verified_google_email_required','account_disabled','identity_conflict','identity_provisioning_conflict','google_auth_not_configured','clerk_not_configured','clerk_profile_unavailable'])
auth.get('/me', async (c, next) => {
  if (!getCookie(c, COOKIE) && !getCookie(c, '__session')) return c.json({ user: null })
  try { await requireAuth(c, next) } catch (e) {
    if (e instanceof ApiError && SURFACED_AUTH_ERRORS.has(e.code)) {
      console.warn(JSON.stringify({ evt: 'auth.me.rejected', code: e.code }))
      return c.json({ user: null, auth_error: { code: e.code, message: e.message } })
    }
    return c.json({ user: null })
  }
  const user=c.get('user')
  return c.json({ user })
})
