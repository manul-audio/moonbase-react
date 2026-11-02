import type { Storefront, User, Vendor } from '@moonbase.sh/storefront-api'
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

export {
  SSR_AUTH_COOKIE_DEFAULT,
  SplitBrowserStore,
  type SplitBrowserStoreOptions,
  createServerCookieStore,
  parseCookieToken,
  type ServerCookieStoreOptions,
}
