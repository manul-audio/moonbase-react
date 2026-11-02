import { describe, expect, it, vi } from 'vitest'
import {
  backdropInk,
  resolveCheckoutBackdrop,
  setCheckoutBackdrop,
  withCheckoutBackdrop,
} from '../src/utils/checkout-backdrop'
import { setCheckoutPriceFormat, withPriceFormat } from '../src/utils/price-format'
import {
  checkoutWindowEvents,
  closeCheckout,
  isTrustedCheckoutOrigin,
  mountCheckout,
  parseCheckoutMessage,
} from '../src/utils/iframe-checkout'

describe('embedded checkout & postMessage security', () => {
  it('decorates endpoint with backdrop and price format query params', () => {
    setCheckoutBackdrop({ color: 'dark', opacity: 'strong', blur: false })
    setCheckoutPriceFormat({ currencyDisplay: 'code', trailingZeros: 'always' })
    const url = withPriceFormat(withCheckoutBackdrop('https://demo.moonbase.sh/checkout/1'))
    expect(url).toContain('backdrop_color=dark')
    expect(url).toContain('backdrop_opacity=strong')
    expect(url).toContain('backdrop_blur=false')
    expect(url).toContain('currency_display=code')
    expect(url).toContain('trailing_zeros=always')
    setCheckoutBackdrop(undefined)
    setCheckoutPriceFormat(undefined)
  })

  it('computes contrast backdropInk for light vs dark backdrops', () => {
    expect(backdropInk(resolveCheckoutBackdrop({ color: 'dark' }))).toBe('#ffffff')
    expect(backdropInk(resolveCheckoutBackdrop({ color: 'light' }))).toBe('#030712')
  })

  it('parses valid checkout postMessage payloads and rejects malformed ones', () => {
    expect(parseCheckoutMessage({ source: 'moonbase-checkout', event: 'ready' })).toEqual({
      source: 'moonbase-checkout',
      event: 'ready',
    })
    expect(parseCheckoutMessage('not-an-object')).toBeNull()
  })

  it('ignores spoofed postMessage events from untrusted origins during mountCheckout (Review Focus #2)', () => {
    expect(
      isTrustedCheckoutOrigin('https://evil.example.com', 'https://demo.moonbase.sh/checkout/1'),
    ).toBe(false)
    expect(
      isTrustedCheckoutOrigin('https://demo.moonbase.sh', 'https://demo.moonbase.sh/checkout/1'),
    ).toBe(true)

    const onClose = vi.fn()
    window.addEventListener('moonbase-checkout-closed', onClose)

    mountCheckout('https://demo.moonbase.sh/checkout/1')
    const iframe = document.getElementById('moonbase-checkout') as HTMLIFrameElement
    expect(iframe).not.toBeNull()

    // Untrusted origin attempt must be ignored even if source is spoofed
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://evil.example.com',
        source: iframe.contentWindow,
        data: { source: 'moonbase-checkout', event: 'close', completed: false },
      }),
    )
    expect(onClose).not.toHaveBeenCalled()

    // Trusted origin close event
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://demo.moonbase.sh',
        source: iframe.contentWindow,
        data: { source: 'moonbase-checkout', event: 'close', completed: false },
      }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)

    window.removeEventListener('moonbase-checkout-closed', onClose)
    closeCheckout()
  })
})
