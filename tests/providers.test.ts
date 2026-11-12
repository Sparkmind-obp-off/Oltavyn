// Provider adapter contract tests with mocked fetch. NO network calls are made.
// Run: npm run test:providers
import { firecrawlScrape, groqGenerate, providerStatus, redact, runActor, tavilySearch, ProviderError } from '../src/lib/providers'
import { weightedTotal } from '../src/routes/affiliate'
import { AGENT_TOOLS, authorizeTool, validateToolInput } from '../src/lib/agentRuntime'

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
ok(s.every((p) => p.state === 'unconfigured'), 'all providers unconfigured without secrets')
s = providerStatus({ GROQ_API_KEY: SECRET })
ok(s.find((p) => p.id === 'groq')!.state === 'configured_unverified', 'secret present = configured_unverified (not validated)')
ok(!JSON.stringify(s).includes(SECRET), 'status never contains secret')
ok(providerStatus({ GROQ_API_KEY: SECRET, PROVIDERS_ENABLED: 'false' }).every((p) => p.state === 'disabled'), 'global kill switch')
ok(providerStatus({ TAVILY_ENABLED: 'false' }).find((p) => p.id === 'tavily')!.state === 'disabled', 'per-provider kill switch')
ok(providerStatus({ SCRAPELY_TOKEN: SECRET }).find((p) => p.id === 'scrapely')!.state === 'configured_unverified', 'Scrape.ly secret present remains configured but unverified')

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
ok(sent.model === 'openai/gpt-oss-120b' && sent.max_completion_tokens === 1800, 'invalid model name replaced by default; output bounded')
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
const scrapelyEnv = { SCRAPELY_TOKEN: SECRET, SCRAPELY_ALLOWED_ACTORS: 'approved/task' }
await rejects(runActor(scrapelyEnv, noNet, 'scrapely', { actor_id: 'approved/task', confirm_run: true, max_total_charge_usd: 0.05, max_items: 10, timeout_seconds: 60 }), 'provider_unreachable', 'Scrape.ly uses the documented API base and path with mock transport')
await rejects(runActor(env, noNet, 'apify', { actor_id: 'apify/web-scraper' }), 'explicit_approval_required', 'missing confirm_run refused')
await rejects(runActor(env, noNet, 'apify', { actor_id: 'apify/web-scraper', confirm_run: 'true' }), 'explicit_approval_required', 'string "true" is not confirmation')
await rejects(runActor(env, noNet, 'apify', { actor_id: 'apify/web-scraper', confirm_run: true }), 'spend_cap_required', 'Actor run requires an explicit per-run USD spend cap')
await rejects(runActor(env, noNet, 'apify', { actor_id: 'apify/web-scraper', confirm_run: true, input: { big: 'x'.repeat(30000) } }), 'input_too_large', 'oversized input refused')
const a = await runActor(env, mock(201, { data: { id: 'run1', status: 'READY', defaultDatasetId: 'ds1' } }), 'apify', { actor_id: 'apify/web-scraper', confirm_run: true, input: {}, max_total_charge_usd: 0.05, max_items: 10, timeout_seconds: 60 })
const apifyRunUrl = new URL(calls.at(-1)!.url)
ok(a.run_id === 'run1' && apifyRunUrl.pathname.endsWith('/acts/apify~web-scraper/runs') && apifyRunUrl.searchParams.get('maxTotalChargeUsd') === '0.05' && apifyRunUrl.searchParams.get('maxItems') === '10', 'Apify run uses official path and sends spend/item caps')
const sc = await runActor(scrapelyEnv, mock(202, { data: { id: 'scr1', status: 'QUEUED' } }), 'scrapely', { actor_id: 'approved~task', confirm_run: true, input: {}, max_total_charge_usd: 0.05, max_items: 10, timeout_seconds: 60 })
const scrapelyRunUrl = new URL(calls.at(-1)!.url)
ok(sc.run_id === 'scr1' && scrapelyRunUrl.href.startsWith('https://api.scrape.ly/v2/actors/approved~task/runs?') && scrapelyRunUrl.searchParams.get('maxTotalChargeUsd') === '0.05', 'Scrape.ly uses documented API path and sends spend cap')

