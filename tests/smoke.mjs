// OLTAVYN Google-only authentication smoke test.
// Usage: BASE_URL=http://localhost:3000 node tests/smoke.mjs
const BASE = process.env.BASE_URL || 'http://localhost:3000'
let pass = 0, fail = 0
const check = (condition, label, detail = '') => {
  if (condition) { pass++; console.log('  ✓', label) }
  else { fail++; console.error('  ✗', label, detail) }
}
async function request(method, path, body) {
  const response = await fetch(BASE + path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  let json = null
  try { json = await response.json() } catch {}
  return { status: response.status, json }
}

console.log('Google-only auth')
let r = await request('GET', '/api/auth/config')
check(r.status === 200 && r.json?.google_only === true && r.json?.auth_method === 'google_only', 'server declares Google-only authentication')
r = await request('POST', '/api/auth/register', { email: 'legacy@example.test', password: 'not-a-real-password' })
check(r.status === 410 && r.json?.error?.code === 'google_only_auth', 'email/password registration is disabled')
r = await request('POST', '/api/auth/login', { email: 'legacy@example.test', password: 'not-a-real-password' })
check(r.status === 410 && r.json?.error?.code === 'google_only_auth', 'email/password login is disabled')
r = await request('GET', '/api/workspaces')
check(r.status === 401, 'private API rejects unauthenticated visitors')

console.log('Public entry')
r = await request('GET', '/api/health')
check(r.status === 200 && r.json?.ok === true, 'health endpoint is available')
r = await request('GET', '/api/public/catalog')
check(r.status === 200 && Array.isArray(r.json?.catalog), 'public paid-service catalog is readable')
console.log('\nResult: ' + pass + ' passed, ' + fail + ' failed')
if (fail) process.exit(1)
