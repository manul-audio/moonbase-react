export type CurrencyDisplay = 'narrowSymbol' | 'symbol' | 'code' | 'name'
export type TrailingZeros = 'auto' | 'always'

export interface PriceFormat {
  currencyDisplay?: CurrencyDisplay
  trailingZeros?: TrailingZeros
}

let priceFormat: PriceFormat | undefined

export function setCheckoutPriceFormat(format: PriceFormat | undefined): void {
  priceFormat = format
}

export function withPriceFormat(endpoint: string): string {
  if (!priceFormat?.currencyDisplay && !priceFormat?.trailingZeros) {
    return endpoint
  }
  try {
    const url = new URL(endpoint)
    if (priceFormat.currencyDisplay) {
      url.searchParams.set('currency_display', priceFormat.currencyDisplay)
    }
    if (priceFormat.trailingZeros) {
      url.searchParams.set('trailing_zeros', priceFormat.trailingZeros)
    }
    return url.toString()
  } catch {
    return endpoint
  }
}
