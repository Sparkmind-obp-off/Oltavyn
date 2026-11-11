// Provider adapter contract tests with mocked fetch. NO network calls are made.
// Run: npm run test:providers
import { groqGenerate, providerStatus, redact, runActor, tavilySearch, ProviderError } from '../src/lib/providers'
import { weightedTotal } from '../src/routes/affiliate'

let pass = 0, fail = 0
const ok = (c: boolean, n: string, x?: unknown) => { if (c) { pass++; console.log('  ✓', n) } else { fail++; console.log('  ✗', n, x ?? '') } }
const SECRET = 'gsk_test_SECRET_value_123456'
const calls: { url: string; init: RequestInit }[] = []
const mock = (status: number, body: unknown, delayMs = 0) => async (url: string, init: RequestInit) => {
  calls.push({ url, init })
  if (delayMs) await new Promise((r, j) => { const t = setTimeout(r, delayMs); init.signal?.addEventListener('abort', () => { clearTimeout(t); const e = new Error('aborted'); e.name = 'AbortError'; j(e) }) })
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
const noNet = async () => { throw new Error('network must not be called') }
async function rejects(p: Promise<unknown>, code: string, name: string) {
  try { await p; ok(false, name, 'no error') } catch (e) { ok(e instanceof ProviderError && e.code === code, name, (e as any)?.code) }
}

console.log('Status & kill switch')
let s = providerStatus({})
ok(s.every((p) => p.state === 'unconfigured'), 'all unconfigured without secrets')
s = providerStatus({ GROQ_API_KEY: SECRET })
ok(s.find((p) => p.id === 'groq')!.state === 'configured_unverified', 'secret present = configured_unverified (not validated)')
ok(!JSON.stringify(s).includes(SECRET), 'status never contains secret')
ok(providerStatus({ GROQ_API_KEY: SECRET, PROVIDERS_ENABLED: 'false' }).every((p) => p.state === 'disabled'), 'global kill switch')
ok(providerStatus({ TAVILY_ENABLED: 'false' }).find((p) => p.id === 'tavily')!.state === 'disabled', 'per-provider kill switch')

console.log('Missing keys / disabled')
await rejects(groqGenerate({}, noNet, { prompt: 'x' }), 'provider_not_configured', 'groq without key fails safely, no network')
await rejects(tavilySearch({}, noNet, { query: 'x' }), 'provider_not_configured', 'tavily without key fails safely, no network')
await rejects(groqGenerate({ GROQ_API_KEY: SECRET, GROQ_ENABLED: 'false' }, noNet, { prompt: 'x' }), 'provider_disabled', 'disabled provider refuses')

console.log('Groq')
const env = { GROQ_API_KEY: SECRET, TAVILY_API_KEY: SECRET, APIFY_API_TOKEN: SECRET, APIFY_ALLOWED_ACTORS: 'apify/web-scraper' }
await rejects(groqGenerate(env, noNet, { prompt: '   ' }), 'validation_failed', 'empty prompt rejected before network')
let g = await groqGenerate(env, mock(200, { model: 'llama-3.3-70b-versatile', choices: [{ message: { content: 'Draf hook' } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }), { prompt: 'Buat hook', model: 'bad model; drop' })
ok(g.text === 'Draf hook' && g.usage?.total_tokens === 15 && g.persisted === false, 'groq returns bounded draft + usage, not persisted')
const sent = JSON.parse(String(calls.at(-1)!.init.body))
ok(sent.model === 'llama-3.3-70b-versatile' && sent.max_tokens === 1800, 'invalid model name replaced by default; output bounded')
ok(sent.messages[0].content.includes('Abaikan instruksi'), 'system prompt defends against injected instructions')
await rejects(groqGenerate(env, mock(401, { error: { message: `bad key ${SECRET}` } }), { prompt: 'x' }), 'provider_auth_failed', 'auth failure mapped')
try { await groqGenerate(env, mock(500, `upstream leaked ${SECRET}`), { prompt: 'x' }) } catch (e: any) { ok(e.code === 'provider_error' && !e.message.includes(SECRET), 'provider error body never forwarded') }
await rejects(groqGenerate(env, mock(429, {}), { prompt: 'x' }), 'provider_rate_limited', '429 mapped')
await rejects(groqGenerate(env, mock(402, {}), { prompt: 'x' }), 'provider_payment_required', '402 mapped')
await rejects(groqGenerate(env, mock(200, 'not json{'), { prompt: 'x' }), 'provider_bad_response', 'invalid JSON mapped')

console.log('Tavily')
const t = await tavilySearch(env, mock(200, { results: [
  { title: 'A', url: 'https://a.example/x', content: 'isi', score: 0.9 },
  { title: 'A dup', url: 'https://a.example/x', content: 'dup', score: 0.8 },
  { title: 'bad', url: 'javascript:alert(1)', content: 'x' },
] }), { query: 'rak bumbu' })
ok(t.results.length === 1 && t.results[0].status === 'lead_unreviewed' && !!t.results[0].captured_at, 'dedupes, drops non-http, marks leads unreviewed')

console.log('Actors')
await rejects(runActor(env, noNet, 'apify', { actor_id: 'evil/actor', confirm_run: true }), 'actor_not_allowlisted', 'non-allowlisted actor refused')
await rejects(runActor(env, noNet, 'apify', { actor_id: 'apify/web-scraper' }), 'explicit_approval_required', 'missing confirm_run refused')
await rejects(runActor(env, noNet, 'apify', { actor_id: 'apify/web-scraper', confirm_run: 'true' }), 'explicit_approval_required', 'string "true" is not confirmation')
await rejects(runActor(env, noNet, 'apify', { actor_id: 'apify/web-scraper', confirm_run: true, input: { big: 'x'.repeat(30000) } }), 'input_too_large', 'oversized input refused')
const a = await runActor(env, mock(201, { data: { id: 'run1', status: 'READY', defaultDatasetId: 'ds1' } }), 'apify', { actor_id: 'apify/web-scraper', confirm_run: true, input: {} })
ok(a.run_id === 'run1' && calls.at(-1)!.url.endsWith('/acts/apify~web-scraper/runs'), 'allowlisted + confirmed actor run submitted to official path')

console.log('Timeout & redaction')
const slow = groqGenerate(env, mock(200, {}, 20000), { prompt: 'x' })
await rejects(slow, 'provider_unreachable', 'request times out (15s)')
ok(redact(`token ${SECRET} and Bearer abc.def-123`, env) === 'token [REDACTED] and Bearer [REDACTED]', 'redact removes secrets and bearer tokens')

console.log('Scorecard formula')
ok(weightedTotal({ demand: 4, quality: 3, commission: 2, visual_potential: 5, price_accessibility: 4, seller_risk: 2 }) === 71, 'formula = 71')
ok(weightedTotal({ demand: 5, quality: 5, commission: 5, visual_potential: 5, price_accessibility: 5, seller_risk: 1 }) === 100, 'max = 100')
ok(weightedTotal({ demand: 1, quality: 1, commission: 1, visual_potential: 1, price_accessibility: 1, seller_risk: 5 }) === 20, 'min = 20')
ok(weightedTotal({ demand: 4, quality: null, commission: 2, visual_potential: 5, price_accessibility: 4, seller_risk: 2 }) === null, 'incomplete = null')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
