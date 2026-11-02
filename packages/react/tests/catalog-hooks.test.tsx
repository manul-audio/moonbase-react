import React from 'react'
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createStorefront } from '../src/context'
import { StorefrontProvider } from '../src/provider'
import { useProduct } from '../src/hooks/use-product'
import { useProducts } from '../src/hooks/use-products'
import { useBundle } from '../src/hooks/use-bundle'
import { useBundles } from '../src/hooks/use-bundles'
import { useOffer } from '../src/hooks/use-offer'
import { useOffers, useEligibleOffers, useLockedOffers, useCartOffer } from '../src/hooks/use-offers'
import { usePromotions } from '../src/hooks/use-promotions'

describe('StorefrontProvider & catalog/offer selector hooks', () => {
  it('hydrates synchronously from initialState on first render without network flash', () => {
    const initialState = {
      storefront: {
        suggestedCurrency: 'EUR',
        enabledCurrencies: ['EUR'],
        bundles: [{ id: 'b1', name: 'All Bundle', variations: [] } as any],
        products: [{ id: 'p1', name: 'Reverb', owned: false, variations: [] } as any],
        offers: [
          {
            id: 'o1',
            name: 'Loyalty Offer',
            scope: 'Item',
            condition: { type: 'CartTotal', minimumTotal: { EUR: 5000 } },
            targets: [],
          } as any,
        ],
        promotions: [{ id: 'promo-1', name: 'Summer Sale' } as any],
      },
      loadedStorefront: true,
      closed: false,
      currentUser: null,
      loadedUser: true,
    }

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <StorefrontProvider endpoint="https://demo.moonbase.sh" initialState={initialState}>
        {children}
      </StorefrontProvider>
    )

    const { result } = renderHook(
      () => ({
        product: useProduct('p1'),
        missing: useProduct('nope'),
        products: useProducts(),
        bundle: useBundle('b1'),
        bundles: useBundles(),
        offer: useOffer('o1'),
        offers: useOffers(),
        eligibleOffers: useEligibleOffers(),
        lockedOffers: useLockedOffers(),
        cartOffer: useCartOffer(),
        promotions: usePromotions(),
      }),
      { wrapper },
    )

    expect(result.current.product?.name).toBe('Reverb')
    expect(result.current.missing).toBeNull()
    expect(result.current.products).toHaveLength(1)
    expect(result.current.bundle?.name).toBe('All Bundle')
    expect(result.current.bundles).toHaveLength(1)
    expect(result.current.offer?.id).toBe('o1')
    expect(result.current.offers).toHaveLength(1)
    expect(result.current.promotions).toHaveLength(1)
  })

  it('does not re-render useProduct(p1) when unrelated product p2 updates', () => {
    const sf = createStorefront('https://demo.moonbase.sh')
    const p1 = { id: 'p1', name: 'Reverb', owned: false, variations: [] } as any
    const p2 = { id: 'p2', name: 'Delay', owned: false, variations: [] } as any
    sf.hydrate({
      storefront: {
        suggestedCurrency: 'USD',
        enabledCurrencies: ['USD'],
        bundles: [],
        products: [p1, p2],
        offers: [],
        promotions: [],
      },
      loadedStorefront: true,
      closed: false,
      currentUser: null,
      loadedUser: true,
    })

    let renders = 0
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <StorefrontProvider storefront={sf}>{children}</StorefrontProvider>
    )
    renderHook(
      () => {
        renders++
        return useProduct('p1')
      },
      { wrapper },
    )
    expect(renders).toBe(1)

    act(() => {
      const prev = sf.store.getState().storefront
      sf.store.setState({
        storefront: {
          ...prev,
          products: [p1, { ...p2, name: 'Delay v2' }],
        },
      })
    })
    expect(renders).toBe(1)
  })
})
