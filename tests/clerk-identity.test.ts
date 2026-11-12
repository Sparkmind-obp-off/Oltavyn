// Clerk Google authentication regression tests. NO network: Clerk API is mocked, JWTs are signed
// with a throwaway RSA key generated per run. These prove backend logic only — NOT real Google OAuth.
import test from 'node:test'
import assert from 'node:assert/strict'
// @ts-ignore node builtin
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { isGoogleExternalAccount, evaluateClerkProfile } from '../src/lib/clerkIdentity'
import { verifyClerkToken, resolveClerkUser } from '../src/lib/clerkAuth'
import { ApiError } from '../src/lib/core'

// ---------- helpers ----------
function d1(db: any): any {
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } } },
    async first() { return db.prepare(sql).get(...args) ?? null },
    async all() { return { results: db.prepare(sql).all(...args) } },
  })
  return { prepare: (sql: string) => stmt(sql) }
}
function freshDb() {
  const raw = new DatabaseSync(':memory:')
  for (const f of readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort()) raw.exec(readFileSync('migrations/' + f, 'utf8'))
  return { raw, db: d1(raw) }
}
const b64u = (b: Uint8Array | string) => Buffer.from(b as any).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
async function rsa() {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey))
  return { kp, pem: '-----BEGIN PUBLIC KEY-----\n' + Buffer.from(spki).toString('base64') + '\n-----END PUBLIC KEY-----' }
}
async function sign(priv: CryptoKey, claims: any, header: any = { alg: 'RS256', typ: 'JWT', kid: 'ins_test' }) {
  const data = b64u(JSON.stringify(header)) + '.' + b64u(JSON.stringify(claims))
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', priv, new TextEncoder().encode(data)))
  return data + '.' + b64u(sig)
}
const ISS = 'https://clerk.oltavyn.biz.id', AZP = 'https://oltavyn.biz.id', NOW = 1_800_000_000
const baseClaims = (o: any = {}) => ({ sub: 'user_abc', sid: 'sess_1', iss: ISS, azp: AZP, iat: NOW - 10, nbf: NOW - 10, exp: NOW + 60, ...o })
const profile = (o: any = {}) => ({
  id: 'user_abc', first_name: 'Tes', last_name: 'Pengguna', banned: false, locked: false,
  primary_email_address_id: 'idn_e1',
  email_addresses: [{ id: 'idn_e1', email_address: 'Tes.User@Gmail.com', verification: { status: 'verified', strategy: 'from_oauth_google' } }],
  external_accounts: [{ id: 'idn_x1', provider: 'oauth_google', verification: { status: 'verified', strategy: 'oauth_google' } }],
  ...o,
})
const code = async (p: Promise<unknown>) => { try { await p; return 'OK' } catch (e) { return e instanceof ApiError ? e.code : 'THROWN:' + (e as Error).message } }

// ---------- provider ----------
test('provider: oauth_google (live Clerk Production value) accepted', () => assert.equal(isGoogleExternalAccount('oauth_google'), true))
test('provider: legacy google alias accepted', () => { assert.equal(isGoogleExternalAccount('google'), true); assert.equal(isGoogleExternalAccount(' GOOGLE '), true) })
test('provider: microsoft/apple/github/unknown/missing rejected', () => {
  for (const p of ['oauth_microsoft', 'oauth_apple', 'oauth_github', 'oauth_google_evil', 'email', 'phone', '', null, undefined, 42]) assert.equal(isGoogleExternalAccount(p), false, String(p))
})
test('profile: valid Google identity normalises email', () => assert.deepEqual(evaluateClerkProfile(profile()), { ok: true, email: 'tes.user@gmail.com', displayName: 'Tes Pengguna' }))
test('profile: microsoft-only rejected', () => assert.equal((evaluateClerkProfile(profile({ external_accounts: [{ provider: 'oauth_microsoft' }] })) as any).code, 'google_sign_in_required'))
test('profile: apple-only rejected', () => assert.equal((evaluateClerkProfile(profile({ external_accounts: [{ provider: 'oauth_apple' }] })) as any).code, 'google_sign_in_required'))
test('profile: no external account rejected', () => assert.equal((evaluateClerkProfile(profile({ external_accounts: [] })) as any).code, 'google_sign_in_required'))
test('profile: unverified Google external account rejected', () => assert.equal((evaluateClerkProfile(profile({ external_accounts: [{ provider: 'oauth_google', verification: { status: 'unverified' } }] })) as any).code, 'google_sign_in_required'))
test('profile: unverified email rejected', () => assert.equal((evaluateClerkProfile(profile({ email_addresses: [{ id: 'idn_e1', email_address: 'a@b.co', verification: { status: 'unverified' } }] })) as any).code, 'verified_google_email_required'))
test('profile: missing primary email rejected', () => assert.equal((evaluateClerkProfile(profile({ primary_email_address_id: null })) as any).code, 'verified_google_email_required'))
test('profile: banned/locked Clerk user rejected', () => {
  assert.equal((evaluateClerkProfile(profile({ banned: true })) as any).code, 'account_disabled')
  assert.equal((evaluateClerkProfile(profile({ locked: true })) as any).code, 'account_disabled')
})

