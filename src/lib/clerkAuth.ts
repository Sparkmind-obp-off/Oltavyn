// Clerk session verification + internal user resolution. Pure functions with injected
// dependencies so they can be regression-tested without network or Cloudflare runtime.
import { ApiError, PBKDF2_ITERATIONS, audit, hashPassword, newId, nowIso, randomToken } from './core'
import { evaluateClerkProfile } from './clerkIdentity'

export type ClerkVerifyOptions = {
  publicKeyPem?: string
  issuer?: string
  authorizedParties: string[]
  nowSeconds?: number
  clockSkewSeconds?: number
}

function b64urlBytes(value: string) {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error('bad b64url')
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const raw = atob(normalized)
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0))
}
function decodeJwtPart(value: string) {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(value)))
}
const invalid = (msg = 'Sesi Clerk tidak valid atau telah kedaluwarsa.') => new ApiError(401, 'invalid_session', msg)

/** Verifies a Clerk session JWT: RS256 signature, iss, exp, nbf, sub, azp. Never logs the token. */
export async function verifyClerkToken(token: string, opt: ClerkVerifyOptions) {
  if (!opt.publicKeyPem) throw new ApiError(503, 'clerk_not_configured', 'Kunci verifikasi Clerk belum dipasang.')
  if (!opt.issuer) throw new ApiError(503, 'clerk_not_configured', 'Issuer Clerk belum dikonfigurasi.')
  if (typeof token !== 'string' || !token || token.length > 16_384) throw invalid('Sesi Clerk tidak valid.')
  const parts = token.split('.')
  if (parts.length !== 3) throw invalid('Sesi Clerk tidak valid.')
  let header: any, claims: any
  try { header = decodeJwtPart(parts[0]); claims = decodeJwtPart(parts[1]) } catch { throw invalid('Sesi Clerk tidak valid.') }
  if (!header || header.alg !== 'RS256') throw invalid('Algoritma token Clerk tidak diizinkan.')
  if (!claims || typeof claims !== 'object') throw invalid('Sesi Clerk tidak valid.')
  let valid = false
  try {
    const keyBytes = Uint8Array.from(atob(opt.publicKeyPem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\\n|\s/g, '')), (ch) => ch.charCodeAt(0))
    const key = await crypto.subtle.importKey('spki', keyBytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]))
  } catch { throw invalid('Tanda tangan sesi Clerk tidak valid.') }
  if (!valid) throw invalid('Tanda tangan sesi Clerk tidak valid.')
  const now = opt.nowSeconds ?? Math.floor(Date.now() / 1000)
  const skew = opt.clockSkewSeconds ?? 30
  if (typeof claims.sub !== 'string' || !claims.sub.startsWith('user_')) throw invalid()
  if (typeof claims.exp !== 'number' || claims.exp + skew <= now) throw invalid()
  if (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > now + skew)) throw invalid()
  if (claims.iss !== opt.issuer) throw invalid()
  if (typeof claims.azp !== 'string' || !opt.authorizedParties.includes(claims.azp)) throw invalid()
  return claims as { sub: string; sid?: string; azp: string; iss: string; exp: number }
}

export function parseAuthorizedParties(raw: string | undefined, fallbackOrigin: string) {
  return (raw || fallbackOrigin).split(',').map((x) => x.trim()).filter(Boolean)
}

export type ProfileFetcher = (clerkUserId: string) => Promise<any>

export function clerkProfileFetcher(secretKey: string, fetchImpl: typeof fetch = fetch): ProfileFetcher {
  return async (id) => {
    const r = await fetchImpl('https://api.clerk.com/v1/users/' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + secretKey } })
    if (r.status === 404) throw new ApiError(401, 'invalid_session', 'Akun Clerk tidak ditemukan.')
    if (!r.ok) throw new ApiError(502, 'clerk_profile_unavailable', 'Profil akun Clerk belum dapat diverifikasi.')
    return r.json()
  }
}

const USER_COLS = 'id,email,display_name,plan_tier,plan_status,plan_started_at'
const IDENTITY_ERRORS = {
  google_sign_in_required: [403, 'OLTAVYN hanya menerima akun yang masuk melalui Google.'],
  verified_google_email_required: [403, 'Akun Google harus memiliki email utama terverifikasi.'],
  account_disabled: [403, 'Akun OLTAVYN ini tidak aktif. Hubungi dukungan.'],
} as const

