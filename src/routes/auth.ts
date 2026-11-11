import { Hono, type MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { ApiError, AppEnv, PBKDF2_ITERATIONS, audit, hashPassword, newId, nowIso, randomToken, sha256Hex } from '../lib/core'

const COOKIE = 'olt_session'

const clientKey = (c: any) => c.req.header('cf-connecting-ip') || 'local'

function b64urlBytes(value: string) {
  const normalized=value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=')
  const raw=atob(normalized); return Uint8Array.from(raw,ch=>ch.charCodeAt(0))
}
function decodeJwtPart(value: string) { return JSON.parse(new TextDecoder().decode(b64urlBytes(value))) }
async function verifyClerkToken(token: string, c: any) {
  const pem=c.env.CLERK_JWT_PUBLIC_KEY as string
  if (!pem) throw new ApiError(503,'clerk_not_configured','Kunci verifikasi Clerk belum dipasang.')
  const parts=token.split('.')
  if(parts.length!==3) throw new ApiError(401,'invalid_session','Sesi Clerk tidak valid.')
  const header=decodeJwtPart(parts[0]), claims=decodeJwtPart(parts[1])
  if(header.alg!=='RS256') throw new ApiError(401,'invalid_session','Algoritma token Clerk tidak diizinkan.')
  const keyBytes=Uint8Array.from(atob(pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,'')),ch=>ch.charCodeAt(0))
  const key=await crypto.subtle.importKey('spki',keyBytes,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify'])
  const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,b64urlBytes(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]))
  const now=Math.floor(Date.now()/1000), origin=new URL(c.req.url).origin
  const allowed=(c.env.CLERK_AUTHORIZED_PARTIES||origin).split(',').map((x:string)=>x.trim()).filter(Boolean)
  if(!valid || !claims.sub || !claims.exp || claims.exp<=now || (claims.nbf && claims.nbf>now+30) ||
     (c.env.CLERK_ISSUER && claims.iss!==c.env.CLERK_ISSUER) || !claims.azp || !allowed.includes(claims.azp))
    throw new ApiError(401,'invalid_session','Sesi Clerk tidak valid atau telah kedaluwarsa.')
  return claims
}
async function resolveClerkUser(c: any, claims: any) {
  if (!c.env.CLERK_SECRET_KEY) throw new ApiError(503,'clerk_not_configured','CLERK_SECRET_KEY belum dipasang.')
  const response=await fetch('https://api.clerk.com/v1/users/'+encodeURIComponent(claims.sub),{headers:{Authorization:'Bearer '+c.env.CLERK_SECRET_KEY}})
  if(!response.ok) throw new ApiError(502,'clerk_profile_unavailable','Profil akun Clerk belum dapat diverifikasi.')
  const profile:any=await response.json()
  const googleLinked=(profile.external_accounts||[]).some((x:any)=>String(x.provider||'').toLowerCase()==='google')
  if(!googleLinked) throw new ApiError(403,'google_sign_in_required','OLTAVYN hanya menerima akun yang masuk melalui Google.')
  const primary=profile.email_addresses?.find((x:any)=>x.id===profile.primary_email_address_id)
  if(!primary?.email_address || primary.verification?.status!=='verified')
    throw new ApiError(403,'verified_google_email_required','Akun Google harus memiliki email utama terverifikasi.')
  const email=String(primary.email_address).toLowerCase()
  const display=[profile.first_name,profile.last_name].filter(Boolean).join(' ').slice(0,80)||null
  let user=await c.env.DB.prepare("SELECT id,email,display_name,plan_tier,plan_status,plan_started_at FROM users WHERE clerk_user_id=? AND status='active'").bind(claims.sub).first<any>()
  if(!user) {
    const existing=await c.env.DB.prepare('SELECT id,clerk_user_id,status,plan_tier,plan_status,plan_started_at FROM users WHERE email=?').bind(email).first<any>()
    if(existing) {
      if(existing.status!=='active') throw new ApiError(403,'account_disabled','Akun OLTAVYN ini tidak aktif. Hubungi dukungan.')
      if(existing.clerk_user_id && existing.clerk_user_id!==claims.sub) throw new ApiError(409,'identity_conflict','Email sudah terhubung ke identitas lain.')
      await c.env.DB.prepare('UPDATE users SET clerk_user_id=?,display_name=COALESCE(display_name,?) WHERE id=?').bind(claims.sub,display,existing.id).run()
      user={id:existing.id,email,display_name:display,plan_tier:existing.plan_tier||'free',plan_status:existing.plan_status||'active',plan_started_at:existing.plan_started_at||nowIso()}
    } else {
      const id=newId('usr'),salt=randomToken(16),dummy=await hashPassword(randomToken(32),salt)
      await c.env.DB.prepare("INSERT INTO users (id,email,display_name,password_hash,password_salt,password_iterations,status,created_at,clerk_user_id,plan_started_at) VALUES (?,?,?,?,?,?, 'active',?,?,?)")
        .bind(id,email,display,dummy,salt,PBKDF2_ITERATIONS,nowIso(),claims.sub,nowIso()).run()
      user={id,email,display_name:display,plan_tier:'free',plan_status:'active',plan_started_at:nowIso()}
      await audit(c.env.DB,{actor_user_id:id,action:'user.register.google',resource_type:'user',resource_id:id})
    }
  }
  return user
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.env.CLERK_PUBLISHABLE_KEY || !c.env.CLERK_JWT_PUBLIC_KEY || !c.env.CLERK_SECRET_KEY)
    throw new ApiError(503, 'google_auth_not_configured', 'Autentikasi Google OLTAVYN belum dikonfigurasi.')
  const clerkToken = getCookie(c, '__session')
  if (!clerkToken) throw new ApiError(401, 'unauthenticated', 'Silakan masuk menggunakan Google.')
  const claims = await verifyClerkToken(clerkToken, c)
  const user = await resolveClerkUser(c, claims)
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
auth.get('/me', async (c, next) => {
  if (!getCookie(c, COOKIE) && !getCookie(c, '__session')) return c.json({ user: null })
  try { await requireAuth(c, next) } catch { return c.json({ user: null }) }
  const user=c.get('user')
  return c.json({ user })
})
