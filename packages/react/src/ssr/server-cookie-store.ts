import {
  InMemoryStore,
  TokenStore,
  accessTokenLifetime,
  type IStore,
} from '@moonbase.sh/storefront-api'
import { SSR_AUTH_COOKIE_DEFAULT } from './split-browser-store'

export function parseCookieToken(
  cookieHeader: string | null | undefined,
  cookieName: string = SSR_AUTH_COOKIE_DEFAULT,
): string | null {
  if (!cookieHeader) return null
  const pairs = cookieHeader.split(';')
  for (const rawPair of pairs) {
    const eqIdx = rawPair.indexOf('=')
    if (eqIdx === -1) continue
    const name = rawPair.slice(0, eqIdx).trim()
    if (name !== cookieName) continue
    const value = rawPair.slice(eqIdx + 1).trim()
    if (!value) return null
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }
  return null
}

function parseJwtExpMs(token: string): number | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const json =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf-8')
    const payload = JSON.parse(json) as { exp?: unknown }
    if (typeof payload.exp === 'number' && Number.isFinite(payload.exp)) {
      return payload.exp * 1000
    }
  } catch {
    // ignore malformed JWT
  }
  return null
}

export interface ServerCookieStoreOptions {
  cookieName?: string
}

/**
 * Creates a per-request, isolated `IStore` populated with the short-lived
 * `accessToken` from the request's `Cookie` header (or raw token string).
 */
export function createServerCookieStore(
  cookieHeaderOrToken: string | null | undefined,
  options?: ServerCookieStoreOptions,
): IStore {
  const store = new InMemoryStore()
  if (!cookieHeaderOrToken) return store

  const cookieName = options?.cookieName ?? SSR_AUTH_COOKIE_DEFAULT
  const token =
    cookieHeaderOrToken.includes('=') || cookieHeaderOrToken.includes(';')
      ? parseCookieToken(cookieHeaderOrToken, cookieName)
      : cookieHeaderOrToken.trim()

  if (!token) return store

  const expMs = parseJwtExpMs(token) ?? Date.now() + accessTokenLifetime(token)
  // If already expired, do not seed `moonbase_auth` on the server so the server
  // renders unauthenticated rather than attempting a refresh without a refresh token.
  if (expMs <= Date.now() + 5_000) {
    return store
  }

  store.set(TokenStore.storageKey, {
    accessToken: token,
    refreshToken: '',
    expiresAt: new Date(expMs).toISOString(),
  })

  return store
}