// ---------- JWT ----------
test('jwt: full verification matrix', async () => {
  const { kp, pem } = await rsa()
  const other = await rsa()
  const opt = { publicKeyPem: pem, issuer: ISS, authorizedParties: [AZP], nowSeconds: NOW }
  assert.equal((await verifyClerkToken(await sign(kp.privateKey, baseClaims()), opt)).sub, 'user_abc', 'valid production token')
  assert.equal(await code(verifyClerkToken(await sign(other.kp.privateKey, baseClaims()), opt)), 'invalid_session', 'invalid signature')
  assert.equal(await code(verifyClerkToken(await sign(kp.privateKey, baseClaims({ iss: 'https://amused-joey-1181.clerk.accounts.dev' })), opt)), 'invalid_session', 'development issuer rejected in production')
  assert.equal(await code(verifyClerkToken(await sign(kp.privateKey, baseClaims({ exp: NOW - 120 })), opt)), 'invalid_session', 'expired')
  assert.equal(await code(verifyClerkToken(await sign(kp.privateKey, baseClaims({ nbf: NOW + 600 })), opt)), 'invalid_session', 'not yet valid')
  assert.equal(await code(verifyClerkToken(await sign(kp.privateKey, baseClaims({ sub: undefined })), opt)), 'invalid_session', 'missing sub')
  assert.equal(await code(verifyClerkToken(await sign(kp.privateKey, baseClaims({ sub: 'admin' })), opt)), 'invalid_session', 'non-Clerk sub')
  assert.equal(await code(verifyClerkToken(await sign(kp.privateKey, baseClaims({ azp: 'https://evil.example' })), opt)), 'invalid_session', 'wrong azp')
  assert.equal(await code(verifyClerkToken(await sign(kp.privateKey, baseClaims({ azp: undefined })), opt)), 'invalid_session', 'missing azp')
  assert.equal(await code(verifyClerkToken(await sign(kp.privateKey, baseClaims(), { alg: 'HS256' }), opt)), 'invalid_session', 'alg confusion')
  assert.equal(await code(verifyClerkToken(await sign(kp.privateKey, baseClaims(), { alg: 'none' }), opt)), 'invalid_session', 'alg none')
  assert.equal(await code(verifyClerkToken('', opt)), 'invalid_session', 'missing session')
  assert.equal(await code(verifyClerkToken('not.a.jwt!', opt)), 'invalid_session', 'malformed')
  assert.equal(await code(verifyClerkToken('a.b', opt)), 'invalid_session', 'two segments')
  const good = await sign(kp.privateKey, baseClaims())
  const [h, , s] = good.split('.')
  assert.equal(await code(verifyClerkToken(h + '.' + b64u(JSON.stringify(baseClaims({ sub: 'user_victim' }))) + '.' + s, opt)), 'invalid_session', 'tampered payload')
  assert.equal(await code(verifyClerkToken(good, { ...opt, issuer: undefined as any })), 'clerk_not_configured', 'issuer must be configured')
  assert.equal(await code(verifyClerkToken(good, { ...opt, publicKeyPem: undefined })), 'clerk_not_configured', 'public key must be configured')
  assert.equal(await code(verifyClerkToken(await sign(kp.privateKey, baseClaims({ exp: NOW - 10 })), opt)), 'OK', '30s clock skew tolerated')
})

