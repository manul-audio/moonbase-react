import type { StorefrontProduct } from '@moonbase.sh/storefront-api'
import { useStore } from 'zustand'
import type { StorefrontContext } from '../context'
import { useStorefrontContext } from '../provider'

export function useProduct(
  productId: string,
  context?: StorefrontContext,
): StorefrontProduct | null {
  const storefront = useStorefrontContext(context)
  return useStore(
    storefront.store,
    (s) => s.storefront.products.find((p) => p.id === productId) ?? null,
  )
}
