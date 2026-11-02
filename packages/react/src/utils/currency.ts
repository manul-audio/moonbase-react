import type { Order, Storefront } from '@moonbase.sh/storefront-api'

export function resolveDisplayCurrency(
  order?: Order | null,
  storefront?: Storefront | null,
): string {
  return storefront?.suggestedCurrency || order?.currency || ''
}