// ---------- user resolution / D1 ----------
const fetcher = (p: any, calls = { n: 0 }) => async (_id: string) => { calls.n++; return p }

test('d1: new Google identity provisions exactly one Free user', async () => {
  const { raw, db } = freshDb()
  const u: any = await resolveClerkUser(db, 'user_abc', fetcher(profile()))
  assert.equal(u.email, 'tes.user@gmail.com'); assert.equal(u.plan_tier, 'free'); assert.equal(u.plan_status, 'active'); assert.ok(u.plan_started_at)
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM users').get().n, 1)
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='user.register.google'").get().n, 1)
})
test('d1: existing mapping returns same user without calling Clerk', async () => {
  const { db } = freshDb(); const calls = { n: 0 }
  const a: any = await resolveClerkUser(db, 'user_abc', fetcher(profile()))
  const b: any = await resolveClerkUser(db, 'user_abc', fetcher(profile(), calls))
  assert.equal(a.id, b.id); assert.equal(calls.n, 0)
})
test('d1: concurrent first logins create one user (idempotent)', async () => {
  const { raw, db } = freshDb()
  const res = await Promise.allSettled(Array.from({ length: 8 }, () => resolveClerkUser(db, 'user_abc', fetcher(profile()))))
  const ids = new Set(res.filter((r) => r.status === 'fulfilled').map((r: any) => r.value.id))
  assert.equal(ids.size, 1); assert.equal(raw.prepare('SELECT COUNT(*) n FROM users').get().n, 1)
})
test('d1: disabled mapped account rejected (no re-provision)', async () => {
  const { raw, db } = freshDb()
  await resolveClerkUser(db, 'user_abc', fetcher(profile()))
  raw.exec("UPDATE users SET status='disabled'")
  assert.equal(await code(resolveClerkUser(db, 'user_abc', fetcher(profile()))), 'account_disabled')
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM users').get().n, 1)
})
test('d1: existing local user with same verified email is linked, not duplicated', async () => {
  const { raw, db } = freshDb()
  raw.exec("INSERT INTO users (id,email,password_hash,password_salt,password_iterations,created_at) VALUES ('usr_old','tes.user@gmail.com','x','00',1,'2026-01-01T00:00:00Z')")
  const u: any = await resolveClerkUser(db, 'user_abc', fetcher(profile()))
  assert.equal(u.id, 'usr_old'); assert.equal(raw.prepare("SELECT clerk_user_id c FROM users WHERE id='usr_old'").get().c, 'user_abc')
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM users').get().n, 1)
})
test('d1: email already mapped to a different Clerk identity → conflict, mapping not overwritten', async () => {
  const { raw, db } = freshDb()
  await resolveClerkUser(db, 'user_first', fetcher(profile({ id: 'user_first' })))
  assert.equal(await code(resolveClerkUser(db, 'user_second', fetcher(profile({ id: 'user_second' })))), 'identity_conflict')
  assert.equal(raw.prepare('SELECT clerk_user_id c FROM users').get().c, 'user_first')
})
test('d1: disabled local account with same email is not linked', async () => {
  const { raw, db } = freshDb()
  raw.exec("INSERT INTO users (id,email,password_hash,password_salt,password_iterations,status,created_at) VALUES ('usr_old','tes.user@gmail.com','x','00',1,'disabled','2026-01-01T00:00:00Z')")
  assert.equal(await code(resolveClerkUser(db, 'user_abc', fetcher(profile()))), 'account_disabled')
})
test('d1: non-Google / unverified profiles never provision a user', async () => {
  const { raw, db } = freshDb()
  assert.equal(await code(resolveClerkUser(db, 'user_abc', fetcher(profile({ external_accounts: [{ provider: 'oauth_github' }] })))), 'google_sign_in_required')
  assert.equal(await code(resolveClerkUser(db, 'user_abc', fetcher(profile({ email_addresses: [{ id: 'idn_e1', email_address: 'x@y.co', verification: { status: 'unverified' } }] })))), 'verified_google_email_required')
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM users').get().n, 0)
})
test('d1: Clerk profile id mismatch rejected', async () => {
  const { db } = freshDb()
  assert.equal(await code(resolveClerkUser(db, 'user_abc', fetcher(profile({ id: 'user_other' })))), 'invalid_session')
})
