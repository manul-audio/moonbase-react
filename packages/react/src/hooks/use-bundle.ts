import type { StorefrontBundle } from '@moonbase.sh/storefront-api'
import { useStore } from 'zustand'
import type { StorefrontContext } from '../context'
import { useStorefrontContext } from '../provider'

export function useBundle(
  bundleId: string,
  context?: StorefrontContext,
): StorefrontBundle | null {
  const storefront = useStorefrontContext(context)
  return useStore(
    storefront.store,
    (s) => s.storefront.bundles.find((b) => b.id === bundleId) ?? null,
  )
}