/**
 * Maps a verified Clerk identity to exactly one internal user.
 * - Existing mapping (clerk_user_id) wins; disabled users are rejected (never re-provisioned).
 * - New identities are validated against the server-fetched Clerk profile (Google + verified email).
 * - An existing local account with the same verified email is linked only if it has no other Clerk identity.
 * - Provisioning is idempotent under concurrency (UNIQUE email + partial UNIQUE clerk_user_id).
 */
export async function resolveClerkUser(db: D1Database, clerkUserId: string, fetchProfile: ProfileFetcher) {
  const mapped: any = await db.prepare(`SELECT ${USER_COLS},status FROM users WHERE clerk_user_id=?`).bind(clerkUserId).first()
  if (mapped) {
    if (mapped.status !== 'active') throw new ApiError(403, 'account_disabled', IDENTITY_ERRORS.account_disabled[1])
    const { status: _s, ...user } = mapped
    return user
  }
  const profile = await fetchProfile(clerkUserId)
  if (!profile || profile.id !== clerkUserId) throw new ApiError(401, 'invalid_session', 'Identitas Clerk tidak cocok.')
  const result = evaluateClerkProfile(profile)
  if (!result.ok) { const [status, msg] = IDENTITY_ERRORS[result.code]; throw new ApiError(status, result.code, msg) }
  const { email, displayName } = result
  const existing: any = await db.prepare('SELECT id,clerk_user_id,status,plan_tier,plan_status,plan_started_at FROM users WHERE email=?').bind(email).first()
  if (existing) {
    if (existing.status !== 'active') throw new ApiError(403, 'account_disabled', IDENTITY_ERRORS.account_disabled[1])
    if (existing.clerk_user_id && existing.clerk_user_id !== clerkUserId) throw new ApiError(409, 'identity_conflict', 'Email sudah terhubung ke identitas lain.')
    // Conditional update: never overwrites a mapping set concurrently by another request.
    await db.prepare('UPDATE users SET clerk_user_id=?,display_name=COALESCE(display_name,?) WHERE id=? AND clerk_user_id IS NULL').bind(clerkUserId, displayName, existing.id).run()
    const linked: any = await db.prepare(`SELECT ${USER_COLS} FROM users WHERE id=? AND clerk_user_id=? AND status='active'`).bind(existing.id, clerkUserId).first()
    if (!linked) throw new ApiError(409, 'identity_conflict', 'Email sudah terhubung ke identitas lain.')
    await audit(db, { actor_user_id: linked.id, action: 'user.link.google', resource_type: 'user', resource_id: linked.id })
    return linked
  }
  const id = newId('usr'), salt = randomToken(16), created = nowIso()
  const unusable = await hashPassword(randomToken(32), salt) // password login is disabled; random unusable hash
  await db.prepare("INSERT OR IGNORE INTO users (id,email,display_name,password_hash,password_salt,password_iterations,status,created_at,clerk_user_id,plan_tier,plan_status,plan_started_at) VALUES (?,?,?,?,?,?,'active',?,?,'free','active',?)")
    .bind(id, email, displayName, unusable, salt, PBKDF2_ITERATIONS, created, clerkUserId, created).run()
  const provisioned: any = await db.prepare(`SELECT ${USER_COLS},status FROM users WHERE clerk_user_id=?`).bind(clerkUserId).first()
  if (provisioned) {
    if (provisioned.status !== 'active') throw new ApiError(403, 'account_disabled', IDENTITY_ERRORS.account_disabled[1])
    if (provisioned.id === id) await audit(db, { actor_user_id: id, action: 'user.register.google', resource_type: 'user', resource_id: id })
    const { status: _s, ...user } = provisioned
    return user
  }
  const conflict: any = await db.prepare('SELECT status,clerk_user_id FROM users WHERE email=?').bind(email).first()
  if (conflict && conflict.status !== 'active') throw new ApiError(403, 'account_disabled', IDENTITY_ERRORS.account_disabled[1])
  if (conflict?.clerk_user_id && conflict.clerk_user_id !== clerkUserId) throw new ApiError(409, 'identity_conflict', 'Email sudah terhubung ke identitas lain.')
  throw new ApiError(409, 'identity_provisioning_conflict', 'Akun sedang dibuat pada permintaan lain. Silakan coba masuk kembali.')
}
