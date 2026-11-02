import {
  CartUtils,
  MoonbaseError,
  OfferUtils,
  OrderStatus,
  type CartTotal,
  type LineItem,
  type Money,
  type OpenOrder,
  type PricingVariation,
  type StorefrontBundle,
  type StorefrontOffer,
  type StorefrontProduct,
} from '@moonbase.sh/storefront-api'
import { useCallback, useMemo } from 'react'
import { useStore } from 'zustand'
import type { StorefrontContext } from '../context'
import { useStorefrontContext } from '../provider'
import { recordCheckoutGroups } from '../utils/checkout-groups'
import { resolveRedirect, type CheckoutRedirectMode } from '../utils/checkout-mode'
import { resolveDisplayCurrency } from '../utils/currency'
import { buildHostedRedirectUrl } from '../utils/hosted-redirect'
import { mountCheckout } from '../utils/iframe-checkout'
import { currentPageUrl, withoutHandshakeParams } from '../utils/return-url'
import { lineItemId, targetLicenseId, upgradeVariation } from '../utils/target-license'

export type CartItem = LineItem
export interface Cart {
  items: CartItem[]
}

export interface AddToCartOptions {
  bundleBehaviour?: 'replace' | 'keep'
  targetLicenseId?: string
}

export interface CartCheckoutOptions {
  redirect?: boolean | CheckoutRedirectMode
  returnUrl?: string
  groupIds?: string[]
}

export interface CheckoutResult {
  next: string | undefined
  completed: boolean
  redirected: boolean
}

