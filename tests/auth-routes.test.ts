// Route-level integration tests against the REAL Hono app (src/index.tsx) with a node:sqlite D1 shim.
// Regression for RC-6 (/api/auth/me returned the SPA HTML shell), RC-8 (Bearer token), JSON 404s,
// workspace + agent conversation isolation. NO network: users are pre-mapped so Clerk API is never called.
import test from 'node:test'
import assert from 'node:assert/strict'
// @ts-ignore node builtin
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import app from '../src/index'

function d1(db: any): any {
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } } },
    async first() { return db.prepare(sql).get(...args) ?? null },
    async all() { return { results: db.prepare(sql).all(...args) } },
  })
  return { prepare: (sql: string) => stmt(sql), batch: async (l: any[]) => { const o = []; for (const s of l) o.push(await s.run()); return o } }
}
const raw = new DatabaseSync(':memory:')
for (const f of readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort()) raw.exec(readFileSync('migrations/' + f, 'utf8'))
const now = new Date().toISOString()
for (const [id, sub] of [['usr_a', 'user_a'], ['usr_b', 'user_b']]) raw.exec(`INSERT INTO users (id,email,password_hash,password_salt,password_iterations,status,created_at,clerk_user_id,plan_started_at) VALUES ('${id}','${id}@t.dev','x','00',1,'active','${now}','${sub}','${now}')`)
raw.exec(`INSERT INTO workspaces (id,owner_user_id,name,created_at,updated_at) VALUES ('ws_b','usr_b','B','${now}','${now}')`)
raw.exec(`INSERT INTO agent_conversations (id,workspace_id,user_id,title,created_at,updated_at) VALUES ('agt_b','ws_b','usr_b','secret','${now}','${now}')`)

const ORIGIN = 'https://oltavyn.test', ISS = 'https://clerk.oltavyn.test'
const b64u = (x: any) => Buffer.from(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
let env: any, priv: CryptoKey
async function tok(sub: string) {
  const n = Math.floor(Date.now() / 1000)
  const data = b64u(JSON.stringify({ alg: 'RS256' })) + '.' + b64u(JSON.stringify({ sub, iss: ISS, azp: ORIGIN, iat: n, nbf: n - 5, exp: n + 60 }))
  return data + '.' + b64u(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', priv, new TextEncoder().encode(data))))
}
const req = (path: string, init: any = {}) => app.request(ORIGIN + path, init, env)

test.before(async () => {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  priv = kp.privateKey
  const pem = '-----BEGIN PUBLIC KEY-----\n' + Buffer.from(new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey))).toString('base64') + '\n-----END PUBLIC KEY-----'
  env = { DB: d1(raw), CLERK_PUBLISHABLE_KEY: 'pk_test_Y2xlcmsub2x0YXZ5bi50ZXN0JA', CLERK_SECRET_KEY: 'sk_test_never_called', CLERK_JWT_PUBLIC_KEY: pem, CLERK_ISSUER: ISS, CLERK_AUTHORIZED_PARTIES: ORIGIN }
})

test('RC-6: /api/auth/me with valid cookie returns JSON user, not the HTML shell', async () => {
  const r = await req('/api/auth/me', { headers: { Cookie: '__session=' + await tok('user_a') } })
  assert.match(r.headers.get('content-type') || '', /application\/json/)
  assert.equal((await r.json()).user.id, 'usr_a')
})
test('RC-8: /api/auth/me and protected API accept Authorization: Bearer', async () => {
  const h = { Authorization: 'Bearer ' + await tok('user_a') }
  assert.equal((await (await req('/api/auth/me', { headers: h })).json()).user.id, 'usr_a')
  const w = await req('/api/workspaces', { headers: h }); assert.equal(w.status, 200); assert.deepEqual((await w.json()).workspaces, [])
})
test('no session / forged token: /me → {user:null}; protected API → 401 JSON', async () => {
  assert.deepEqual(await (await req('/api/auth/me')).json(), { user: null })
  assert.deepEqual(await (await req('/api/auth/me', { headers: { Authorization: 'Bearer a.b.c' } })).json(), { user: null })
  const r = await req('/api/workspaces'); assert.equal(r.status, 401); assert.equal((await r.json()).error.code, 'unauthenticated')
})
test('unknown /api path answers JSON 404 (never HTML)', async () => {
  const r = await req('/api/does-not-exist', { headers: { Authorization: 'Bearer ' + await tok('user_a') } })
  assert.equal(r.status, 404); assert.equal((await r.json()).error.code, 'not_found')
})
test('workspace create + isolation: A cannot read B workspace', async () => {
  const h = { Authorization: 'Bearer ' + await tok('user_a'), 'Content-Type': 'application/json', Origin: ORIGIN }
  const c = await req('/api/workspaces', { method: 'POST', headers: h, body: JSON.stringify({ name: 'A ws' }) })
  assert.equal(c.status, 201)
  assert.equal((await req('/api/workspaces/ws_b', { headers: h })).status, 404)
  const list = await (await req('/api/workspaces', { headers: h })).json()
  assert.equal(list.workspaces.length, 1); assert.equal(list.workspaces[0].name, 'A ws')
})
test('agent isolation: A cannot list/read B conversations or chat into B workspace', async () => {
  const h = { Authorization: 'Bearer ' + await tok('user_a'), 'Content-Type': 'application/json', Origin: ORIGIN }
  assert.equal((await req('/api/affiliate/agent/conversations?workspace_id=ws_b', { headers: h })).status, 404)
  assert.equal((await req('/api/affiliate/agent/conversations/agt_b/messages', { headers: h })).status, 404)
  assert.equal((await req('/api/affiliate/agent/chat', { method: 'POST', headers: h, body: JSON.stringify({ workspace_id: 'ws_b', message: 'hi' }) })).status, 404)
})
test('agent chat without Groq key: stored, honest fallback, no crash', async () => {
  const h = { Authorization: 'Bearer ' + await tok('user_a'), 'Content-Type': 'application/json', Origin: ORIGIN }
  const wsId = (await (await req('/api/workspaces', { headers: h })).json()).workspaces[0].id
  const r = await req('/api/affiliate/agent/chat', { method: 'POST', headers: h, body: JSON.stringify({ workspace_id: wsId, message: 'Analisis workspace saya' }) })
  assert.equal(r.status, 200)
  const d = await r.json(); assert.ok(d.conversation_id); assert.equal(d.message.metadata.provider_state, 'unavailable')
  const msgs = await (await req('/api/affiliate/agent/conversations/' + d.conversation_id + '/messages', { headers: h })).json()
  assert.equal(msgs.messages.length, 2)
  const list = await (await req('/api/affiliate/agent/conversations?workspace_id=' + wsId, { headers: h })).json()
  assert.equal(list.conversations.length, 1)
})
test('CSRF: cross-origin POST rejected even with valid Bearer', async () => {
  const r = await req('/api/workspaces', { method: 'POST', headers: { Authorization: 'Bearer ' + await tok('user_a'), 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{"name":"x"}' })
  assert.equal(r.status, 403)
})
