import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { ApiError, AppEnv } from './lib/core'
import { auth, csrfGuard, requireAuth } from './routes/auth'
import { api } from './routes/domain'

const app = new Hono<AppEnv>()

app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], // inline style attrs only; scripts stay strict
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],
    frameAncestors: ["'none'"],
    formAction: ["'self'"],
    baseUri: ["'self'"],
  },
  referrerPolicy: 'strict-origin-when-cross-origin',
}))

app.use('/api/*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
})
app.use('/api/*', csrfGuard)

app.get('/api/health', (c) => c.json({ ok: true, service: 'oltavyn', version: '0.1.0' }))
app.route('/api/auth', auth)
app.use('/api/*', requireAuth)
app.route('/api', api)

app.notFound((c) => c.req.path.startsWith('/api/') ? c.json({ error: { code: 'not_found', message: 'Endpoint tidak ditemukan.' } }, 404) : c.text('Not found', 404))

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message, details: err.details ?? null } }, err.status as any)
  }
  const reqId = crypto.randomUUID()
  console.error(JSON.stringify({ reqId, path: c.req.path, err: String((err as Error)?.message || err).slice(0, 300) }))
  return c.json({ error: { code: 'internal_error', message: 'Terjadi kesalahan di server.', request_id: reqId } }, 500)
})

const shell = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OLTAVYN — Agentic Content OS</title>
<meta name="description" content="Workbench berbasis bukti: Riset → Peluang → Konten → Publikasi → Pembelajaran.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%231f2a44'/%3E%3Ccircle cx='16' cy='16' r='7' fill='none' stroke='%23d9b26f' stroke-width='3'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/static/app.css">
</head>
<body>
<a class="skip-link" href="#main">Lewati ke konten</a>
<div id="app" aria-live="polite"><p class="boot">Memuat OLTAVYN…</p></div>
<script type="module" src="/static/app.js"></script>
</body>
</html>`

app.get('*', (c) => c.html(shell))

export default app
