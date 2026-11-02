import {
  CartUtils,
  MoonbaseError,
  OrderStatus,
  type LineItem,
  type PricingVariation,
  type StorefrontBundle,
  type StorefrontProduct,
} from '@moonbase.sh/storefront-api'
import { useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { StorefrontContext } from '../context'
import { useStorefrontContext } from '../provider'
import { recordCheckoutGroups } from '../utils/checkout-groups'
import { resolveRedirect, type CheckoutRedirectMode } from '../utils/checkout-mode'
import {
  forgetPurchase,
  hasCoupon,
  isClosedOrderRefusal,
  rememberPurchase,
  resumePurchase,
  watchForTakeover,
} from '../utils/direct-purchase'
import { buildHostedRedirectUrl } from '../utils/hosted-redirect'
import {
  closeCheckout,
  hideCheckoutLoader,
  mountCheckout,
  showCheckoutLoader,
} from '../utils/iframe-checkout'
import { currentPageUrl, withoutHandshakeParams } from '../utils/return-url'
import { lineItemId, targetLicenseId, upgradeVariation } from '../utils/target-license'
import type { CheckoutResult } from './use-cart'

export interface CheckoutItem {
  item: StorefrontProduct | StorefrontBundle
  variation?: PricingVariation
  quantity?: number
  targetLicenseId?: string
}

export interface DirectCheckoutOptions {
  redirect?: boolean | CheckoutRedirectMode
  returnUrl?: string
  couponCode?: string
  groupIds?: string[]
  onCouponRejected?: (code: string, error: unknown) => void
}

function lineQuantity(quantity?: number): number {
  const parsed = Math.trunc(Number(quantity))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export async function checkoutItems(
  items: CheckoutItem[],
  options: DirectCheckoutOptions = {},
  storefront: StorefrontContext,
): Promise<CheckoutResult> {
  if (!storefront) throw new Error('No storefront configured')

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
  const checkoutSession: LineItem[] = []

  for (const item of items) {
    const target = item.item
    const licenseId =
      target.type === 'Product' ? targetLicenseId(item.targetLicenseId) : undefined
    const variation =
      target.type === 'Product' && licenseId
        ? upgradeVariation(target, licenseId, item.variation)
        : (item.variation ?? target.defaultVariation ?? undefined)

    if (!variation) {
      throw new Error(
        'Added item does not have a default variation, and none have been specified',
      )
    }

    const quantity = licenseId ? 1 : lineQuantity(item.quantity)
    const id = lineItemId(target.type, target.id, variation.id, licenseId)
    if (
      licenseId &&
      checkoutSession.some(
        (l) => l.type === 'Product' && l.targetLicenseId === licenseId,
      )
    ) {
      continue
    }

    if (target.type === 'Bundle') {
      checkoutSession.push({
        id,
        type: 'Bundle',
        bundleId: target.id,
        bundle: target,
        quantity,
        variation,
        variationId: variation.id,
        price: variation.price,
        appliedDiscount: variation.discount,
      } as LineItem)
    } else if (target.type === 'Product') {
      checkoutSession.push({
        id,
        type: 'Product',
        productId: target.id,
        product: target,
        quantity,
        variation,
        variationId: variation.id,
        price: variation.price,
        appliedDiscount: variation.discount,
        ...(licenseId ? { targetLicenseId: licenseId } : {}),
      } as LineItem)
    } else {
      throw new MoonbaseError(
        'Invalid input',
        `Could not handle item of type '${(target as { type?: string }).type}'`,
      )
    }
  }

  const userId = storefront.currentUser?.id ?? null
  showCheckoutLoader()
  try {
    const baseUri = typeof document !== 'undefined' ? document.baseURI : 'http://localhost/'
    const absoluteReturnUrl = withoutHandshakeParams(
      new URL(options.returnUrl ?? currentPageUrl(), baseUri).href,
    )
    const pushOrder = (id: string) =>
      storefront.client.orders.pushContent(
        {
          id,
          currency: storefront.storefront.suggestedCurrency,
          items: checkoutSession,
        },
        {
          returnUrl: absoluteReturnUrl,
          embedded: !redirect,
        },
        storefront.hasUtmOrReferrer ? storefront.utm : undefined,
      )

    let resumed = await resumePurchase(storefront.client, userId, options.couponCode)
    let updatedOrder
    try {
      updatedOrder = await pushOrder(resumed?.orderId ?? uuidv4())
    } catch (err) {
      if (!resumed || !isClosedOrderRefusal(err)) throw err
      forgetPurchase(resumed.orderId)
      resumed = null
      updatedOrder = await pushOrder(uuidv4())
    }

    await recordCheckoutGroups(storefront.client, updatedOrder.id, options.groupIds)
    let ownCoupon = resumed?.couponCode ?? null

    if (options.couponCode && !hasCoupon(updatedOrder, options.couponCode)) {
      try {
        const orderWithCoupon = await storefront.client.orders.addCouponCode(
          updatedOrder.id,
          options.couponCode,
        )
        updatedOrder = {
          ...orderWithCoupon,
          checkoutUrl: orderWithCoupon.checkoutUrl ?? updatedOrder.checkoutUrl,
          hostedCheckoutUrl:
            orderWithCoupon.hostedCheckoutUrl ?? updatedOrder.hostedCheckoutUrl,
          embeddedCheckoutUrl:
            orderWithCoupon.embeddedCheckoutUrl ?? updatedOrder.embeddedCheckoutUrl,
        }
        ownCoupon = options.couponCode
      } catch (error) {
        options.onCouponRejected?.(options.couponCode, error)
      }
    }

    rememberPurchase(updatedOrder.id, userId, ownCoupon)
    if (
      typeof window !== 'undefined' &&
      !document.getElementById('moonbase-checkout-wrapper')
    ) {
      return { next: undefined, completed: false, redirected: false }
    }

    updatedOrder.items = storefront.enrichLineItems(updatedOrder.items, {
      ...updatedOrder,
      status: OrderStatus.Open,
    })
    const priced = CartUtils.total(
      storefront.storefront,
      updatedOrder,
      updatedOrder.currency,
    )

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('moonbase-checkout-initiated', {
          detail: {
            order: updatedOrder,
            total: { amount: priced.amount, currency: priced.currency },
          },
        }),
      )
    }

    const hostedUrl = redirect ? buildHostedRedirectUrl(updatedOrder, absoluteReturnUrl) : null
    if (hostedUrl && typeof window !== 'undefined') {
      window.location.href = hostedUrl
      return { next: undefined, completed: false, redirected: true }
    } else if (updatedOrder.embeddedCheckoutUrl && typeof window !== 'undefined') {
      const embeddedUrl = updatedOrder.embeddedCheckoutUrl
      return await new Promise((resolve) => {
        mountCheckout(embeddedUrl)
        const stopWatching = watchForTakeover(updatedOrder.id, closeCheckout)
        window.addEventListener(
          'moonbase-checkout-closed',
          (e: Event) => {
            stopWatching()
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
  } catch (e) {
    hideCheckoutLoader()
    throw e
  }
}

export function useCheckout(context?: StorefrontContext) {
  const storefront = useStorefrontContext(context)
  return useCallback(
    (items: CheckoutItem[], options?: DirectCheckoutOptions) =>
      checkoutItems(items, options, storefront),
    [storefront],
  )
}
