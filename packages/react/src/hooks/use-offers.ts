import {
  CartUtils,
  OfferUtils,
  OrderStatus,
  type Money,
  type OfferProgress,
  type Order,
  type StorefrontOffer,
} from '@moonbase.sh/storefront-api'
import { useMemo } from 'react'
import { useStore } from 'zustand'
import type { StorefrontContext } from '../context'
import { useStorefrontContext } from '../provider'
import { resolveDisplayCurrency } from '../utils/currency'

const EMPTY_OFFERS: StorefrontOffer[] = []

export interface LockedOffer {
  offer: StorefrontOffer
  progress: OfferProgress
}

export interface CartOfferState {
  applied: {
    offer: StorefrontOffer
    saving: Money
  } | null
  next: {
    offer: StorefrontOffer
    progress: OfferProgress
  } | null
  subtotal: number
  currency: string
}

function offerIsInCart(offer: StorefrontOffer, order: Order): boolean {
  if (order.status !== OrderStatus.Open) return false
  return order.items.some((i) => i.offerId === offer.id)
}

function offerTargetIsInCart(offer: StorefrontOffer, order: Order): boolean {
  if (order.status !== OrderStatus.Open) return false
  return OfferUtils.allTargetsInCart(offer, order.items)
}

export function useOffers(context?: StorefrontContext): StorefrontOffer[] {
  const storefront = useStorefrontContext(context)
  return useStore(storefront.store, (s) => s.storefront.offers ?? EMPTY_OFFERS)
}

export function useEligibleOffers(context?: StorefrontContext): StorefrontOffer[] {
  const storefront = useStorefrontContext(context)
  const catalog = useStore(storefront.store, (s) => s.storefront)
  const order = useStore(storefront.store, (s) => s.currentOrder)

  return useMemo(() => {
    const conditionContext = storefront.offerConditionContext(order)
    return (catalog.offers ?? []).filter(
      (o) =>
        OfferUtils.eligible(o, conditionContext) &&
        !offerIsInCart(o, order) &&
        !offerTargetIsInCart(o, order),
    )
  }, [storefront, catalog, order])
}

export function useLockedOffers(context?: StorefrontContext): LockedOffer[] {
  const storefront = useStorefrontContext(context)
  const catalog = useStore(storefront.store, (s) => s.storefront)
  const order = useStore(storefront.store, (s) => s.currentOrder)

  return useMemo(() => {
    const conditionContext = storefront.offerConditionContext(order)
    return (catalog.offers ?? [])
      .filter(
        (o) =>
          o.scope !== 'Cart' &&
          !offerIsInCart(o, order) &&
          !offerTargetIsInCart(o, order),
      )
      .map((offer) => ({
        offer,
        progress: OfferUtils.progress(offer, conditionContext),
      }))
      .filter(
        (locked): locked is LockedOffer =>
          locked.progress !== null &&
          !locked.progress.eligible &&
          locked.progress.unit === 'Money' &&
          locked.progress.remaining > 0,
      )
      .sort((a, b) => b.progress.fraction - a.progress.fraction)
  }, [storefront, catalog, order])
}

export function useCartOffer(context?: StorefrontContext): CartOfferState | null {
  const storefront = useStorefrontContext(context)
  const catalog = useStore(storefront.store, (s) => s.storefront)
  const order = useStore(storefront.store, (s) => s.currentOrder)

  return useMemo(() => {
    const currency = resolveDisplayCurrency(order, catalog)
    const offers = catalog.offers ?? []
    if (offers.length === 0 || order.status !== OrderStatus.Open || order.items.length === 0) {
      return null
    }
    const conditionContext = storefront.offerConditionContext(order)
    const breakdown = CartUtils.total(catalog, order, currency)
    const applied = breakdown.cartOffer
      ? { offer: breakdown.cartOffer.offer, saving: breakdown.cartOffer.discount }
      : null
    const candidates = offers
      .map((offer) => ({
        offer,
        progress: OfferUtils.progress(offer, conditionContext),
      }))
      .filter(
        (candidate): candidate is { offer: StorefrontOffer; progress: OfferProgress } =>
          candidate.progress !== null &&
          !candidate.progress.eligible &&
          candidate.progress.remaining > 0 &&
          candidate.offer.scope === 'Cart',
      )
      .sort((a, b) => b.progress.fraction - a.progress.fraction)

    const appliedValue = applied
      ? CartUtils.cartOfferValue(catalog, order, applied.offer, currency, conditionContext)
      : 0
    const next =
      (applied
        ? candidates.find(
            (c) =>
              c.offer.scope === 'Cart' &&
              CartUtils.cartOfferValue(catalog, order, c.offer, currency, conditionContext) >
                appliedValue,
          )
        : candidates[0]) ?? null

    if (!applied && !next) return null
    return {
      applied,
      next,
      subtotal: breakdown.subtotal.amount,
      currency,
    }
  }, [storefront, catalog, order])
}
