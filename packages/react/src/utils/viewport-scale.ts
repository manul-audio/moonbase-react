const FALLBACK_DEVICE_WIDTH = 440
const COMPENSATION_THRESHOLD = 0.95
let disabled = false

export function setViewportCompensationDisabled(value: boolean): void {
  disabled = value
}

function getDeviceWidth(): number {
  if (
    typeof window !== 'undefined' &&
    window.screen &&
    Number.isFinite(window.screen.width) &&
    window.screen.width > 0
  ) {
    return window.screen.width
  }
  return FALLBACK_DEVICE_WIDTH
}

function parseDeclaredWidth(meta: HTMLMetaElement | null): number | null {
  if (!meta) return null
  const match = /width\s*=\s*(\d+)/i.exec(meta.content)
  if (!match) return null
  const width = Number.parseInt(match[1], 10)
  return Number.isFinite(width) ? width : null
}

function getActiveViewportMeta(): HTMLMetaElement | null {
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="viewport"]')
  return metas.length === 0 ? null : metas[metas.length - 1]
}

export function computeScale(): number | null {
  if (disabled) return null
  if (typeof document === 'undefined') return null
  const declared = parseDeclaredWidth(getActiveViewportMeta())
  if (declared === null) return null
  const deviceWidth = getDeviceWidth()
  if (declared >= deviceWidth * COMPENSATION_THRESHOLD) return null
  return declared / deviceWidth
}

