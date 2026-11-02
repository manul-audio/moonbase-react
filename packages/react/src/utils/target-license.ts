import {
  CartUtils,
  type PricingVariation,
  type StorefrontProduct,
} from '@moonbase.sh/storefront-api'

const licenseIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function targetLicenseId(value: string | null | undefined): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'string' && licenseIdPattern.test(value.trim())) {
    return value.trim().toLowerCase()
  }
  console.warn('Moonbase: ignoring a target license that is not a license ID:', value)
  return undefined
}

export function lineItemId(
  type: 'Product' | 'Bundle',
  itemId: string,
  variationId: string,
  licenseId?: string,
): string {
  const id = `${type === 'Bundle' ? 'b' : 'p'}/${itemId}/${variationId}`
  return type === 'Product' && licenseId ? `${id}/${licenseId}` : id
}

export function upgradeVariation(
  product: StorefrontProduct,
  licenseId: string,
  variation?: PricingVariation,
): PricingVariation | undefined {
  const upgrades = CartUtils.licenseUpgradeVariations(product, licenseId) ?? []
  if (variation) {
    return upgrades.find((v) => v.id === variation.id) ?? variation
  }
  const defaultVariation = product.defaultVariation ?? undefined
  return (
    upgrades.find((v) => v.id === defaultVariation?.id) ?? upgrades[0] ?? defaultVariation
  )
}

