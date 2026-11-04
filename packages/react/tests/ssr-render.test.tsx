import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createStorefront } from '../src/context'
import { StorefrontProvider } from '../src/provider'
import { useProduct } from '../src/hooks/use-product'
import { useStorefront } from '../src/hooks/use-storefront'
import type { StorefrontHydrationState } from '../src/ssr'

// Server rendering (and React's hydration pass) read the store through
// useSyncExternalStore's *server snapshot*, which zustand serves from
// `getInitialState()`, not `getState()`. A provider that hydrates only via
// setState therefore renders an empty catalog on the server, defeating the
// point of SSR hydration. These tests render with react-dom/server to catch
// exactly that; jsdom-based renderHook tests never would.

const initialState: StorefrontHydrationState = {
  storefront: {
    suggestedCurrency: 'EUR',
    enabledCurrencies: ['EUR'],
    bundles: [],
    products: [
      { id: 'p1', name: 'Reverb Deluxe', owned: false, variations: [] } as any,
      { id: 'p2', name: 'Saturator', owned: false, variations: [] } as any,
    ],
    offers: [],
    promotions: [],
  } as any,
  loadedStorefront: true,
  closed: false,
  currentUser: null,
  loadedUser: true,
}

function Catalog() {
  const { storefront, loaded } = useStorefront()
  const p1 = useProduct('p1')
  return (
    <main data-loaded={String(loaded)} data-products={storefront.products.length}>
      {p1 ? <h1>{p1.name}</h1> : <h1>missing</h1>}
    </main>
  )
}

describe('server rendering with hydrated state', () => {
  it('renderToString sees the hydrated catalog through the hooks', () => {
    const html = renderToString(
      <StorefrontProvider endpoint="https://demo.moonbase.sh" initialState={initialState}>
        <Catalog />
      </StorefrontProvider>,
    )
    expect(html).toContain('data-loaded="true"')
    expect(html).toContain('data-products="2"')
    expect(html).toContain('<h1>Reverb Deluxe</h1>')
  })

  it('a later hydrate() on the same context also updates the server snapshot', () => {
    const sf = createStorefront('https://demo.moonbase.sh')
    sf.hydrate(initialState)
    const html = renderToString(
      <StorefrontProvider storefront={sf}>
        <Catalog />
      </StorefrontProvider>,
    )
    expect(html).toContain('<h1>Reverb Deluxe</h1>')
  })
})
