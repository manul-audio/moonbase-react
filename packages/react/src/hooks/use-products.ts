import type { StorefrontProduct } from '@moonbase.sh/storefront-api'
import { useStore } from 'zustand'
import type { StorefrontContext } from '../context'
import { useStorefrontContext } from '../provider'

export function useProducts(context?: StorefrontContext): StorefrontProduct[] {
  const storefront = useStorefrontContext(context)
  return useStore(storefront.store, (s) => s.storefront.products)
}

