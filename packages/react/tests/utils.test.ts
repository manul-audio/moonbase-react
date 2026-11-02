import { describe, expect, it } from 'vitest'
import { withoutHandshakeParams } from '../src/utils/return-url'
import { resolveCheckoutRedirect } from '../src/utils/checkout-mode'
import { buildHostedRedirectUrl } from '../src/utils/hosted-redirect'
import { lineItemId, targetLicenseId } from '../src/utils/target-license'
import { rememberPurchase, forgetPurchase } from '../src/utils/direct-purchase'

describe('pure utilities parity', () => {
  it('strips mb_ handshake params while preserving merchant query and hash', () => {
    expect(
      withoutHandshakeParams('https://manul.audio/store?utm_source=ig&mb_complete=1&mb_intent=buy#pricing'),
    ).toBe('https://manul.audio/store?utm_source=ig#pricing')
  })

  it('honors mb_checkout_mode URL override in resolveCheckoutRedirect', () => {
    window.history.replaceState({}, '', '/store?mb_checkout_mode=redirect')
    const decision = resolveCheckoutRedirect('never')
    expect(decision).toEqual({
      redirect: true,
      mode: 'always',
      reason: 'url-override',
      overridden: true,
    })
    window.history.replaceState({}, '', '/')
  })

  it('builds hosted redirect URL with anonymous=1 and return handshake params', () => {
    const url = buildHostedRedirectUrl(
      {
        hostedCheckoutUrl: 'https://demo.moonbase.sh/checkout/123?token=secret',
        embeddedCheckoutUrl: 'https://demo.moonbase.sh/embed/123?return=old',
      },
      'https://manul.audio/cart?foo=bar',
    )
    expect(url).not.toBeNull()
    const parsed = new URL(url!)
    expect(parsed.searchParams.get('token')).toBeNull()
    expect(parsed.searchParams.get('anonymous')).toBe('1')
    const ret = new URL(parsed.searchParams.get('return')!)
    expect(ret.searchParams.get('foo')).toBe('bar')
    expect(ret.searchParams.get('mb_intent')).toBe('checkout')
    expect(ret.searchParams.get('mb_complete')).toBe('true')
  })

  it('computes deterministic lineItemId and UUID-validated targetLicenseId', () => {
    const uuid = '11111111-2222-3333-4444-555555555555'
    expect(lineItemId('Product', 'p1', 'v1', undefined)).toBe('p/p1/v1')
    expect(lineItemId('Bundle', 'b1', 'v1', undefined)).toBe('b/b1/v1')
    expect(lineItemId('Product', 'p1', 'v1', uuid)).toBe(`p/p1/v1/${uuid}`)
    expect(targetLicenseId(`  ${uuid.toUpperCase()}  `)).toBe(uuid)
    expect(targetLicenseId('not-a-uuid')).toBeUndefined()
  })

  it('remembers and forgets direct purchases in localStorage', () => {
    rememberPurchase('ord-1', 'usr-1', 'SAVE20', 1000)
    expect(window.localStorage.getItem('moonbase_direct_purchase')).toContain('ord-1')
    forgetPurchase('ord-1')
    expect(window.localStorage.getItem('moonbase_direct_purchase')).toBeNull()
  })
})
