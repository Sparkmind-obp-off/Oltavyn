// Bounded OpenAI-compatible tool-calling loop for OLTAVYN.
// This module never executes model-provided code or URLs. The caller supplies
// server-owned tool schemas and a policy-checked executor.
export type AgentChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
}
export type AgentFunctionTool = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, { type: 'string' | 'integer'; description?: string }>
      required?: string[]
      additionalProperties: false
    }
  }
}
export type ToolExecutionResult = { ok: true; output: unknown } | { ok: false; error: string }
export type GroqToolLoopInput = {
  apiKey: string
  baseUrl?: string
  model: string
  messages: AgentChatMessage[]
  tools: AgentFunctionTool[]
  execute: (name: string, args: unknown) => Promise<ToolExecutionResult>
  fetchImpl?: typeof fetch
  maxToolCalls?: number
  maxIterations?: number
  maxTokens?: number
}
export type GroqToolLoopResult = {
  text: string
  model: string
  toolCalls: Array<{ name: string; arguments: unknown; result: ToolExecutionResult }>
  iterations: number
  usage: { prompt_tokens: number | null; completion_tokens: number | null; total_tokens: number | null } | null
}
const safeObject = (raw: string): unknown => {
  try {
    const value = JSON.parse(raw)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch { return null }
}
const bounded = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(n)))
export async function runGroqToolLoop(input: GroqToolLoopInput): Promise<GroqToolLoopResult> {
  if (!input.apiKey) throw new Error('groq_not_configured')
  if (!input.tools.length) throw new Error('tool_registry_empty')
  const fetcher = input.fetchImpl || fetch
  const endpoint = (input.baseUrl || 'https://api.groq.com/openai/v1').replace(/\/+$/, '') + '/chat/completions'
  const maxCalls = bounded(input.maxToolCalls ?? 4, 1, 8)
  const maxIterations = bounded(input.maxIterations ?? 4, 1, 6)
  const messages: AgentChatMessage[] = input.messages.slice(-16).map(m => ({ ...m }))
  const toolCalls: GroqToolLoopResult['toolCalls'] = []
  let usage: GroqToolLoopResult['usage'] = null
  let model = input.model
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + input.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.model,
        messages,
        tools: input.tools,
        tool_choice: 'auto',
        parallel_tool_calls: false,
        temperature: 0.2,
        max_completion_tokens: bounded(input.maxTokens ?? 1600, 256, 2400),
      }),
    })
    if (!response.ok) throw new Error('groq_tool_request_failed_' + response.status)
    const payload: any = await response.json()
    model = typeof payload.model === 'string' ? payload.model.slice(0, 100) : input.model
    if (payload.usage && typeof payload.usage === 'object') usage = {
      prompt_tokens: Number.isFinite(Number(payload.usage.prompt_tokens)) ? Number(payload.usage.prompt_tokens) : null,
      completion_tokens: Number.isFinite(Number(payload.usage.completion_tokens)) ? Number(payload.usage.completion_tokens) : null,
      total_tokens: Number.isFinite(Number(payload.usage.total_tokens)) ? Number(payload.usage.total_tokens) : null,
    }
    const choice = payload.choices?.[0]?.message
    if (!choice) throw new Error('groq_tool_response_invalid')
    const requested = Array.isArray(choice.tool_calls) ? choice.tool_calls : []
    if (!requested.length) return {
      text: typeof choice.content === 'string' ? choice.content.slice(0, 24000) : '',
      model, toolCalls, iterations: iteration + 1, usage,
    }
    const remainingCalls = maxCalls - toolCalls.length
    if (remainingCalls <= 0) return { text: 'Batas pemanggilan tool untuk giliran ini tercapai.', model, toolCalls, iterations: iteration + 1, usage }
    const allowedCalls = requested.slice(0, remainingCalls)
    messages.push({
      role: 'assistant',
      content: typeof choice.content === 'string' ? choice.content : null,
      tool_calls: allowedCalls.map((call: any) => ({
        id: String(call.id || '').slice(0, 120),
        type: 'function',
        function: { name: String(call.function?.name || '').slice(0, 120), arguments: String(call.function?.arguments || '').slice(0, 4000) },
      })),
    })
    for (const call of allowedCalls) {
      const name = String(call.function?.name || '')
      const args = safeObject(String(call.function?.arguments || ''))
      let result: ToolExecutionResult
      if (!call.id || !name || !args) result = { ok: false, error: 'invalid_tool_call' }
      else {
        try { result = await input.execute(name, args) }
        catch { result = { ok: false, error: 'tool_execution_failed' } }
      }
      toolCalls.push({ name, arguments: args, result })
      messages.push({
        role: 'tool',
        tool_call_id: String(call.id || '').slice(0, 120),
        content: JSON.stringify(result).slice(0, 12000),
      })
    }
    if (toolCalls.length >= maxCalls) {
      messages.push({ role: 'user', content: 'Batas pemanggilan tool untuk giliran ini tercapai. Rangkum hanya hasil yang tersedia dan jangan meminta tool tambahan.' })
    }
  }
  // A final no-tools completion is intentionally not attempted after the iteration
  // ceiling; caller must report the bounded partial result instead of looping.
  return { text: 'Batas langkah Agent tercapai. Hasil tool yang sudah selesai tersedia untuk dirangkum.', model, toolCalls, iterations: maxIterations, usage }
}
