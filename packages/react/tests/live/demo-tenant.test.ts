import { NotFoundError } from '@moonbase.sh/storefront-api'
import { describe, expect, it } from 'vitest'
import { createStorefront } from '../../src/context'
import { createServerStorefront, serializeStorefrontState } from '../../src/ssr'

// Read-only checks against a real Moonbase tenant. Nothing here signs in,
// signs up, creates an order, or redeems a voucher. The tenant can be
// pointed elsewhere with MOONBASE_LIVE_ENDPOINT.
const endpoint = process.env.MOONBASE_LIVE_ENDPOINT ?? 'https://corino-demo.moonbase.sh'

async function tenantReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${endpoint}/api/customer/storefront`, {
      signal: AbortSignal.timeout(5_000),
    })
    return res.ok
  } catch {
    return false
  }
}

// Top-level await runs during collection, so the skip decision is known
// before any test is registered. Offline machines get a skip, not a failure.
const reachable = await tenantReachable()

describe.skipIf(!reachable)(`live demo tenant (${endpoint})`, () => {
  it('createServerStorefront hydrates the catalog without a user', async () => {
    const { initialState } = await createServerStorefront(endpoint)

    expect(initialState.loadedStorefront).toBe(true)
    expect(initialState.closed).toBe(false)
    expect(initialState.currentUser).toBeNull()
    expect(initialState.storefront?.products.length ?? 0).toBeGreaterThan(0)
  })

  it('exposes the documented demo products and bundle', async () => {
    const { initialState } = await createServerStorefront(endpoint)
    const productIds = initialState.storefront?.products.map((p) => p.id) ?? []
    const bundleIds = initialState.storefront?.bundles.map((b) => b.id) ?? []

    expect(productIds).toContain('halo')
    expect(productIds).toContain('drift')
    expect(bundleIds).toContain('duo-bundle')
  })

  it('serialized state round-trips into a fresh client-side store', async () => {
    const { initialState } = await createServerStorefront(endpoint)
    const serialized = serializeStorefrontState(initialState)

    const client = createStorefront(endpoint)
    client.hydrate(JSON.parse(serialized))

    const state = client.store.getState()
    expect(state.loadedStorefront).toBe(true)
    expect(state.storefront.products.map((p) => p.id).sort()).toEqual(
      (initialState.storefront?.products.map((p) => p.id) ?? []).sort(),
    )
  })

  it('voucher peek of an unknown code rejects with NotFoundError', async () => {
    const { storefront } = await createServerStorefront(endpoint, { fetchOnInit: false })

    await expect(
      storefront.client.vouchers.peek('CORINO-REACT-LIVE-TEST-INVALID'),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('identifies itself as @moonbase.sh/react in the x-mb-client header', async () => {
    const seen: string[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (input, init) => {
      const header = new Headers(init?.headers).get('x-mb-client')
      if (header) seen.push(header)
      return realFetch(input, init)
    }) as typeof fetch

    try {
      await createServerStorefront(endpoint)
    } finally {
      globalThis.fetch = realFetch
    }

    expect(seen.length).toBeGreaterThan(0)
    expect(seen[0]).toMatch(/@moonbase\.sh\/react\/\d+\.\d+\.\d+/)
  })
})
