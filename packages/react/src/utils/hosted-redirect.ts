import { withPriceFormat } from './price-format'

export interface RedirectableOrder {
  hostedCheckoutUrl?: string | null
  embeddedCheckoutUrl?: string | null
}

export function buildHostedRedirectUrl(
  order: RedirectableOrder,
  returnUrl: string,
): string | null {
  if (!order.hostedCheckoutUrl || !order.embeddedCheckoutUrl) return null
  const url = new URL(order.hostedCheckoutUrl)
  url.searchParams.delete('email')
  url.searchParams.delete('token')
  url.searchParams.set('anonymous', '1')

  const completion = new URL(returnUrl)
  completion.searchParams.set('mb_intent', 'checkout')
  completion.searchParams.set('mb_complete', 'true')

  const endpoint = new URL(order.embeddedCheckoutUrl)
  endpoint.searchParams.delete('return')
  completion.searchParams.set('mb_endpoint', encodeURIComponent(endpoint.toString()))

  url.searchParams.set('return', completion.toString())
  return withPriceFormat(url.toString())
}
