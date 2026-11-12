import test from 'node:test'
import assert from 'node:assert/strict'
import { isGoogleExternalAccount } from '../src/lib/clerkIdentity'

test('accepts Clerk Backend API Google provider identifier', () => {
  assert.equal(isGoogleExternalAccount('oauth_google'), true)
})

test('accepts normalized Google provider alias', () => {
  assert.equal(isGoogleExternalAccount('google'), true)
  assert.equal(isGoogleExternalAccount(' GOOGLE '), true)
})

test('rejects non-Google and malformed providers', () => {
  assert.equal(isGoogleExternalAccount('oauth_github'), false)
  assert.equal(isGoogleExternalAccount(''), false)
  assert.equal(isGoogleExternalAccount(null), false)
  assert.equal(isGoogleExternalAccount(undefined), false)
})
