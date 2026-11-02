import type { Storefront, User, Vendor } from '@moonbase.sh/storefront-api'
import {
  createStorefront,
  type MoonbaseReactConfiguration,
  type StorefrontContext,
} from '../context'
import {
  SSR_AUTH_COOKIE_DEFAULT,
  SplitBrowserStore,
  type SplitBrowserStoreOptions,
} from './split-browser-store'
import {
  createServerCookieStore,
  parseCookieToken,
  type ServerCookieStoreOptions,
} from './server-cookie-store'

export interface StorefrontHydrationState {
  storefront: Storefront | null
  loadedStorefront: boolean
  closed: boolean
  currentUser: User | null
  loadedUser: boolean
  vendor?: Vendor | null
}

const UNSAFE_CHARS_REGEX = /[<>&\u2028\u2029]/g
const UNSAFE_CHAR_MAP: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
}

/**
 * Serializes `StorefrontHydrationState` into an XSS-safe JSON string suitable
 * for embedding inside HTML `<script>` tags or custom SSR payloads.
 */
export function serializeStorefrontState(state: StorefrontHydrationState): string {
  return JSON.stringify(state).replace(
    UNSAFE_CHARS_REGEX,
    (ch) => UNSAFE_CHAR_MAP[ch] ?? ch,
  )
}

export interface CreateServerStorefrontOptions {
  /** Incoming HTTP `Cookie` request header or raw SSR access token */
  cookieHeader?: string | null
  /** Storefront configuration options */
  config?: MoonbaseReactConfiguration
  /** Whether to immediately fetch storefront catalog and user in parallel (default: true) */
  fetchOnInit?: boolean
}

/**
 * Creates a per-request server-side `StorefrontContext`, optionally seeding the
 * user's short-lived access token from `cookieHeader` and fetching the catalog
 * and current user in parallel for first-paint SSR hydration.
 */
export async function createServerStorefront(
  endpoint: string,
  options?: CreateServerStorefrontOptions,
): Promise<{
  storefront: StorefrontContext
  initialState: StorefrontHydrationState
}> {
  const cookieName =
    options?.config?.ssrAuthCookie === false
      ? undefined
      : (options?.config?.ssrAuthCookie ?? SSR_AUTH_COOKIE_DEFAULT)

  const store = createServerCookieStore(options?.cookieHeader, { cookieName })
  const sf = createStorefront(endpoint, {
    ...options?.config,
    store,
  })

  if (options?.fetchOnInit !== false) {
    const hasToken = store.get('moonbase_auth') !== null
    await Promise.all([
      sf.updateStorefront(),
      hasToken ? sf.updateUser() : Promise.resolve(null),
    ])
  }

  return {
    storefront: sf,
    initialState: sf.dehydrate(),
  }
}

export {
  SSR_AUTH_COOKIE_DEFAULT,
  SplitBrowserStore,
  type SplitBrowserStoreOptions,
  createServerCookieStore,
  parseCookieToken,
  type ServerCookieStoreOptions,
}
