import { ApiError, type AppEnv } from './core'
import type { MiddlewareHandler } from 'hono'

type AccessClaims = { iss?: string; aud?: string | string[]; exp?: number; nbf?: number; sub?: string; email?: string }
type AccessJwk = JsonWebKey & { kid?: string; alg?: string; use?: string }
type AccessJwks = { keys: AccessJwk[] }

const keyCache = new Map<string, { keys: AccessJwk[]; expiresAt: number }>()
const decodePart = (part: string) => {
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(normalized), c => c.charCodeAt(0))))
}

async function loadKeys(teamDomain: string): Promise<AccessJwk[]> {
  const cached = keyCache.get(teamDomain)
  if (cached && cached.expiresAt > Date.now()) return cached.keys
  const response = await fetch('https://' + teamDomain + '/cdn-cgi/access/certs', {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new ApiError(503, 'access_keys_unavailable', 'Kunci verifikasi Cloudflare Access sementara tidak tersedia.')
  const data = await response.json() as AccessJwks
  if (!Array.isArray(data.keys) || !data.keys.length) throw new ApiError(503, 'access_keys_unavailable', 'Kunci verifikasi Cloudflare Access tidak valid.')
  keyCache.set(teamDomain, { keys: data.keys, expiresAt: Date.now() + 5 * 60_000 })
  return data.keys
}

async function verifyAccessToken(token: string, teamDomain: string, audiencesAllowed: string[]) {
  const parts = token.split('.')
  if (parts.length !== 3) throw new ApiError(403, 'access_invalid', 'Token Cloudflare Access tidak valid.')
  let header: { alg?: string; kid?: string }, claims: AccessClaims
  try { header = decodePart(parts[0]); claims = decodePart(parts[1]) }
  catch { throw new ApiError(403, 'access_invalid', 'Token Cloudflare Access tidak valid.') }
  if (header.alg !== 'RS256' || !header.kid) throw new ApiError(403, 'access_invalid', 'Algoritma token Cloudflare Access tidak diizinkan.')
  const jwk = (await loadKeys(teamDomain)).find(key => key.kid === header.kid && key.alg === 'RS256' && key.use === 'sig')
  if (!jwk) {
    keyCache.delete(teamDomain)
    const refreshed = (await loadKeys(teamDomain)).find(key => key.kid === header.kid && key.alg === 'RS256' && key.use === 'sig')
    if (!refreshed) throw new ApiError(403, 'access_invalid', 'Kunci token Cloudflare Access tidak dikenal.')
  }
  const selected = jwk || (await loadKeys(teamDomain)).find(key => key.kid === header.kid)!
  const key = await crypto.subtle.importKey('jwk', selected, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key,
    Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[2].length / 4) * 4, '=')), c => c.charCodeAt(0)),
    new TextEncoder().encode(parts[0] + '.' + parts[1]))
  const now = Math.floor(Date.now() / 1000)
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!valid || claims.iss !== 'https://' + teamDomain || !audiences.some(audience => audiencesAllowed.includes(audience)) ||
      !claims.sub || !claims.exp || claims.exp <= now || (claims.nbf !== undefined && claims.nbf > now + 30)) {
    throw new ApiError(403, 'access_invalid', 'Token Cloudflare Access tidak valid, kedaluwarsa, atau bukan untuk aplikasi admin ini.')
  }
}

export const requireCloudflareAccess: MiddlewareHandler<AppEnv> = async (c, next) => {
  const teamDomain = String(c.env.CF_ACCESS_TEAM_DOMAIN || '').trim().replace(/^https:\/\//, '').replace(/\/$/, '')
  const audiences = String(c.env.CF_ACCESS_AUD || '').split(',').map(value => value.trim()).filter(Boolean)
  // Local-only escape hatch for development. Production and Pages previews fail closed.
  const host = new URL(c.req.url).hostname
  const local = host === 'localhost' || host === '127.0.0.1'
  if (!teamDomain || !audiences.length) {
    if (local && c.env.OLTAVYN_ACCESS_LOCAL_BYPASS === 'true') { await next(); return }
    throw new ApiError(503, 'access_not_configured', 'Perlindungan Cloudflare Access belum dikonfigurasi untuk Command Center.')
  }
  const token = c.req.header('cf-access-jwt-assertion')
  if (!token) throw new ApiError(403, 'access_required', 'Akses Command Center harus melalui Cloudflare Access.')
  await verifyAccessToken(token, teamDomain, audiences)
  await next()
}
