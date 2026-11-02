import {
  LocalStorageStore,
  TokenStore,
  accessTokenLifetime,
  type IStore,
} from '@moonbase.sh/storefront-api'

export const SSR_AUTH_COOKIE_DEFAULT = 'moonbase_ssr_token'

export interface SplitBrowserStoreOptions {
  cookieName?: string | false
  onDegraded?: (err: unknown) => void
}

function writeSsrCookie(cookieName: string, accessToken: string): void {
  if (typeof document === 'undefined') return
  try {
    const lifetimeMs = accessTokenLifetime(accessToken)
    const maxAgeSec = Math.max(60, Math.floor(lifetimeMs / 1000))
    const secure =
      typeof window !== 'undefined' && window.location?.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${cookieName}=${encodeURIComponent(accessToken)}; Path=/; SameSite=Lax${secure}; Max-Age=${maxAgeSec}`
  } catch {
    // ignore cookie write errors in restricted contexts
  }
}

function clearSsrCookie(cookieName: string): void {
  if (typeof document === 'undefined') return
  try {
    const secure =
      typeof window !== 'undefined' && window.location?.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${cookieName}=; Path=/; SameSite=Lax${secure}; Max-Age=0`
  } catch {
    // ignore cookie removal errors
  }
}

/**
 * Browser `IStore` implementation that extends Moonbase's `LocalStorageStore`
 * (keeping full `moonbase_auth` including `refreshToken` in `localStorage` only)
 * while mirroring ONLY the short-lived `accessToken` into a compact cookie for
 * first-paint SSR authentication.
 */
export class SplitBrowserStore extends LocalStorageStore implements IStore {
  private readonly cookieName: string | false

  constructor(options?: SplitBrowserStoreOptions) {
    super(options?.onDegraded)
    this.cookieName = options?.cookieName ?? SSR_AUTH_COOKIE_DEFAULT
  }

  override set<TItem>(key: string, item: TItem): void {
    super.set(key, item)
    if (this.cookieName && key === TokenStore.storageKey && item && typeof item === 'object') {
      const candidate = item as { accessToken?: unknown }
      if (typeof candidate.accessToken === 'string' && candidate.accessToken.length > 0) {
        writeSsrCookie(this.cookieName, candidate.accessToken)
      }
    }
  }

  override remove(key: string): void {
    super.remove(key)
    if (this.cookieName && key === TokenStore.storageKey) {
      clearSsrCookie(this.cookieName)
    }
  }
}

