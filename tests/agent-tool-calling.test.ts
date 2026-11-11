import { runGroqToolLoop } from '../src/lib/groqToolCalling'

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error('FAIL: ' + message)
}
const replies = [
  { model: 'llama-test', choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'workspace.get_summary', arguments: '{}' } }] } }], usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 } },
  { model: 'llama-test', choices: [{ message: { role: 'assistant', content: 'Workspace memiliki 3 produk.' } }], usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 } },
]
let calls = 0
const fetchMock: typeof fetch = async (_url, init) => {
  calls++
  const body = JSON.parse(String(init?.body || '{}'))
  assert(body.tool_choice === 'auto', 'tool choice is auto')
  return new Response(JSON.stringify(replies.shift()), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
const result = await runGroqToolLoop({
  apiKey: 'test-only',
  model: 'llama-test',
  fetchImpl: fetchMock,
  tools: [{ type: 'function', function: { name: 'workspace.get_summary', description: 'Read summary', parameters: { type: 'object', properties: {}, additionalProperties: false } } }],
  messages: [{ role: 'user', content: 'Ringkas workspace' }],
  execute: async (name, args) => {
    assert(name === 'workspace.get_summary', 'server receives allowlisted tool name')
    assert(JSON.stringify(args) === '{}', 'arguments parsed as object')
    return { ok: true, output: { products: 3 } }
  },
})
assert(calls === 2, 'one tool request then one final answer')
assert(result.toolCalls.length === 1, 'tool call recorded')
assert(result.text === 'Workspace memiliki 3 produk.', 'final assistant answer returned')
assert(result.usage?.total_tokens === 28, 'latest usage returned')
console.log('PASS: bounded Groq tool-calling loop')
