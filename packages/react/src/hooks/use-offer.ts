import type { StorefrontOffer } from '@moonbase.sh/storefront-api'
import { useStore } from 'zustand'
import type { StorefrontContext } from '../context'
import { useStorefrontContext } from '../provider'

export function useOffer(
  offerId: string,
  context?: StorefrontContext,
): StorefrontOffer | null {
  const storefront = useStorefrontContext(context)
  return useStore(
    storefront.store,
    (s) => s.storefront.offers?.find((o) => o.id === offerId) ?? null,
  )
}

