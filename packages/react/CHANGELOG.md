# @moonbase.sh/react

## 0.1.1

### Patch Changes

- 17e717f: Expose `./package.json` through the `exports` map so tooling and consumers can read the package manifest (for example `require('@moonbase.sh/react/package.json').version`).
- 0988300: Fix server rendering with hydrated state. `hydrate()` now also pins the store's initial snapshot, which `useSyncExternalStore` reads during server rendering and React's hydration pass. Before this, every hook rendered an empty catalog on the server even when `initialState` was supplied, so SSR output never contained products or the signed-in user.

## 0.1.0

### Minor Changes

- Initial release. Headless React hooks for Moonbase storefronts: `useStorefront`, `useAuth`, `useInventory`, `useActivationRequest`, `useBundle`, `useBundles`, `useProduct`, `useProducts`, `useOffer`, `useOffers`, `useEligibleOffers`, `useLockedOffers`, `useCartOffer`, `usePromotions`, `useCart`, `useCheckout`, `useCommunicationPreferences`, `useVoucher`, `useGroups`, `useVendor`. Embedded checkout overlay with origin-validated `postMessage`. Server-side rendering support via `createServerStorefront`, `serializeStorefrontState`, and a split cookie/localStorage auth store (`@moonbase.sh/react/ssr`).
