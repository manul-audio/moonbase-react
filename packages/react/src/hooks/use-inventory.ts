import type {
  Activation,
  ActivationMethod,
  Download,
  Subscription,
  SubscriptionCancellationFeedback,
} from '@moonbase.sh/storefront-api'
import { useCallback } from 'react'
import type { StorefrontContext } from '../context'
import { useStorefrontContext } from '../provider'
import { resolveRedirect, type CheckoutRedirectMode } from '../utils/checkout-mode'
import { mountCheckout } from '../utils/iframe-checkout'
import { mountSubscription } from '../utils/iframe-subscription'
import { withPriceFormat } from '../utils/price-format'
import { currentPageUrl, withoutHandshakeParams } from '../utils/return-url'
import type { CheckoutResult } from './use-cart'

export function useInventory(context?: StorefrontContext) {
  const storefront = useStorefrontContext(context)

  const getLicenses = useCallback(
    async (nextUrl?: string) => storefront.client.inventory.licenses.get(nextUrl),
    [storefront],
  )

  const getLicenseActivations = useCallback(
    async (licenseId: string, nextUrl?: string) =>
      storefront.client.inventory.licenses.getActivations(licenseId, nextUrl),
    [storefront],
  )

  const getProduct = useCallback(
    async (productId: string, version?: string) =>
      storefront.client.inventory.products.get(productId, version),
    [storefront],
  )

  const getProductReleases = useCallback(
    async (productId: string, nextUrl?: string) =>
      storefront.client.inventory.products.getReleases(productId, nextUrl),
    [storefront],
  )

  const getProducts = useCallback(
    async (nextUrl?: string) => storefront.client.inventory.products.getOwned(nextUrl),
    [storefront],
  )

  const getProductLicenses = useCallback(
    async (productId: string, nextUrl?: string) =>
      storefront.client.inventory.products.getLicenses(productId, nextUrl),
    [storefront],
  )

  const getProductActivations = useCallback(
    async (productId: string, nextUrl?: string) =>
      storefront.client.inventory.products.getActivations(productId, nextUrl),
    [storefront],
  )

  const revokeActivation = useCallback(
    async (activation: Activation) =>
      storefront.client.inventory.licenses.revokeActivation(
        activation.licenseId,
        activation.id,
      ),
    [storefront],
  )

  const activateProduct = useCallback(
    async (deviceToken: string, activationMethod: ActivationMethod) =>
      storefront.client.inventory.activation.activate(deviceToken, activationMethod),
    [storefront],
  )

  const downloadProduct = useCallback(
    async (download: Download) => {
      if (!download.path) throw new Error('Product is not downloadable')
      const url = await storefront.client.inventory.products.getDownloadUrl(
        download.path,
      )
      if (typeof window !== 'undefined') {
        window.location.href = url
      }
    },
    [storefront],
  )

  const getSubscriptions = useCallback(
    async (nextUrl?: string) =>
      storefront.client.inventory.subscriptions.get(nextUrl),
    [storefront],
  )

  const getSubscription = useCallback(
    async (subscriptionId: string) =>
      storefront.client.inventory.subscriptions.getById(subscriptionId),
    [storefront],
  )

  const cancelSubscription = useCallback(
    async (
      subscriptionId: string,
      feedback?: SubscriptionCancellationFeedback,
    ) =>
      storefront.client.inventory.subscriptions.cancel(subscriptionId, feedback),
    [storefront],
  )

  const getSubscriptionPlanOptions = useCallback(
    async (subscriptionId: string) =>
      storefront.client.inventory.subscriptions.getPlanOptions(subscriptionId),
    [storefront],
  )

  const changeSubscriptionPlan = useCallback(
    async (subscriptionId: string, variationId: string) =>
      storefront.client.inventory.subscriptions.changePlan(
        subscriptionId,
        variationId,
      ),
    [storefront],
  )

  const cancelSubscriptionPlanChange = useCallback(
    async (subscriptionId: string) =>
      storefront.client.inventory.subscriptions.cancelPlanChange(subscriptionId),
    [storefront],
  )

  const renewSubscription = useCallback(
    async (
      subscriptionId: string,
      options: { redirect?: boolean | CheckoutRedirectMode; returnUrl?: string } = {},
    ): Promise<CheckoutResult> => {
      if (
        typeof window !== 'undefined' &&
        document.getElementById('moonbase-checkout-wrapper')
      ) {
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
      const { location: url } = await storefront.client.inventory.subscriptions.renew(
        subscriptionId,
        absoluteReturnUrl,
        !redirect,
      )
      if (redirect) {
        if (typeof window !== 'undefined') {
          window.location.href = withPriceFormat(url)
        }
        return { next: undefined, completed: false, redirected: true }
      } else {
        return new Promise((resolve) => {
          mountCheckout(url)
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
      }
    },
    [storefront],
  )

  const updateSubscriptionPaymentMethod = useCallback(
    async (
      subscription: Subscription,
      options: { returnUrl?: string } = {},
    ): Promise<{ completed: boolean } | undefined> => {
      const baseUri = typeof document !== 'undefined' ? document.baseURI : 'http://localhost/'
      const absoluteReturnUrl = withoutHandshakeParams(
        new URL(options.returnUrl ?? currentPageUrl(), baseUri).href,
      )
      const response = await storefront.client.inventory.subscriptions.getById(
        subscription.id,
        {
          toUpdatePaymentMethod: true,
          returnUrl: absoluteReturnUrl,
        },
      )
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(
            'moonbase-subscription-payment-method-update-initiated',
            {
              detail: { subscription },
            },
          ),
        )
      }
      if (response.embeddedUpdatePaymentUrl && typeof window !== 'undefined') {
        const embeddedUrl = response.embeddedUpdatePaymentUrl
        return new Promise((resolve) => {
          mountSubscription(embeddedUrl)
          window.addEventListener(
            'moonbase-subscription-closed',
            (e: Event) => {
              const evnt = e as CustomEvent<{ completed: boolean }>
              resolve({ completed: evnt.detail.completed })
            },
            { once: true },
          )
        })
      } else {
        throw new Error('No update URL found')
      }
    },
    [storefront],
  )

  return {
    getLicenses,
    getLicenseActivations,
    getProduct,
    getProductReleases,
    getProducts,
    getProductLicenses,
    getProductActivations,
    revokeActivation,
    activateProduct,
    downloadProduct,
    getSubscriptions,
    getSubscription,
    cancelSubscription,
    getSubscriptionPlanOptions,
    changeSubscriptionPlan,
    cancelSubscriptionPlanChange,
    renewSubscription,
    updateSubscriptionPaymentMethod,
  }
}

