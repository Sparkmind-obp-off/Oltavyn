import test from 'node:test'
import assert from 'node:assert/strict'
import { verifyAccessToken } from '../src/lib/cloudflareAccess'

const team = 'oltavyn-test.cloudflareaccess.com'
const audience = 'oltavyn-test-audience'
const b64url = (value: Uint8Array | ArrayBuffer | string) => Buffer.from(typeof value === 'string' ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : value).toString('base64url')

let privateKey: CryptoKey
let publicJwk: JsonWebKey & { kid: string; alg: string; use: string }
let originalFetch: typeof fetch

test('Cloudflare Access JWT verification', async t => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  privateKey = pair.privateKey
  publicJwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey) as JsonWebKey), kid: 'test-kid', alg: 'RS256', use: 'sig' }
  originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = (async () => new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch

  const makeToken = async (overrides: Record<string, unknown> = {}) => {
    const now = Math.floor(Date.now() / 1000)
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test-kid' }))
    const payload = b64url(JSON.stringify({ iss: 'https://' + team, aud: [audience], sub: 'test-user', exp: now + 300, nbf: now - 5, ...overrides }))
    const signingInput = header + '.' + payload
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(signingInput))
    return signingInput + '.' + b64url(signature)
  }

  await t.test('accepts a valid signed token with the expected issuer and audience', async () => {
    await verifyAccessToken(await makeToken(), team, [audience])
  })

  await t.test('rejects a token with the wrong audience', async () => {
    const token = await makeToken({ aud: ['wrong-audience'] })
    await assert.rejects(() => verifyAccessToken(token, team, [audience]), (error: any) => error?.code === 'access_invalid')
  })

  await t.test('rejects an expired token', async () => {
    const token = await makeToken({ exp: Math.floor(Date.now() / 1000) - 60 })
    await assert.rejects(() => verifyAccessToken(token, team, [audience]), (error: any) => error?.code === 'access_invalid')
  })

  await t.test('rejects a token with the wrong issuer', async () => {
    const token = await makeToken({ iss: 'https://attacker.example' })
    await assert.rejects(() => verifyAccessToken(token, team, [audience]), (error: any) => error?.code === 'access_invalid')
  })

  await t.test('rejects a tampered signature', async () => {
    const token = await makeToken()
    const parts = token.split('.')
    // Flip a character in the middle: the final base64url char of a 256-byte signature only
    // carries padding bits, so changing it can decode to identical bytes (flaky, not a forgery).
    const mid = Math.floor(parts[2].length / 2)
    parts[2] = parts[2].slice(0, mid) + (parts[2][mid] === 'A' ? 'B' : 'A') + parts[2].slice(mid + 1)
    await assert.rejects(() => verifyAccessToken(parts.join('.'), team, [audience]), (error: any) => error?.code === 'access_invalid')
  })

  await t.test('rejects malformed signature bytes as an authorization error', async () => {
    const token = await makeToken()
    const parts = token.split('.')
    parts[2] = '%%%not-base64%%%'
    await assert.rejects(() => verifyAccessToken(parts.join('.'), team, [audience]), (error: any) => error?.code === 'access_invalid')
  })

  await t.test('rejects oversized tokens before key verification', async () => {
    await assert.rejects(() => verifyAccessToken('x'.repeat(16_385), team, [audience]), (error: any) => error?.code === 'access_invalid')
  })

})
