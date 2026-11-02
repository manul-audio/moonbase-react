export * from '@moonbase.sh/storefront-api'

export {
  createStorefront,
  createEmptyOpenOrder,
  createEmptyStorefront,
  StorefrontContextImpl,
  type MoonbaseReactConfiguration,
  type StorefrontContext,
  type StorefrontState,
} from './context'

export {
  StorefrontProvider,
  storefrontKey,
  useStorefrontContext,
  type StorefrontProviderProps,
} from './provider'

export {
  createServerStorefront,
  createServerCookieStore,
  parseCookieToken,
  serializeStorefrontState,
  SplitBrowserStore,
  SSR_AUTH_COOKIE_DEFAULT,
  type CreateServerStorefrontOptions,
  type ServerCookieStoreOptions,
  type SplitBrowserStoreOptions,
  type StorefrontHydrationState,
} from './ssr'

export {
  useActivationRequest,
  type ActivationRequestComposable,
} from './hooks/use-activation-request'
export { useAuth } from './hooks/use-auth'
export { useBundle } from './hooks/use-bundle'
export { useBundles } from './hooks/use-bundles'
export {
  useCart,
  type AddToCartOptions,
  type Cart,
  type CartCheckoutOptions,
  type CartItem,
  type CheckoutResult,
} from './hooks/use-cart'
export {
  checkoutItems,
  useCheckout,
  type CheckoutItem,
  type DirectCheckoutOptions,
} from './hooks/use-checkout'
export { useCommunicationPreferences } from './hooks/use-communication-preferences'
export { useGroups } from './hooks/use-groups'
export { useInventory } from './hooks/use-inventory'
export { useOffer } from './hooks/use-offer'
export {
  useCartOffer,
  useEligibleOffers,
  useLockedOffers,
  useOffers,
  type CartOfferState,
  type LockedOffer,
} from './hooks/use-offers'
export { useProduct } from './hooks/use-product'
export { useProducts } from './hooks/use-products'
export { usePromotions } from './hooks/use-promotions'
export { useStorefront } from './hooks/use-storefront'
export { useVendor, type VendorComposable } from './hooks/use-vendor'
export { useVoucher } from './hooks/use-voucher'

export {
  backdropInk,
  loaderCheckoutBackdrop,
  resolveCheckoutBackdrop,
  setCheckoutBackdrop,
  withCheckoutBackdrop,
  type CheckoutBackdrop,
  type CheckoutBackdropColor,
  type CheckoutBackdropOpacity,
  type DrawnCheckoutBackdrop,
  type ResolvedCheckoutBackdrop,
} from './utils/checkout-backdrop'

export {
  CHECKOUT_MODE_OVERRIDE_PARAM,
  isMobileDevice,
  resolveCheckoutRedirect,
  resolveRedirect,
  type CheckoutRedirectDecision,
  type CheckoutRedirectMode,
  type CheckoutRedirectReason,
} from './utils/checkout-mode'

export {
  buildHostedRedirectUrl,
  type RedirectableOrder,
} from './utils/hosted-redirect'

export {
  checkoutWindowEvents,
  closeCheckout,
  hideCheckoutLoader,
  isTrustedCheckoutOrigin,
  mountCheckout,
  parseCheckoutMessage,
  showCheckoutLoader,
  type CheckoutBackdropEvent,
  type CheckoutBillingDetailsUpdatedEvent,
  type CheckoutClosedEvent,
  type CheckoutCompletedEvent,
  type CheckoutCouponAppliedEvent,
  type CheckoutCouponRejectedEvent,
  type CheckoutCouponRemovedEvent,
  type CheckoutEvent,
  type CheckoutPaymentFailedEvent,
  type CheckoutPaymentFailure,
  type CheckoutPaymentFailureReason,
  type CheckoutPaymentStartedEvent,
  type CheckoutReadyEvent,
} from './utils/iframe-checkout'

export { onPageRestore } from './utils/page-restore'

export {
  setCheckoutPriceFormat,
  withPriceFormat,
  type CurrencyDisplay,
  type PriceFormat,
  type TrailingZeros,
} from './utils/price-format'

export { currentPageUrl, withoutHandshakeParams } from './utils/return-url'

export {
  computeScale,
  setViewportCompensationDisabled,
} from './utils/viewport-scale'
