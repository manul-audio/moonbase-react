import React from 'react'
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createStorefront } from '../src/context'
import { StorefrontProvider } from '../src/provider'
import { useCart } from '../src/hooks/use-cart'

const upgradeLicenseUuid = '11111111-2222-3333-4444-555555555555'

const demoProduct: any = {
  id: 'prod-1',
  type: 'Product',
  name: 'Manul Compressor',
  defaultVariationId: 'var-1',
  defaultVariation: {
    id: 'var-1',
    name: 'Standard',
    price: { USD: 4900 },
    recurrence: { type: 'Once' },
  },
  variations: [
    {
      id: 'var-1',
      name: 'Standard',
      price: { USD: 4900 },
      recurrence: { type: 'Once' },
    },
  ],
  licenseUpgrades: [
    {
      licenseIds: [upgradeLicenseUuid],
      variations: [
        {
          id: 'var-1',
          name: 'Upgrade',
          price: { USD: 1900 },
          recurrence: { type: 'Once' },
        },
      ],
    },
  ],
}

describe('useCart parity', () => {
  it('adds items, calculates client-side total/breakdown, updates quantity, and removes items', () => {
    const sf = createStorefront('https://demo.moonbase.sh')
    vi.spyOn(sf, 'pushOrderContent').mockResolvedValue()
    sf.hydrate({
      storefront: {
        suggestedCurrency: 'USD',
        enabledCurrencies: ['USD'],
        bundles: [],
        products: [demoProduct],
        offers: [],
        promotions: [],
      },
      loadedStorefront: true,
      closed: false,
      currentUser: null,
      loadedUser: true,
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <StorefrontProvider storefront={sf}>{children}</StorefrontProvider>
    )
    const { result } = renderHook(() => useCart(), { wrapper })

    act(() => {
      result.current.addToCart(demoProduct)
    })

    expect(result.current.items).toHaveLength(1)
    expect(result.current.currency).toBe('USD')
    expect(result.current.total.amount).toBe(4900)

    act(() => {
      result.current.setQuantity(result.current.items[0], 2)
    })
    expect(result.current.total.amount).toBe(9800)

    act(() => {
      result.current.removeFromCart(result.current.items[0])
    })
    expect(result.current.items).toHaveLength(0)
    expect(result.current.total.amount).toBe(0)
  })

  it('creates separate quantity-1 line item for targetLicenseId license upgrades', () => {
    const sf = createStorefront('https://demo.moonbase.sh')
    vi.spyOn(sf, 'pushOrderContent').mockResolvedValue()
    sf.hydrate({
      storefront: {
        suggestedCurrency: 'USD',
        enabledCurrencies: ['USD'],
        bundles: [],
        products: [demoProduct],
        offers: [],
        promotions: [],
      },
      loadedStorefront: true,
      closed: false,
      currentUser: null,
      loadedUser: true,
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <StorefrontProvider storefront={sf}>{children}</StorefrontProvider>
    )
    const { result } = renderHook(() => useCart(), { wrapper })

    act(() => {
      result.current.addToCart(demoProduct, undefined, undefined, {
        targetLicenseId: upgradeLicenseUuid,
      })
      // Adding same upgrade again keeps quantity capped at 1
      result.current.addToCart(demoProduct, undefined, undefined, {
        targetLicenseId: upgradeLicenseUuid,
      })
    })

    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].quantity).toBe(1)
    expect((result.current.items[0] as any).targetLicenseId).toBe(upgradeLicenseUuid)
    expect(result.current.total.amount).toBe(1900)
  })
})

