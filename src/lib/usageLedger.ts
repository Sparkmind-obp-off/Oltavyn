// Provider usage & cost ledger with an owner-defined monthly hard stop.
// - Paid Actor runs reserve their per-run spend cap BEFORE execution; the month total of
//   reservations (or verified actual cost) may never exceed PROVIDER_MONTHLY_BUDGET_USD.
// - If no budget is configured, paid runs are refused (fail closed).
// - Free-tier calls (Groq tokens, Tavily credits) are recorded as units; monetary cost stays NULL
//   unless a provider reports it. Call counts are never presented as money.
import { newId, nowIso } from './core'

export class BudgetError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}
const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString() }

export async function monthSpendUsd(db: D1Database) {
  const r = await db.prepare("SELECT COALESCE(SUM(COALESCE(actual_cost_usd, reserved_usd, 0)),0) AS usd FROM provider_usage_ledger WHERE created_at>=? AND status='succeeded'").bind(monthStart()).first() as any
  return Number(r?.usd) || 0
}
export function monthlyBudgetUsd(env: Record<string, unknown>) {
  const b = Number(env.PROVIDER_MONTHLY_BUDGET_USD)
  return Number.isFinite(b) && b > 0 ? b : null
}
export async function assertBudget(db: D1Database, env: Record<string, unknown>, reserveUsd: number) {
  const budget = monthlyBudgetUsd(env)
  if (budget === null) throw new BudgetError(403, 'budget_not_configured', 'Anggaran bulanan provider (PROVIDER_MONTHLY_BUDGET_USD) belum ditetapkan pemilik. Eksekusi berbayar ditolak.')
  const spent = await monthSpendUsd(db)
  if (spent + reserveUsd > budget + 1e-9) throw new BudgetError(402, 'budget_exhausted', `Anggaran bulan ini tidak cukup (terpakai/dicadangkan USD ${spent.toFixed(2)} dari ${budget.toFixed(2)}).`)
  return { budget, spent }
}
export async function recordUsage(db: D1Database, r: { workspaceId?: string | null; userId: string; provider: string; operation: string; status: 'succeeded' | 'failed' | 'refused'; units?: Record<string, unknown>; reservedUsd?: number | null; actualCostUsd?: number | null; costBasis: string; externalRef?: string | null; errorCode?: string | null }) {
  await db.prepare('INSERT INTO provider_usage_ledger (id,workspace_id,user_id,provider,operation,status,units_json,reserved_usd,actual_cost_usd,cost_basis,external_ref,error_code,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(newId('pul'), r.workspaceId ?? null, r.userId, r.provider, r.operation, r.status, JSON.stringify(r.units || {}), r.reservedUsd ?? null, r.actualCostUsd ?? null, r.costBasis, r.externalRef ?? null, r.errorCode ?? null, nowIso()).run()
}
export async function usageSummary(db: D1Database, env: Record<string, unknown>, userId: string) {
  const { results } = await db.prepare(`SELECT provider,
      COUNT(*) AS calls, SUM(CASE WHEN status='succeeded' THEN 1 ELSE 0 END) AS succeeded,
      SUM(CASE WHEN status<>'succeeded' THEN 1 ELSE 0 END) AS failed_or_refused,
      COALESCE(SUM(CAST(json_extract(units_json,'$.total_tokens') AS INTEGER)),0) AS tokens,
      COALESCE(SUM(CAST(json_extract(units_json,'$.search_credits') AS INTEGER)),0) AS search_credits,
      COALESCE(SUM(CASE WHEN status='succeeded' THEN reserved_usd END),0) AS reserved_usd,
      SUM(actual_cost_usd) AS actual_cost_usd, MAX(created_at) AS last_at
    FROM provider_usage_ledger WHERE created_at>=? AND user_id=? GROUP BY provider`).bind(monthStart(), userId).all()
  const budget = monthlyBudgetUsd(env), spent = await monthSpendUsd(db)
  return { period_start: monthStart(), providers: results, monthly_budget_usd: budget, month_spend_usd: spent, remaining_usd: budget === null ? null : Math.max(0, budget - spent),
    cost_basis: 'Actor: batas biaya per-run dicadangkan sebelum eksekusi (bukan biaya aktual). Groq/Tavily: unit (token/kredit) tercatat; biaya moneter tidak dilaporkan provider sehingga dibiarkan kosong.' }
}