console.log('Firecrawl')
const fenv = { FIRECRAWL_API_KEY: SECRET }
for (const bad of ['http://localhost/x','http://127.0.0.1/','http://10.0.0.5/','http://169.254.169.254/latest/meta-data','http://192.168.1.1/','http://[::1]/','http://intranet/','ftp://example.com/','http://user:pw@example.com/','http://example.com:8080/'])
  await rejects(firecrawlScrape(fenv, noNet, { url: bad }), bad.startsWith('ftp') || bad.includes('@') || bad.includes(':8080') ? 'invalid_url' : 'url_not_public', 'SSRF blocked: ' + bad)
await rejects(firecrawlScrape({}, noNet, { url: 'https://example.com' }), 'provider_not_configured', 'firecrawl without key fails safely')
const fc = await firecrawlScrape(fenv, mock(200, { success: true, data: { markdown: '# Hi', metadata: { title: 'Example', sourceURL: 'https://example.com/', statusCode: 200, creditsUsed: 1 } } }), { url: 'https://example.com' })
ok(fc.title === 'Example' && fc.status === 'lead_unreviewed' && fc.credits_used === 1 && calls.at(-1)!.url === 'https://api.firecrawl.dev/v1/scrape', 'firecrawl scrape: official endpoint, lead labelled, credits recorded')
await rejects(firecrawlScrape(fenv, mock(200, { success: false }), { url: 'https://example.com' }), 'provider_error', 'firecrawl unsuccessful response mapped')

console.log('Timeout & redaction')
const slow = groqGenerate(env, mock(200, {}, 20000), { prompt: 'x' })
await rejects(slow, 'provider_unreachable', 'request times out (15s)')
ok(redact(`token ${SECRET} and Bearer abc.def-123`, env) === 'token [REDACTED] and Bearer [REDACTED]', 'redact removes secrets and bearer tokens')

console.log('Agent tool registry and permission policy')
ok(AGENT_TOOLS.some((t) => t.id === 'workspace.get_summary' && t.enabled && t.permission === 'R0'), 'workspace summary is enabled read-only tool')
ok(authorizeTool('workspace.get_summary', {}).ok, 'read-only tool passes policy')
ok(!authorizeTool('publication.publish', {}).ok, 'publishing tool is denied')
ok(!authorizeTool('provider.actor.run', { provider: 'apify', actor_id: 'x/y' }).ok, 'paid Actor tool remains disabled')
ok(!authorizeTool('content.create_draft', { product_id: 'p1', format: 'video' }).ok, 'draft write remains disabled until approval executor exists')
const listTool = AGENT_TOOLS.find((t) => t.id === 'products.list')!
ok(validateToolInput(listTool, { query: 'rak' }).ok, 'known product query accepted')
ok(!validateToolInput(listTool, { query: 'rak', sql: 'DROP TABLE users' }).ok, 'unknown tool input fields rejected')
ok(!validateToolInput(listTool, { query: 'x'.repeat(81) }).ok, 'oversized tool input rejected')
ok(!validateToolInput(listTool, []).ok, 'array is not a valid tool input object')

console.log('Scorecard formula')
ok(weightedTotal({ demand: 4, quality: 3, commission: 2, visual_potential: 5, price_accessibility: 4, seller_risk: 2 }) === 71, 'formula = 71')
ok(weightedTotal({ demand: 5, quality: 5, commission: 5, visual_potential: 5, price_accessibility: 5, seller_risk: 1 }) === 100, 'max = 100')
ok(weightedTotal({ demand: 1, quality: 1, commission: 1, visual_potential: 1, price_accessibility: 1, seller_risk: 5 }) === 20, 'min = 20')
ok(weightedTotal({ demand: 4, quality: null, commission: 2, visual_potential: 5, price_accessibility: 4, seller_risk: 2 }) === null, 'incomplete = null')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
