export type CheckoutBackdropColor = 'dark' | 'light' | 'brand'
export type CheckoutBackdropOpacity = 'subtle' | 'standard' | 'strong'

export interface CheckoutBackdrop {
  color?: CheckoutBackdropColor
  opacity?: CheckoutBackdropOpacity
  blur?: boolean
  brand?: string
}

export interface DrawnCheckoutBackdrop {
  color?: string
  blur?: boolean
}

export interface ResolvedCheckoutBackdrop {
  color: string
  blur: boolean
}

let published: CheckoutBackdrop | undefined

export function setCheckoutBackdrop(backdrop: CheckoutBackdrop | undefined): void {
  published = backdrop
}

const DARK_RGB: [number, number, number] = [3, 7, 18]
const LIGHT_RGB: [number, number, number] = [255, 255, 255]
const DEFAULT_ALPHA = 0.75
const BACKDROP_ALPHA: Record<CheckoutBackdropOpacity, number> = {
  subtle: 0.5,
  standard: 0.75,
  strong: 0.9,
}
const BACKDROP_COLORS = new Set<string>(['dark', 'light', 'brand'])

function isBackdropColor(value: unknown): value is CheckoutBackdropColor {
  return typeof value === 'string' && BACKDROP_COLORS.has(value)
}

function isBackdropOpacity(value: unknown): value is CheckoutBackdropOpacity {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(BACKDROP_ALPHA, value)
}

export function withCheckoutBackdrop(endpoint: string): string {
  const color = isBackdropColor(published?.color) ? published?.color : undefined
  const opacity = isBackdropOpacity(published?.opacity) ? published?.opacity : undefined
  const blur = typeof published?.blur === 'boolean' ? published.blur : undefined
  if (!color && !opacity && blur === undefined) return endpoint
  try {
    const url = new URL(endpoint)
    if (color) url.searchParams.set('backdrop_color', color)
    if (opacity) url.searchParams.set('backdrop_opacity', opacity)
    if (blur !== undefined) url.searchParams.set('backdrop_blur', String(blur))
    return url.toString()
  } catch {
    return endpoint
  }
}

function parseHex(hex?: string): [number, number, number] | null {
  if (typeof hex !== 'string') return null
  const match = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(hex.trim())
  if (!match) return null
  const digits =
    match[1].length === 3 ? match[1].replace(/./g, (digit) => digit + digit) : match[1]
  return [
    Number.parseInt(digits.slice(0, 2), 16),
    Number.parseInt(digits.slice(2, 4), 16),
    Number.parseInt(digits.slice(4, 6), 16),
  ]
}

function parseDrawnColor(
  color?: string,
): { rgb: [number, number, number]; alpha: number } | null {
  if (typeof color !== 'string') return null
  const match =
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(\d+(?:\.\d+)?|\.\d+)\s*)?\)$/i.exec(
      color.trim(),
    )
  if (!match) return null
  const rgb: [number, number, number] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ]
  const alpha = match[4] === undefined ? 1 : Number(match[4])
  if (rgb.some((channel) => channel > 255) || !(alpha >= 0 && alpha <= 1)) return null
  return { rgb, alpha }
}

function presetRgb(color: CheckoutBackdropColor, brand?: string): [number, number, number] {
  if (color === 'light') return LIGHT_RGB
  if (color === 'brand') return parseHex(brand) ?? DARK_RGB
  return DARK_RGB
}

export function resolveCheckoutBackdrop(
  chosen?: CheckoutBackdrop,
  drawn?: DrawnCheckoutBackdrop,
): ResolvedCheckoutBackdrop {
  const drawnColor = parseDrawnColor(drawn?.color)
  const color = chosen?.color
  const opacity = chosen?.opacity
  const rgb = isBackdropColor(color)
    ? presetRgb(color, chosen?.brand)
    : (drawnColor?.rgb ?? DARK_RGB)
  const alpha = isBackdropOpacity(opacity)
    ? BACKDROP_ALPHA[opacity]
    : (drawnColor?.alpha ?? DEFAULT_ALPHA)
  let blur = false
  if (typeof chosen?.blur === 'boolean') blur = chosen.blur
  else if (typeof drawn?.blur === 'boolean') blur = drawn.blur
  return { color: `rgba(${rgb.join(', ')}, ${alpha})`, blur }
}

export function loaderCheckoutBackdrop(drawn?: DrawnCheckoutBackdrop): ResolvedCheckoutBackdrop {
  return resolveCheckoutBackdrop(published, drawn)
}

const DARK_INK = '#030712'
const LIGHT_INK = '#ffffff'

export function backdropInk(backdrop: ResolvedCheckoutBackdrop): string {
  const drawn = parseDrawnColor(backdrop.color)
  if (!drawn) return LIGHT_INK
  const [r, g, b] = drawn.rgb.map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? DARK_INK : LIGHT_INK
}

