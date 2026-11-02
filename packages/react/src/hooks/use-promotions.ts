import type { StorefrontPromotion } from '@moonbase.sh/storefront-api'
import { useStore } from 'zustand'
import type { StorefrontContext } from '../context'
import { useStorefrontContext } from '../provider'

const EMPTY_PROMOTIONS: StorefrontPromotion[] = []

export function usePromotions(context?: StorefrontContext): StorefrontPromotion[] {
  const storefront = useStorefrontContext(context)
  return useStore(storefront.store, (s) => s.storefront.promotions ?? EMPTY_PROMOTIONS)
}

