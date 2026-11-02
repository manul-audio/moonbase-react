import type { StorefrontBundle } from '@moonbase.sh/storefront-api'
import { useStore } from 'zustand'
import type { StorefrontContext } from '../context'
import { useStorefrontContext } from '../provider'

export function useBundles(context?: StorefrontContext): StorefrontBundle[] {
  const storefront = useStorefrontContext(context)
  return useStore(storefront.store, (s) => s.storefront.bundles)
}

