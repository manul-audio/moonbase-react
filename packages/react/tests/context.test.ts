import { describe, expect, it, vi } from 'vitest'
import { StoreClosedError } from '@moonbase.sh/storefront-api'
import { createStorefront } from '../src/context'
import { createServerStorefront } from '../src/ssr'

describe('StorefrontContext & createStorefront', () => {
  it('ignores out-of-order overlapping updateStorefront responses (Review Focus #1)', async () => {
    const ctx = createStorefront('https://demo.moonbase.sh')
    let resolveFirst!: (val: any) => void
    let resolveSecond!: (val: any) => void

    vi.spyOn(ctx.client.storefront, 'get')
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
      .mockImplementationOnce(() => new Promise((r) => { resolveSecond = r }))

    const p1 = ctx.updateStorefront()
    const p2 = ctx.updateStorefront()

    // Second request finishes first (post-purchase: owned = true)
    resolveSecond({
      suggestedCurrency: 'USD',
      enabledCurrencies: ['USD'],
      bundles: [],
      offers: [],
      promotions: [],
      products: [{ id: 'p1', name: 'Synth', owned: true, variations: [] }],
    })
    await p2

    // Stale first request finishes last (pre-purchase: owned = false)
    resolveFirst({
      suggestedCurrency: 'USD',
      enabledCurrencies: ['USD'],
      bundles: [],
      offers: [],
      promotions: [],
      products: [{ id: 'p1', name: 'Synth', owned: false, variations: [] }],
    })
    await p1

    expect(ctx.store.getState().storefront.products[0].owned).toBe(true)
  })

  it('transitions cleanly to closed=true when StoreClosedError is thrown (Review Focus #3)', async () => {
    const ctx = createStorefront('https://demo.moonbase.sh')
    vi.spyOn(ctx.client.storefront, 'get').mockRejectedValueOnce(new StoreClosedError('closed'))

    await ctx.updateStorefront()
    expect(ctx.store.getState().closed).toBe(true)
    expect(ctx.store.getState().loadedStorefront).toBe(true)
    expect(ctx.store.getState().storefront.products).toEqual([])
  })

  it('manages attributionConsent and strips ad click IDs until consent is granted', () => {
    window.history.replaceState({}, '', '/?utm_source=news&gclid=G123')
    const ctx = createStorefront('https://demo.moonbase.sh', { attributionConsent: false })
    vi.spyOn(ctx, 'updateStorefront').mockResolvedValue(ctx.store.getState().storefront)
    vi.spyOn(ctx, 'updateUser').mockResolvedValue(null)
    vi.spyOn(ctx, 'pushOrderContent').mockResolvedValue()

    const cleanup = ctx.bootBrowser()

    expect(ctx.store.getState().utm?.source).toBe('news')
    expect(ctx.store.getState().utm?.gclid).toBeUndefined()

    ctx.setAttributionConsent(true)
    expect(ctx.store.getState().utm?.gclid).toBe('G123')

    cleanup()
    window.history.replaceState({}, '', '/')
  })

  it('isolates concurrent createServerStorefront calls across requests (Review Focus #5)', async () => {
    const [reqA, reqB] = await Promise.all([
      createServerStorefront('https://demo.moonbase.sh', {
        cookieHeader: 'moonbase_ssr_token=tokA',
        fetchOnInit: false,
      }),
      createServerStorefront('https://demo.moonbase.sh', {
        cookieHeader: 'moonbase_ssr_token=tokB',
        fetchOnInit: false,
      }),
    ])
    expect(reqA.storefront).not.toBe(reqB.storefront)
    expect(reqA.storefront.store).not.toBe(reqB.storefront.store)
  })

  it('deduplicates tokenStore.onSessionEnded registration across StrictMode remounts', () => {
    const ctx = createStorefront('https://demo.moonbase.sh')
    vi.spyOn(ctx, 'updateStorefront').mockResolvedValue(ctx.store.getState().storefront)
    vi.spyOn(ctx, 'updateUser').mockResolvedValue(null)
    const onSessionEndedSpy = vi.spyOn(ctx.client.tokenStore, 'onSessionEnded')

    const cleanup1 = ctx.bootBrowser()
    cleanup1()
    const cleanup2 = ctx.bootBrowser()
    cleanup2()

    expect(onSessionEndedSpy).toHaveBeenCalledTimes(1)
  })
})