export function useCart(context?: StorefrontContext) {
  const storefront = useStorefrontContext(context)
  const catalog = useStore(storefront.store, (s) => s.storefront)
  const currentOrder = useStore(storefront.store, (s) => s.currentOrder)

  const currency = useMemo(
    () => resolveDisplayCurrency(currentOrder, catalog),
    [currentOrder, catalog],
  )

  const breakdown: CartTotal = useMemo(
    () => CartUtils.total(catalog, currentOrder, currency),
    [catalog, currentOrder, currency],
  )

  const total: Money = useMemo(
    () => ({ amount: breakdown.amount, currency: breakdown.currency }),
    [breakdown.amount, breakdown.currency],
  )

  const items = useMemo(() => {
    const rawItems = currentOrder.status === OrderStatus.Open ? currentOrder.items : []
    return storefront.enrichLineItems(rawItems, currentOrder)
  }, [storefront, currentOrder, catalog])

  const productLineRecurrence = useCallback(
    (lineItem: LineItem) => {
      if (lineItem.type !== 'Product') return undefined
      const itemWithVar = lineItem as LineItem & { variation?: PricingVariation }
      return (
        itemWithVar.variation?.recurrence ??
        storefront.storefront.products
          .find((p) => p.id === lineItem.productId)
          ?.variations?.find((v) => v.id === lineItem.variationId)?.recurrence
      )
    },
    [storefront],
  )

  const pushUpdatedOrder = useCallback(
    (draftItems: LineItem[]) => {
      const order = storefront.currentOrder
      if (order.status !== OrderStatus.Open) return
      let nextOrder: OpenOrder = {
        ...order,
        items: draftItems.map((i) => ({ ...i })),
      }

      // Prune ineligible offers
      const conditionContext = storefront.offerConditionContext(nextOrder)
      for (const item of nextOrder.items) {
        if (item.offerId) {
          const offer = storefront.storefront.offers?.find((o) => o.id === item.offerId)
          if (!offer || !OfferUtils.eligible(offer, conditionContext)) {
            item.offerId = undefined
          }
        }
      }

      // Auto-apply eligible item offers when enabled
      if (storefront.autoApplyItemOffers === true) {
        const displayCurrency = resolveDisplayCurrency(nextOrder, storefront.storefront)
        const updatedConditionContext = storefront.offerConditionContext(nextOrder)
        for (const { itemId, offerId } of CartUtils.assignItemOffers(
          storefront.storefront,
          nextOrder,
          displayCurrency,
          updatedConditionContext,
        )) {
          const item = nextOrder.items.find((i) => i.id === itemId)
          if (item) item.offerId = offerId
        }
      }

      storefront.currentOrder = nextOrder
      storefront.reconcileCartOffer()
      void storefront.pushOrderContent()
    },
    [storefront],
  )

  const addReplacedBundleProducts = useCallback(
    (cartItem: LineItem, draftItems: LineItem[], insertAt?: number) => {
      if (
        cartItem.type === 'Bundle' &&
        cartItem.replaced &&
        cartItem.replaced.length > 0
      ) {
        let cursor = insertAt
        for (const composite of cartItem.replaced) {
          const [productId, variationId] = composite.split('/')
          const product = storefront.storefront.products.find((p) => p.id === productId)
          const variation = product?.variations?.find((v) => v.id === variationId)
          const alreadyInCart = draftItems.some(
            (i) =>
              i.type === 'Product' &&
              i.productId === productId &&
              !i.targetLicenseId &&
              productLineRecurrence(i)?.type === variation?.recurrence.type,
          )
          if (product && variation && !alreadyInCart) {
            const id = lineItemId('Product', product.id, variationId)
            const newItem: LineItem = {
              id,
              type: 'Product',
              productId: product.id,
              product,
              quantity: 1,
              variation,
              variationId,
              price: variation.price,
              appliedDiscount: variation.discount,
              isDefaultVariation: variation.id === product.defaultVariation?.id,
            } as LineItem
            if (cursor !== undefined) {
              draftItems.splice(cursor, 0, newItem)
              cursor++
            } else {
              draftItems.push(newItem)
            }
          }
        }
      }
    },
    [storefront, productLineRecurrence],
  )

  const addToCart = useCallback(
    (
      item: StorefrontProduct | StorefrontBundle,
      variation?: PricingVariation,
      offer?: StorefrontOffer,
      options?: AddToCartOptions,
    ): CartItem => {
      const order = storefront.currentOrder
      const draftItems: LineItem[] =
        order.status === OrderStatus.Open ? order.items.map((i) => ({ ...i })) : []

      const licenseId =
        item.type === 'Product' ? targetLicenseId(options?.targetLicenseId) : undefined
      const resolvedVariation =
        item.type === 'Product' && licenseId
          ? upgradeVariation(item, licenseId, variation)
          : (variation ?? item.defaultVariation ?? undefined)

      if (!resolvedVariation) {
        throw new Error(
          'Added item does not have a default variation, and none have been specified',
        )
      }

      const id = lineItemId(item.type, item.id, resolvedVariation.id, licenseId)
      if (licenseId) {
        const index = draftItems.findIndex(
          (i) =>
            i.type === 'Product' &&
            i.id !== id &&
            i.targetLicenseId?.toLowerCase() === licenseId,
        )
        if (index >= 0) draftItems.splice(index, 1)
      }

      let lineItem = draftItems.find((i) => i.id === id)
      if (!lineItem) {
        if (item.type === 'Bundle') {
          let replaced: string[] | undefined
          if (options?.bundleBehaviour === 'replace') {
            const recurrenceType = resolvedVariation.recurrence.type
            const lineItemsToReplace = draftItems.filter(
              (i) =>
                i.type === 'Product' &&
                !i.targetLicenseId &&
                item.products.some((p) => p.included && p.id === i.productId) &&
                productLineRecurrence(i)?.type === recurrenceType,
            )
            for (const productLineItem of lineItemsToReplace) {
              const index = draftItems.findIndex((i) => i.id === productLineItem.id)
              if (index >= 0) draftItems.splice(index, 1)
            }
            replaced = lineItemsToReplace
              .filter((i): i is Extract<LineItem, { type: 'Product' }> => i.type === 'Product')
              .map((i) => `${i.productId}/${i.variationId}`)
          }
          lineItem = {
            id,
            type: 'Bundle',
            bundleId: item.id,
            bundle: item,
            quantity: 1,
            variation: resolvedVariation,
            variationId: resolvedVariation.id,
            offerId: offer?.id,
            price: resolvedVariation.price,
            appliedDiscount: resolvedVariation.discount,
            isDefaultVariation: resolvedVariation.id === item.defaultVariation?.id,
            ...(replaced ? { replaced } : {}),
          } as LineItem
          draftItems.push(lineItem)
        } else if (item.type === 'Product') {
          lineItem = {
            id,
            type: 'Product',
            productId: item.id,
            product: item,
            quantity: 1,
            variation: resolvedVariation,
            variationId: resolvedVariation.id,
            offerId: offer?.id,
            price: resolvedVariation.price,
            appliedDiscount: resolvedVariation.discount,
            isDefaultVariation: resolvedVariation.id === item.defaultVariation?.id,
            ...(licenseId ? { targetLicenseId: licenseId } : {}),
          } as LineItem
          draftItems.push(lineItem)
        } else {
          throw new MoonbaseError(
            'Invalid input',
            `Could not handle item of type '${(item as { type?: string }).type}'`,
          )
        }
      } else {
        if (lineItem.type === 'Product' && lineItem.targetLicenseId) {
          lineItem.quantity = 1
        } else {
          lineItem.quantity += 1
        }
        lineItem.offerId ??= offer?.id
        const mutableLine = lineItem as LineItem & {
          variation?: PricingVariation
          product?: StorefrontProduct
          bundle?: StorefrontBundle
        }
        if (!mutableLine.variation && resolvedVariation) {
          mutableLine.variation = resolvedVariation
        }
        if (!mutableLine.price && resolvedVariation) {
          mutableLine.price = resolvedVariation.price
        }
        if (!mutableLine.appliedDiscount && resolvedVariation.discount) {
          mutableLine.appliedDiscount = resolvedVariation.discount
        }
        if (lineItem.type === 'Product' && item.type === 'Product' && !mutableLine.product) {
          mutableLine.product = item
        }
        if (lineItem.type === 'Bundle' && item.type === 'Bundle' && !mutableLine.bundle) {
          mutableLine.bundle = item
        }
      }

      pushUpdatedOrder(draftItems)
      return lineItem
    },
    [storefront, productLineRecurrence, pushUpdatedOrder],
  )

  const setQuantity = useCallback(
    (cartItem: CartItem, quantity: number): CartItem => {
      const order = storefront.currentOrder
      const draftItems =
        order.status === OrderStatus.Open ? order.items.map((i) => ({ ...i })) : []
      const cartItemRef = draftItems.find((i) => i.id === cartItem.id)
      if (!cartItemRef) throw new Error('Cart item not found')

      cartItemRef.quantity =
        cartItemRef.type === 'Product' && cartItemRef.targetLicenseId
          ? Math.min(quantity, 1)
          : quantity

      if (cartItemRef.quantity <= 0) {
        const index = draftItems.findIndex((i) => i.id === cartItemRef.id)
        draftItems.splice(index, 1)
        addReplacedBundleProducts(cartItem, draftItems, index)
      }

      pushUpdatedOrder(draftItems)
      return cartItemRef
    },
    [storefront, addReplacedBundleProducts, pushUpdatedOrder],
  )

  const removeFromCart = useCallback(
    (cartItem: CartItem): void => {
      const order = storefront.currentOrder
      const draftItems =
        order.status === OrderStatus.Open ? order.items.map((i) => ({ ...i })) : []
      const index = draftItems.findIndex((i) => i.id === cartItem.id)
      if (index >= 0) {
        draftItems.splice(index, 1)
        addReplacedBundleProducts(cartItem, draftItems, index)
      }
      pushUpdatedOrder(draftItems)
    },
    [storefront, addReplacedBundleProducts, pushUpdatedOrder],
  )

  const checkout = useCallback(
    async (options: CartCheckoutOptions = {}): Promise<CheckoutResult | undefined> => {
      if (typeof window !== 'undefined' && document.getElementById('moonbase-checkout-wrapper')) {
        return new Promise((resolve) =>
          window.addEventListener(
            'moonbase-checkout-closed',
            (e: Event) => {
              const evnt = e as CustomEvent<{ intent?: string; completed: boolean }>
              resolve({
                next: evnt.detail.intent,
                completed: evnt.detail.completed,
                redirected: false,
              })
            },
            { once: true },
          ),
        )
      }

      const redirect = resolveRedirect(options.redirect)
      const baseUri = typeof document !== 'undefined' ? document.baseURI : 'http://localhost/'
      const absoluteReturnUrl = withoutHandshakeParams(
        new URL(options.returnUrl ?? currentPageUrl(), baseUri).href,
      )
      storefront.reconcileCartOffer()
      const current = storefront.currentOrder
      if (current.status !== OrderStatus.Open) return undefined

      const updatedOrder = await storefront.client.orders.pushContent(
        current,
        {
          returnUrl: absoluteReturnUrl,
          embedded: !redirect,
        },
        storefront.hasUtmOrReferrer ? storefront.utm : undefined,
      )
      await recordCheckoutGroups(storefront.client, updatedOrder.id, options.groupIds)
      updatedOrder.items = storefront.enrichLineItems(updatedOrder.items, updatedOrder)

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('moonbase-checkout-initiated', {
            detail: { order: updatedOrder, total },
          }),
        )
      }

      const hostedUrl = redirect ? buildHostedRedirectUrl(updatedOrder, absoluteReturnUrl) : null
      if (hostedUrl && typeof window !== 'undefined') {
        window.location.href = hostedUrl
        return { next: undefined, completed: false, redirected: true }
      } else if (updatedOrder.embeddedCheckoutUrl && typeof window !== 'undefined') {
        const embeddedUrl = updatedOrder.embeddedCheckoutUrl
        return new Promise((resolve) => {
          mountCheckout(embeddedUrl)
          window.addEventListener(
            'moonbase-checkout-closed',
            (e: Event) => {
              const evnt = e as CustomEvent<{ intent?: string; completed: boolean }>
              resolve({
                next: evnt.detail.intent,
                completed: evnt.detail.completed,
                redirected: false,
              })
            },
            { once: true },
          )
        })
      } else {
        throw new Error('No checkout URL found')
      }
    },
    [storefront, total],
  )

  return {
    items,
    currency,
    total,
    breakdown,
    cartOffer: breakdown.cartOffer,
    addToCart,
    setQuantity,
    removeFromCart,
    checkout,
  }
}
