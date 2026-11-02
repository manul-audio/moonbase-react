import type { Storefront } from '@moonbase.sh/storefront-api'
import { useStore } from 'zustand'
import type { StorefrontContext } from '../context'
import { useStorefrontContext } from '../provider'

export function useStorefront(context?: StorefrontContext): {
  context: StorefrontContext
  storefront: Storefront
  loaded: boolean
  closed: boolean
} {
  const ctx = useStorefrontContext(context)
  const storefront = useStore(ctx.store, (s) => s.storefront)
  const loaded = useStore(ctx.store, (s) => s.loadedStorefront)
  const closed = useStore(ctx.store, (s) => s.closed)
  return { context: ctx, storefront, loaded, closed }
}
