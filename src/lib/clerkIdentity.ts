/** Clerk Backend API uses `oauth_google`; accept the short alias too for compatibility. */
export function isGoogleExternalAccount(provider: unknown): boolean {
  if (typeof provider !== 'string') return false
  const normalized = provider.trim().toLowerCase()
  return normalized === 'oauth_google' || normalized === 'google'
}
