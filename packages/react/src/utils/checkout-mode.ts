export type CheckoutRedirectMode = 'auto' | 'always' | 'never'
export const CHECKOUT_MODE_OVERRIDE_PARAM = 'mb_checkout_mode'

export type CheckoutRedirectReason =
  | 'url-override'
  | 'explicit'
  | 'ua-client-hint'
  | 'user-agent'
  | 'no-navigator'

export interface CheckoutRedirectDecision {
  redirect: boolean
  mode: CheckoutRedirectMode
  reason: CheckoutRedirectReason
  overridden: boolean
  userAgent?: string
}

function normalize(redirect: boolean | CheckoutRedirectMode): CheckoutRedirectMode {
  if (redirect === true) return 'always'
  if (redirect === false) return 'never'
  return redirect
}

function readOverride(): CheckoutRedirectMode | null {
  if (typeof window === 'undefined' || !window.location) return null
  const raw = new URLSearchParams(window.location.search).get(CHECKOUT_MODE_OVERRIDE_PARAM)
  if (!raw) return null
  switch (raw.toLowerCase()) {
    case 'auto':
      return 'auto'
    case 'always':
    case 'redirect':
    case 'true':
      return 'always'
    case 'never':
    case 'overlay':
    case 'false':
      return 'never'
    default:
      return null
  }
}

function detectMobile(): {
  mobile: boolean
  reason: 'no-navigator' | 'ua-client-hint' | 'user-agent'
  userAgent?: string
} {
  if (typeof navigator === 'undefined') {
    return { mobile: false, reason: 'no-navigator' }
  }
  const userAgent = navigator.userAgent
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
  if (typeof uaData?.mobile === 'boolean') {
    return { mobile: uaData.mobile, reason: 'ua-client-hint', userAgent }
  }
  const mobile =
    /iPhone|iPod/.test(userAgent) || (/Android/.test(userAgent) && /Mobile/.test(userAgent))
  return { mobile, reason: 'user-agent', userAgent }
}

export function isMobileDevice(): boolean {
  return detectMobile().mobile
}

export function resolveCheckoutRedirect(
  redirect: boolean | CheckoutRedirectMode = 'auto',
): CheckoutRedirectDecision {
  const override = readOverride()
  const mode = override ?? normalize(redirect)
  const overridden = override !== null
  if (mode !== 'auto') {
    return {
      redirect: mode === 'always',
      mode,
      reason: overridden ? 'url-override' : 'explicit',
      overridden,
    }
  }
  const detected = detectMobile()
  return {
    redirect: detected.mobile,
    mode,
    reason: detected.reason,
    overridden,
    userAgent: detected.userAgent,
  }
}

export function resolveRedirect(redirect: boolean | CheckoutRedirectMode = 'auto'): boolean {
  return resolveCheckoutRedirect(redirect).redirect
}

