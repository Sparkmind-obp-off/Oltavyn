/**
 * Clerk Google identity rules (single source of truth).
 *
 * Verified against the live Clerk Production Backend API (GET /v1/users) on 2026-11-12:
 * Google external accounts are returned with `provider: "oauth_google"` and
 * `verification.strategy: "oauth_google"`. The legacy alias `google` is still accepted
 * because older Clerk API versions/SDK payloads used it; every other provider is rejected.
 */
export const GOOGLE_PROVIDER_IDS = ['oauth_google', 'google'] as const

export function isGoogleExternalAccount(provider: unknown): boolean {
  if (typeof provider !== 'string') return false
  const normalized = provider.trim().toLowerCase()
  return (GOOGLE_PROVIDER_IDS as readonly string[]).includes(normalized)
}

export type ClerkIdentityResult =
  | { ok: true; email: string; displayName: string | null }
  | { ok: false; code: 'google_sign_in_required' | 'verified_google_email_required' | 'account_disabled' }

/**
 * Validates a Clerk Backend API user object. Identity is taken ONLY from this server-fetched
 * record — never from anything the browser sends.
 */
export function evaluateClerkProfile(profile: any): ClerkIdentityResult {
  if (!profile || typeof profile !== 'object') return { ok: false, code: 'google_sign_in_required' }
  if (profile.banned === true || profile.locked === true) return { ok: false, code: 'account_disabled' }
  const google = (Array.isArray(profile.external_accounts) ? profile.external_accounts : []).find(
    (x: any) => isGoogleExternalAccount(x?.provider) && (x?.verification == null || x.verification.status === 'verified'),
  )
  if (!google) return { ok: false, code: 'google_sign_in_required' }
  const primary = (Array.isArray(profile.email_addresses) ? profile.email_addresses : []).find(
    (x: any) => x?.id && x.id === profile.primary_email_address_id,
  )
  if (!primary?.email_address || primary.verification?.status !== 'verified') return { ok: false, code: 'verified_google_email_required' }
  const email = String(primary.email_address).trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, code: 'verified_google_email_required' }
  const displayName = [profile.first_name, profile.last_name].filter((x: unknown) => typeof x === 'string' && x.trim()).join(' ').slice(0, 80) || null
  return { ok: true, email, displayName }
}
