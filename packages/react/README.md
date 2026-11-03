# React.js SDK

This guide covers how to set up the Moonbase React.js SDK to integrate pricing, payments, authentication, and licensing into your storefront.

The SDK provides headless React hooks for products, pricing, cart, checkout, authentication, customer inventory, and license activation. It is written in TypeScript and ships zero markup or CSS, so you keep full control over your components and styling.

Make sure to add your local development or test environment URLs to the whitelisted URLs of your Moonbase account, or browser requests will fail with CORS errors.

## Table of contents

- [Getting started](#getting-started)
- [Next.js and SSR support](#nextjs-and-ssr-support)
- [Cookie consent](#cookie-consent)
- [Hooks](#hooks)
  - [useStorefront](#usestorefront)
  - [useAuth](#useauth)
  - [useInventory](#useinventory)
  - [useActivationRequest](#useactivationrequest)
  - [useBundle](#usebundle)
  - [useBundles](#usebundles)
  - [useProduct](#useproduct)
  - [useProducts](#useproducts)
  - [useOffer](#useoffer)
  - [useOffers](#useoffers)
  - [useCartOffer](#usecartoffer)
  - [usePromotions](#usepromotions)
  - [useCart](#usecart)
  - [useCheckout](#usecheckout)
  - [useCommunicationPreferences](#usecommunicationpreferences)
  - [useVoucher](#usevoucher)
  - [useGroups](#usegroups)
  - [useVendor](#usevendor)
- [Checkout lifecycle events](#checkout-lifecycle-events)
- [Custom storefront mode](#custom-storefront-mode)

## Getting started

Install the package:

```bash
npm install @moonbase.sh/react --save
```

Peer dependencies:

- `react` (`^18.0.0 || ^19.0.0`)
- `react-dom` (`^18.0.0 || ^19.0.0`)

Store your Moonbase account URL (`https://{YOUR-ACCOUNT-ID}.moonbase.sh`) in an environment variable in your `.env` file (for example `VITE_MOONBASE_ENDPOINT` in Vite or `NEXT_PUBLIC_MOONBASE_ENDPOINT` in Next.js) rather than hardcoding it in source files:

```ini
# .env
NEXT_PUBLIC_MOONBASE_ENDPOINT=https://{YOUR-ACCOUNT-ID}.moonbase.sh
```

Wrap your application in `StorefrontProvider` with your Moonbase endpoint:

### `main.tsx`

```tsx
import { StorefrontProvider } from '@moonbase.sh/react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StorefrontProvider endpoint="https://{YOUR-ACCOUNT-ID}.moonbase.sh">
    <App />
  </StorefrontProvider>,
)
```

You can also create the storefront context explicitly with `createStorefront` when you need direct access to storefront methods or event listeners outside of React components:

```tsx
import { createStorefront, StorefrontProvider } from '@moonbase.sh/react'

const storefront = createStorefront('https://{YOUR-ACCOUNT-ID}.moonbase.sh', {
  persistUtm: true,
})

export function Root() {
  return (
    <StorefrontProvider storefront={storefront}>
      <App />
    </StorefrontProvider>
  )
}
```

## Next.js and SSR support

The SDK supports server-side rendering and React Server Components. Each server request creates an isolated store instance so state never leaks between concurrent requests. Pass the dehydrated `initialState` to `StorefrontProvider` so the first paint has catalog prices, promotions, and signed-in user state without refetching on mount.

### `app/layout.tsx` (Server Component)

```tsx
import { createServerStorefront } from '@moonbase.sh/react/ssr'
import { cookies } from 'next/headers'
import { Providers } from './providers'

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()

  // Hydrate the catalog (and current user, if a session cookie is present)
  // into the SSR payload so the first paint already has real data.
  const { initialState } = await createServerStorefront(
    'https://{YOUR-ACCOUNT-ID}.moonbase.sh',
    {
      cookies: cookieStore.toString(),
    },
  )

  return (
    <html lang="en">
      <body>
        <Providers initialState={initialState}>{children}</Providers>
      </body>
    </html>
  )
}
```

### `app/providers.tsx` (Client Component)

```tsx
'use client'

import {
  StorefrontProvider,
  type StorefrontHydrationState,
} from '@moonbase.sh/react'
import { useRouter } from 'next/navigation'

export function Providers({
  initialState,
  children,
}: {
  initialState: StorefrontHydrationState
  children: React.ReactNode
}) {
  const router = useRouter()

  return (
    <StorefrontProvider
      endpoint="https://{YOUR-ACCOUNT-ID}.moonbase.sh"
      config={{ persistUtm: true }}
      initialState={initialState}
      onCheckoutCompleted={(order) => {
        router.push(`/order-completed?id=${order.id}`)
      }}
    >
      {children}
    </StorefrontProvider>
  )
}
```

In the browser, the SDK uses a split token store by default. The full session, including the long-lived `refreshToken`, stays in `localStorage`, while only the short-lived `accessToken` is written to a `SameSite=Lax; Path=/; Secure` cookie (`moonbase_ssr_token`). `createServerStorefront` reads that cookie to authenticate SSR requests and resolve audience-restricted promotions on first paint without putting refresh tokens in cookies. Pass `ssrAuthCookie: false` in `config` if you prefer `localStorage`-only auth.

The `{ persistUtm: true }` option keeps the UTM parameters a visitor arrived with in `localStorage` instead of the default `sessionStorage`, so attribution survives across tabs and follows the visitor through to a future checkout when you use [marketing revenue tracking](https://moonbase.sh/docs/guides/marketing-revenue-tracking/). It only does so once the visitor has agreed to marketing cookies, as described in [Cookie consent](#cookie-consent) below.

`onCheckoutCompleted` only fires in the browser. Use it to redirect to an order-confirmation page or run post-purchase cleanup after the embedded checkout overlay finishes (see [`useCart`](#usecart) below).

## Cookie consent

When a visitor adds to their cart, checks out, or signs up, the SDK sends the UTM tags, referring site, and ad click IDs (`gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `ttclid`) they arrived with. As in the [embedded storefront](https://moonbase.sh/docs/storefronts/embedded/#campaign-tracking-and-cookie-consent), it only keeps the click IDs once the visitor has agreed to marketing cookies, and until you report a choice it follows your store's Ad and campaign tracking setting in Moonbase (Account settings > Storefront > Features > Ad and campaign tracking).

Report the visitor's choice from your cookie banner with `setAttributionConsent()`, or pass `attributionConsent` to `createStorefront` / `StorefrontProvider` when it is already known on page load:

```tsx
const storefront = createStorefront('https://{YOUR-ACCOUNT-ID}.moonbase.sh')

onMarketingConsent((granted) => storefront.setAttributionConsent(granted))
```

## Hooks

All hooks read from the nearest `StorefrontProvider` by default, or accept an explicit `StorefrontContext` as their last argument. Each hook subscribes via a scoped store selector so components only re-render when the values they read change.

### `useStorefront`

Returns the active `StorefrontContext` along with reactive `storefront`, `loaded`, and `closed` state.

```tsx
import { useStorefront } from '@moonbase.sh/react'

const {
  storefront,
  loaded,
  closed,
  updateStorefront,
  setAttributionConsent,
  onCheckoutCompleted,
  closeCheckout,
} = useStorefront()
```

### `useAuth`

Provides functions for user authentication alongside the currently signed-in `user` and whether the user state has finished loading.

```tsx
import { useAuth } from '@moonbase.sh/react'

const {
  user,
  loaded,
  signIn,
  signUp,
  signOut,            // Requires authenticated user
  update,             // Requires authenticated user
  setPassword,        // Requires authenticated user
  forgotPassword,
  resetPassword,
  confirmAccount,     // Returns password reset token to set initial password
  confirmEmail,
  confirmEmailChange, // Requires authenticated user
  getAccessToken,     // Resolves to null when nobody is signed in
  getConnectionUrl,   // Requires authenticated user
  disconnectAccount,  // Requires authenticated user
  refreshUser,
} = useAuth()
```

If you turn on Captcha under Account settings > Storefront > Features, pass the customer's solution to `signUp` as `{ captchaToken }` in its last argument, or it throws a `CaptchaRequiredError`. See [Sign up in the Storefront API](https://moonbase.sh/docs/storefronts/api/#sign-up) for how to render the captcha.

The SDK loads the user on page load if a valid token is found in storage and refreshes expired access tokens automatically.

To call your own API for the signed-in customer, pass the token from `getAccessToken()`, which renews the token first when it is close to expiring, and verify it on your server as described in [Verify access tokens](https://moonbase.sh/docs/storefronts/api/#verify-access-tokens).

### `useInventory`

Exposes methods to fetch the products, licenses, and subscriptions owned by the authenticated customer, as well as license activation and revocation.

All methods on this hook require an authenticated user, and list `get` methods return paginated responses.

For offline activations, pass a device token to `activateProduct` to receive a license token usable for offline activation. See [activation flows](https://moonbase.sh/docs/licensing/activation-flows/) for details.

```tsx
import { useInventory } from '@moonbase.sh/react'

const {
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
  getSubscription,
  getSubscriptions,
  cancelSubscription,
  getSubscriptionPlanOptions,
  changeSubscriptionPlan,
  cancelSubscriptionPlanChange,
  renewSubscription,
  updateSubscriptionPaymentMethod,
} = useInventory()
```

When setting up products in Moonbase, you can control who can download releases: anyone, authenticated users, customers who own the product, members of a customer group, or nobody. That setting is configured separately for past releases, the current release, and pre-releases. Whenever a release requires authentication, use `downloadProduct` to fetch and open signed download links. If a release is public, you can link directly to the release `path`.

Every owned product includes `downloadsAllowed`, which is the API's verdict on whether the current customer satisfies all requirements for the returned release. Gate your download button on `downloadsAllowed`. When it is `false`, inspect `downloadsNeedsUser`, `downloadsNeedsOwnership`, and `downloadsNeedsGroupMembership` to see which requirement failed. When all three are `false`, downloads are closed for that release.

For products sold with [licenses that cover only some releases](https://moonbase.sh/docs/concepts/#release-access), owned products and licenses include `releaseAccess` with an `upgradeUrl` to purchase the upgrade. `downloadProduct` throws `ReleaseNotCoveredError` (a `NotAuthorizedError` subclass carrying `upgradeUrl`) when the customer's license does not cover the requested release.

`getProduct` returns the full owned-product record for a single product, including downloads, external licenses (key codes, file licenses, iLok deposits), and metadata. `getSubscription` returns the detail for a single subscription and backs the `ManageSubscription` callback URL (see [Custom storefront mode](#custom-storefront-mode)).

### `useActivationRequest`

Wraps an in-progress online activation request identified by a token. Moonbase passes this token to the `AutoActivation` custom-storefront URL when a customer starts an online activation from inside your software to claim a paid license or start a free trial.

```tsx
import { useActivationRequest } from '@moonbase.sh/react'

const {
  activationRequest, // Loaded ActivationRequest | null
  loading,           // Initial token lookup in progress
  fulfilling,        // Fulfillment request in progress
  completing,        // Post-fulfill polling for license delivery
  error,             // User-facing error message, if any
  isInstalled,       // True once the license is provisioned
  fulfillLicense,    // Complete by purchasing or claiming the license
  fulfillTrial,      // Complete by starting a free trial
  cancel,            // Abandon the request server-side
} = useActivationRequest(token)
```

On your `/activate` page, read `?token=...` from the URL, pass it to `useActivationRequest`, render the product and pricing from `activationRequest`, and wire buttons to `fulfillLicense()` and `fulfillTrial(newsletterOptIn)`. Calling `fulfillLicense()` opens the embedded checkout overlay for payment when needed; calling `fulfillTrial()` provisions the trial directly. In both cases `isInstalled` turns `true` once the license is delivered.

Trial eligibility is exposed on `activationRequest.trialEligibility`. When `trialEligibility.requiresNewsletterOptIn` is `true`, render a required opt-in checkbox and call `fulfillTrial(true)` once checked. When `requiresNewsletterOptIn` is `false`, call `fulfillTrial()` directly.

See [activation flows](https://moonbase.sh/docs/licensing/activation-flows/) for more on online and offline activation.

### `useBundle`

Returns a specific bundle by ID, or `null` if the bundle is not found or the storefront catalog has not loaded yet.

```tsx
import { useBundle } from '@moonbase.sh/react'

const bundle = useBundle('demo-bundle')
```

### `useBundles`

Returns all loaded bundles (or an empty array before the catalog loads).

```tsx
import { useBundles } from '@moonbase.sh/react'

const bundles = useBundles()
```

### `useProduct`

Returns a specific product by ID, or `null` if the product is not found or the storefront catalog has not loaded yet.

```tsx
import { useProduct } from '@moonbase.sh/react'

const product = useProduct('demo-product')
```

### `useProducts`

Returns all loaded products (or an empty array before the catalog loads).

```tsx
import { useProducts } from '@moonbase.sh/react'

const products = useProducts()
```

### `useOffer`

Returns a specific offer by ID, or `null` if not found or not yet loaded.

```tsx
import { useOffer } from '@moonbase.sh/react'

const offer = useOffer('d6688961-7843-4bf4-be7c-4d9d6c5ce7be')
```

### `useOffers`

`useOffers` returns all offers in the catalog. `useEligibleOffers` returns offers whose condition is currently satisfied by the cart and whose promoted item is not already in the cart.

`useLockedOffers` returns item offers that the cart has not unlocked yet, each paired with its `progress` toward the spend threshold required to unlock it, sorted with the closest threshold first. Only offers gated on a cart total appear in `useLockedOffers`.

```tsx
import {
  useEligibleOffers,
  useLockedOffers,
  useOffers,
} from '@moonbase.sh/react'

const offers = useOffers()
const eligibleOffers = useEligibleOffers()
const lockedOffers = useLockedOffers()
```

### `useCartOffer`

Tracks order-level cart offers that discount the entire cart once a spend threshold is met.

```tsx
import { useCartOffer } from '@moonbase.sh/react'

const cartOffer = useCartOffer()
```

Returns `null` until there is a cart, and otherwise returns `{ applied, next, subtotal, currency }`. `applied` is the offer currently discounting the order along with the amount saved, and `next` is the next higher tier along with its `progress`.

### `usePromotions`

Returns the active sales running across your catalog.

```tsx
import { usePromotions } from '@moonbase.sh/react'

const promotions = usePromotions()
```

Validity windows and audience restrictions are evaluated by the API before the catalog is returned, so render this list as-is. The list updates automatically when the customer signs in, signs out, or joins a group. Each promotion includes the `discount` it applies, and `discount.promotionId` matches the `promotionId` on any pricing variation discount it controls.

### `useCart`

Manages the persistent shopping cart and client-side price totals.

```tsx
import { useCart } from '@moonbase.sh/react'

const {
  items,
  currency,
  total,
  breakdown,
  cartOffer,
  addToCart,
  setQuantity,
  removeFromCart,
  checkout,
} = useCart()
```

`total` is the final amount to display to the customer. `breakdown` contains the `original` list price, the `subtotal` after product discounts and item offers, the `cartOffer` deduction, and the total `discount` across all sources.

The SDK persists the cart in `localStorage` and synchronizes cart state across open browser tabs.

Item offers are attached to a cart line when passed to `addToCart`. To have the cart automatically attach eligible item offers to matching lines already in the cart, enable `autoApplyItemOffers`:

```tsx
const storefront = createStorefront('https://{YOUR-ACCOUNT-ID}.moonbase.sh', {
  autoApplyItemOffers: true,
})
```

`autoApplyItemOffers` is `false` by default. It only fills empty offer slots on lines already in the cart and never adds new products or overwrites an existing offer on a line. The underlying helpers are also re-exported from `@moonbase.sh/storefront-api` as `CartUtils.assignItemOffers`, `CartUtils.bestItemOffer`, `CartUtils.offerTargetsLine`, and `OfferUtils.allTargetsInCart`.

For products sold with [licenses that cover only some releases](https://moonbase.sh/docs/concepts/#release-access), pass the customer's license ID as `targetLicenseId` to sell an upgrade or renewal for that license:

```tsx
addToCart(product, undefined, undefined, { targetLicenseId: license.id })
```

Each upgraded license is added as its own cart line with a quantity of 1.

`checkout()` accepts a `redirect` option (also supported by `useCheckout()` and `renewSubscription()`):

| Value | Behavior |
| --- | --- |
| `'auto'` (default) | Overlay iframe on desktop and tablet, full-page redirect on phones. |
| `'always'` / `true` | Always redirect to the Moonbase-hosted checkout. |
| `'never'` / `false` | Always use the overlay iframe. |

`'auto'` redirects on phones because Apple Pay and Google Pay require the top-level document domain to be a registered payment-method domain. Redirecting on mobile makes the hosted checkout the top-level document so those wallets appear, while keeping the in-page overlay on desktop.

```tsx
const cart = useCart()

async function startCheckout() {
  await cart.checkout({ redirect: 'never', returnUrl: window.location.href })
}
```

When a checkout call redirects, the result arrives on the return page rather than in the current tab, so the promise resolves with `{ completed: false, redirected: true }`. Check `redirected` before treating `completed: false` as a canceled checkout.

`returnUrl` sets where a redirected customer returns after checkout and defaults to the current page URL (including query string and hash). Moonbase strips its own `mb_*` handshake parameters from `returnUrl` before appending the completion state.

### `useCheckout`

Starts a one-off checkout session for specific items without modifying the persistent cart.

```tsx
import { useCheckout } from '@moonbase.sh/react'

const checkout = useCheckout()

async function buyNow() {
  await checkout(
    [{ item: product, variation: product.defaultVariation, quantity: 1 }],
    { redirect: 'auto', couponCode: 'LAUNCH20' },
  )
}
```

Starting another direct checkout within 24 hours as the same customer reopens the previous open order with the new items so billing details already entered by the buyer are preserved. A coupon passed in a previous call is removed unless passed again, while a coupon typed directly into the checkout UI is kept. If another tab reopens the same order while the checkout overlay is open in this tab, this tab's overlay closes and resolves with `completed: false`.

For call sites outside React components, use `checkoutItems(context, items, options)` (also exported as `directCheckout`).

### `useCommunicationPreferences`

Wraps the public communications API for newsletter and product-update opt-ins, double-opt-in confirmation, preference management, and one-click unsubscribe links.

```tsx
import { useCommunicationPreferences } from '@moonbase.sh/react'

const {
  subscribe,
  confirm,
  get,
  update,
  unsubscribe,
} = useCommunicationPreferences()
```

`subscribe({ email, name, newsletter, productUpdates })` records the opt-in (`newsletter` and `productUpdates` default to `true`). When email confirmation is enabled on your Moonbase account, the call resolves with `{ status: 'confirmation_sent' }`; when disabled, it resolves with `{ status: 'subscribed' }`.

`confirm(email, token)` redeems the confirmation token from the double-opt-in email. `get(email, token)` and `update(email, token, { newsletter, productUpdates })` use the unsubscribe token included in marketing emails to read and update preferences, and `unsubscribe(email, token)` unsubscribes from all marketing emails in one step.

See the [Communications section of the Storefront API reference](https://moonbase.sh/docs/storefronts/api/#communications) for the underlying endpoints.

### `useVoucher`

Handles [voucher](https://moonbase.sh/docs/concepts/#vouchers) inspection and redemption. Redeeming a voucher requires an authenticated user.

```tsx
import { useVoucher } from '@moonbase.sh/react'

const {
  peek,
  redeem, // Requires authenticated user
} = useVoucher()
```

### `useGroups`

Joins the signed-in customer to a customer group that has been opened to public sign-ups, then refreshes the storefront catalog and user state. Throws `NotFoundError` whenever a join is refused.

```tsx
import { useGroups } from '@moonbase.sh/react'

const { join } = useGroups()
```

### `useVendor`

Fetches public vendor metadata (company name, support contact, legal details) on demand and caches it in the storefront store.

```tsx
import { useVendor } from '@moonbase.sh/react'

const { vendor, loading } = useVendor()
```

## Checkout lifecycle events

The storefront context exposes event listeners for checkout lifecycle steps. Each registration returns an unsubscribe function suitable for `useEffect` cleanup:

```tsx
storefront.onCheckoutInitiated((order, total) => {
  console.log('Checkout started', order.id, total)
})

storefront.onCheckoutCompleted((order) => {
  console.log('Checkout completed', order.id)
})
```

The embedded checkout overlay also reports progress inside the iframe:

```tsx
storefront.onCheckoutBillingDetailsAdded((order) => {
  console.log('Billing details saved', order.id)
})

storefront.onCheckoutPaymentStarted((order) => {
  console.log('Payment started', order.id)
})

storefront.onCheckoutPaymentFailed((order, error) => {
  // `reason` (`Declined`, `AuthenticationFailed`, `CardDetails`, `ProcessingError`
  // or `Other`) and `paymentMethod`, matching the `OrderPaymentFailed` webhook.
  console.log('Payment failed', order.id, error.reason)
})

storefront.onCheckoutCouponApplied((order, code) => {})
storefront.onCheckoutCouponRemoved((order, code) => {})
storefront.onCheckoutCouponRejected((code, message) => {})

storefront.onCheckoutClosed((intent, completed, order) => {
  console.log(completed ? 'Completed' : 'Closed without completing', order?.id)
})
```

None of these browser events fire while the buyer is on the hosted checkout page after a full-page redirect. Subscribe a webhook to `OrderPaymentFailed` on your server to track every checkout attempt.

## Custom storefront mode

A Moonbase account configured for custom storefront mode redirects users to merchant-controlled URLs for flows that Moonbase otherwise handles on its hosted portal: license activation, sign-in callbacks, email confirmations, password resets, product downloads, and subscription management. Each entry in `CustomStorefrontLocations` maps to a path on your storefront origin with the query parameters listed below.

| Account setting | Suggested path | Query params | SDK call to invoke |
| --- | --- | --- | --- |
| `AutoActivation` | `/activate` | `token` | `useActivationRequest(token).fulfillLicense()` or `.fulfillTrial(optIn)` |
| `OfflineActivation` | `/activate` | *(none)* | `useInventory().activateProduct(deviceToken, ActivationMethod.Offline)` |
| `LogIn` | `/login` | *(none)* | `useAuth().signIn(email, password)` |
| `ConfirmAccount` | `/sign-up` | `email`, `code` | `useAuth().confirmAccount(email, code)` |
| `ConfirmEmail` | `/confirm-email` | `email`, `code` | `useAuth().confirmEmail(email, code)` |
| `ConfirmEmailChange` | `/account/confirm-email-change` | `email`, `code` | `useAuth().confirmEmailChange(email, code)` |
| `ResetPassword` | `/forgot-password` | `email`, `code` | `useAuth().forgotPassword(email)` or `.resetPassword(email, code, password)` |
| `DownloadProduct` | `/download` | `product_id`, optional `version` and `key` | `useInventory().downloadProduct(...)` |
| `Checkout` | *(optional)* | *(none)* | Leave unset and use the embedded overlay via `useCart().checkout({ redirect: 'never' })` |
| `ManageSubscription` | `/subscriptions` | `subscription_id` | `useInventory().getSubscription(subscriptionId)` |

The paths above are suggestions; configure the paths on your Moonbase account to match the routes your storefront implements.

## Attribution

The hook API and store architecture of this package follow the design of
[`@moonbase.sh/vue`](https://www.npmjs.com/package/@moonbase.sh/vue) (MIT,
Moonbase), re-implemented for React on top of
[`@moonbase.sh/storefront-api`](https://www.npmjs.com/package/@moonbase.sh/storefront-api).
This is an independent implementation and is not endorsed by Moonbase.

Licensed under the [MIT License](../../LICENSE).
