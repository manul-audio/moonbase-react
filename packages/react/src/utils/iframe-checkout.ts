import {
  schemas,
  type CompletedOrder,
  type OpenOrder,
  type Order,
} from '@moonbase.sh/storefront-api'
import { z } from 'zod'
import {
  backdropInk,
  loaderCheckoutBackdrop,
  withCheckoutBackdrop,
  type DrawnCheckoutBackdrop,
} from './checkout-backdrop'
import { onPageRestore } from './page-restore'
import { withPriceFormat } from './price-format'
import { measureViewportHeight, trackViewportHeight } from './viewport-height'
import { computeScale } from './viewport-scale'

const closeEventSchema = z.object({
  source: z.literal('moonbase-checkout'),
  event: z.literal('close'),
  intent: z.string().optional(),
  completed: z.boolean(),
  order: z
    .unknown()
    .optional()
    .transform((order): Order | undefined => {
      const parsed = schemas.orders.orderSchema.safeParse(order)
      return parsed.success ? parsed.data : undefined
    }),
})

const billingDetailsUpdatedEventSchema = z.object({
  source: z.literal('moonbase-checkout'),
  event: z.literal('billing-details-updated'),
  order: schemas.orders.openOrderSchema,
})

const completedEventSchema = z.object({
  source: z.literal('moonbase-checkout'),
  event: z.literal('completed'),
  order: schemas.orders.completedOrderSchema,
})

const readyEventSchema = z.object({
  source: z.literal('moonbase-checkout'),
  event: z.literal('ready'),
})

const backdropEventSchema = z.object({
  source: z.literal('moonbase-checkout'),
  event: z.literal('backdrop'),
  visible: z.boolean().optional().catch(undefined),
  color: z.string().optional().catch(undefined),
  blur: z.boolean().optional().catch(undefined),
})

const checkoutPaymentFailureReasonSchema = z
  .enum(['Declined', 'AuthenticationFailed', 'CardDetails', 'ProcessingError', 'Other'])
  .catch('Other')

const checkoutPaymentFailureSchema = z.object({
  reason: checkoutPaymentFailureReasonSchema,
  paymentMethod: z.string().optional(),
})

const paymentStartedEventSchema = z.object({
  source: z.literal('moonbase-checkout'),
  event: z.literal('payment-started'),
  order: schemas.orders.openOrderSchema,
})

const paymentFailedEventSchema = z.object({
  source: z.literal('moonbase-checkout'),
  event: z.literal('payment-failed'),
  order: schemas.orders.openOrderSchema,
  error: checkoutPaymentFailureSchema,
})

const couponAppliedEventSchema = z.object({
  source: z.literal('moonbase-checkout'),
  event: z.literal('coupon-applied'),
  order: schemas.orders.openOrderSchema,
  code: z.string(),
})

const couponRemovedEventSchema = z.object({
  source: z.literal('moonbase-checkout'),
  event: z.literal('coupon-removed'),
  order: schemas.orders.openOrderSchema,
  code: z.string(),
})

const couponRejectedEventSchema = z.object({
  source: z.literal('moonbase-checkout'),
  event: z.literal('coupon-rejected'),
  code: z.string(),
  message: z.string().optional(),
})

const eventSchema = z.discriminatedUnion('event', [
  closeEventSchema,
  billingDetailsUpdatedEventSchema,
  completedEventSchema,
  readyEventSchema,
  backdropEventSchema,
  paymentStartedEventSchema,
  paymentFailedEventSchema,
  couponAppliedEventSchema,
  couponRemovedEventSchema,
  couponRejectedEventSchema,
])

export type CheckoutClosedEvent = z.infer<typeof closeEventSchema>
export type CheckoutBillingDetailsUpdatedEvent = z.infer<typeof billingDetailsUpdatedEventSchema>
export type CheckoutCompletedEvent = z.infer<typeof completedEventSchema>
export type CheckoutReadyEvent = z.infer<typeof readyEventSchema>
export type CheckoutBackdropEvent = z.infer<typeof backdropEventSchema>
export type CheckoutPaymentFailureReason = z.infer<typeof checkoutPaymentFailureReasonSchema>
export type CheckoutPaymentFailure = z.infer<typeof checkoutPaymentFailureSchema>
export type CheckoutPaymentStartedEvent = z.infer<typeof paymentStartedEventSchema>
export type CheckoutPaymentFailedEvent = z.infer<typeof paymentFailedEventSchema>
export type CheckoutCouponAppliedEvent = z.infer<typeof couponAppliedEventSchema>
export type CheckoutCouponRemovedEvent = z.infer<typeof couponRemovedEventSchema>
export type CheckoutCouponRejectedEvent = z.infer<typeof couponRejectedEventSchema>
export type CheckoutEvent = z.infer<typeof eventSchema>

const knownEvents = new Set<string>(eventSchema.options.map((option) => option.shape.event.value))

export function parseCheckoutMessage(data: unknown): CheckoutEvent | null {
  const parsed = eventSchema.safeParse(data)
  if (parsed.success) return parsed.data
  const message = data as { source?: unknown; event?: unknown } | null | undefined
  if (
    message?.source === 'moonbase-checkout' &&
    typeof message.event === 'string' &&
    knownEvents.has(message.event)
  ) {
    console.warn(
      '[Moonbase] Could not read a message from the checkout, so it was skipped:',
      data,
      parsed.error,
    )
  }
  return null
}

export function isTrustedCheckoutOrigin(eventOrigin: string, expectedEndpoint: string): boolean {
  if (!eventOrigin) return false
  try {
    return new URL(eventOrigin).origin === new URL(expectedEndpoint).origin
  } catch {
    return false
  }
}

export const checkoutWindowEvents: Record<string, string> = {
  'billing-details-updated': 'moonbase-checkout-billing-details-updated',
  completed: 'moonbase-checkout-completed',
  'payment-started': 'moonbase-checkout-payment-started',
  'payment-failed': 'moonbase-checkout-payment-failed',
  'coupon-applied': 'moonbase-checkout-coupon-applied',
  'coupon-removed': 'moonbase-checkout-coupon-removed',
  'coupon-rejected': 'moonbase-checkout-coupon-rejected',
}

const WRAPPER_ID = 'moonbase-checkout-wrapper'
const LOADER_ID = 'moonbase-checkout-loader'
const IFRAME_ID = 'moonbase-checkout'

let cancelRestoreTeardown: (() => void) | undefined
let stopHeightTracking: (() => void) | undefined
let drawnBackdrop: DrawnCheckoutBackdrop | undefined

function releaseWrapper(): void {
  stopHeightTracking?.()
  stopHeightTracking = undefined
  document.documentElement.style.removeProperty('overflow')
}

function spinnerSvg(ink: string): string {
  return `<svg width="48" height="48" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block" aria-label="Opening checkout" role="img">
  <circle cx="25" cy="25" r="20" stroke="${ink}" stroke-opacity="0.25" stroke-width="5" />
  <path d="M25 5 a20 20 0 0 1 20 20" stroke="${ink}" stroke-width="5" stroke-linecap="round">
    <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite" />
  </path>
</svg>`
}

const OVERLAY_FADE_MS = 300
const BACKDROP_BLUR = 'blur(8px)'

function setWrapperBlur(wrapper: HTMLElement, blur: boolean): void {
  if (!blur && !wrapper.hasAttribute('data-moonbase-blur')) return
  const value = blur ? BACKDROP_BLUR : 'none'
  const timing = blur ? '300ms ease-out' : '200ms ease-in'
  wrapper.style.setProperty(
    'transition',
    `backdrop-filter ${timing}, -webkit-backdrop-filter ${timing}`,
    'important',
  )
  wrapper.style.setProperty('-webkit-backdrop-filter', value, 'important')
  wrapper.style.setProperty('backdrop-filter', value, 'important')
  wrapper.toggleAttribute('data-moonbase-blur', blur)
}

function createWrapper(): HTMLDivElement {
  const wrapper = document.createElement('div')
  wrapper.id = WRAPPER_ID
  wrapper.style.zIndex = Number.MAX_SAFE_INTEGER.toString()
  wrapper.style.setProperty('position', 'fixed', 'important')
  wrapper.style.setProperty('top', '0px', 'important')
  wrapper.style.setProperty('left', '0px', 'important')
  wrapper.style.setProperty('width', '100vw', 'important')
  wrapper.style.setProperty('height', '100vh', 'important')
  wrapper.style.setProperty('height', '100dvh', 'important')
  wrapper.style.setProperty('max-width', 'none', 'important')
  wrapper.style.setProperty('max-height', 'none', 'important')
  wrapper.style.setProperty('min-width', '0', 'important')
  wrapper.style.setProperty('min-height', '0', 'important')
  wrapper.style.setProperty('overflow', 'hidden', 'important')
  document.body.append(wrapper)
  document.documentElement.style.overflow = 'hidden'
  stopHeightTracking?.()
  stopHeightTracking = trackViewportHeight(wrapper)
  return wrapper
}

export function showCheckoutLoader(): void {
  if (typeof window === 'undefined') return
  if (document.getElementById(WRAPPER_ID)) return
  const wrapper = createWrapper()
  const backdrop = loaderCheckoutBackdrop(drawnBackdrop)
  const loader = document.createElement('div')
  loader.id = LOADER_ID
  loader.style.setProperty('position', 'absolute', 'important')
  loader.style.setProperty('inset', '0', 'important')
  loader.style.setProperty('z-index', '1', 'important')
  loader.style.setProperty('display', 'flex', 'important')
  loader.style.setProperty('align-items', 'center', 'important')
  loader.style.setProperty('justify-content', 'center', 'important')
  loader.style.setProperty('background-color', backdrop.color, 'important')
  loader.style.setProperty('opacity', '0', 'important')
  loader.style.setProperty('transition', `opacity ${OVERLAY_FADE_MS}ms ease-out`, 'important')
  loader.innerHTML = spinnerSvg(backdropInk(backdrop))
  wrapper.append(loader)
  loader.getBoundingClientRect()
  loader.style.setProperty('opacity', '1', 'important')
  if (backdrop.blur) setWrapperBlur(wrapper, true)
  cancelRestoreTeardown = onPageRestore(hideCheckoutLoader)
}

export function hideCheckoutLoader(): void {
  if (typeof window === 'undefined') return
  cancelRestoreTeardown?.()
  cancelRestoreTeardown = undefined
  document.getElementById(LOADER_ID)?.remove()
  if (!document.getElementById(IFRAME_ID)) {
    document.getElementById(WRAPPER_ID)?.remove()
    releaseWrapper()
  }
}

export function closeCheckout(): void {
  const iframe = document.getElementById(IFRAME_ID)
  if (iframe instanceof HTMLIFrameElement && iframe.contentWindow) {
    iframe.contentWindow.postMessage('close', '*')
  }
  const wrapper = document.getElementById(WRAPPER_ID)
  if (wrapper) {
    wrapper.remove()
    releaseWrapper()
    if (activeMessageListener) {
      window.removeEventListener('message', activeMessageListener)
      activeMessageListener = null
    }
    window.dispatchEvent(
      new CustomEvent('moonbase-checkout-closed', {
        detail: { source: 'moonbase-checkout', event: 'close', completed: false },
      }),
    )
  }
}

let activeMessageListener: ((e: MessageEvent) => void) | null = null

export function mountCheckout(endpoint: string): void {
  if (typeof window === 'undefined') {
    console.warn('Can not mount checkout server side')
    return
  }
  if (document.getElementById(IFRAME_ID)) return
  const colorScheme = document.head
    .querySelector('meta[name="color-scheme"]')
    ?.getAttribute('content')
  if (colorScheme) {
    endpoint += `${endpoint.includes('?') ? '&' : '?'}color_scheme=${encodeURIComponent(colorScheme)}`
  }
  endpoint = withPriceFormat(endpoint)
  endpoint = withCheckoutBackdrop(endpoint)

  const wrapper = (document.getElementById(WRAPPER_ID) as HTMLDivElement | null) ?? createWrapper()
  const scaler = document.createElement('div')
  scaler.id = 'moonbase-checkout-scaler'
  scaler.style.setProperty('transform-origin', '0 0', 'important')
  scaler.style.setProperty('max-width', 'none', 'important')
  scaler.style.setProperty('max-height', 'none', 'important')

  const iframe = document.createElement('iframe')
  iframe.id = IFRAME_ID
  iframe.src = endpoint
  iframe.style.border = 'none'
  iframe.style.colorScheme = 'normal'
  iframe.style.backgroundColor = 'transparent'
  iframe.style.setProperty('width', '100%', 'important')
  iframe.style.setProperty('height', '100%', 'important')
  iframe.style.setProperty('max-width', 'none', 'important')
  iframe.style.setProperty('max-height', 'none', 'important')
  iframe.setAttribute('background', 'transparent')
  iframe.setAttribute('frameborder', '0')
  iframe.setAttribute('allowtransparency', 'true')
  iframe.setAttribute('allow', 'payment')

  const applyScale = () => {
    const scale = computeScale()
    if (scale === null) {
      scaler.style.removeProperty('transform')
      scaler.style.setProperty('width', '100%', 'important')
      scaler.style.setProperty('height', '100%', 'important')
      wrapper.removeAttribute('data-moonbase-scale')
      return
    }
    const height = measureViewportHeight() ?? window.innerHeight
    scaler.style.setProperty('transform', `scale(${scale})`, 'important')
    scaler.style.setProperty('width', `${window.innerWidth / scale}px`, 'important')
    scaler.style.setProperty('height', `${height / scale}px`, 'important')
    wrapper.setAttribute('data-moonbase-scale', String(scale))
  }

  applyScale()
  scaler.append(iframe)
  wrapper.append(scaler)
  document.documentElement.style.overflow = 'hidden'

  const headObserver = new MutationObserver(applyScale)
  headObserver.observe(document.head, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['content', 'name'],
  })
  window.addEventListener('resize', applyScale)
  window.addEventListener('orientationchange', applyScale)
  window.visualViewport?.addEventListener('resize', applyScale)

  const teardownScale = () => {
    headObserver.disconnect()
    window.removeEventListener('resize', applyScale)
    window.removeEventListener('orientationchange', applyScale)
    window.visualViewport?.removeEventListener('resize', applyScale)
  }

  const loader = document.getElementById(LOADER_ID)
  let loaderRemoved = false
  let graceTimer: ReturnType<typeof setTimeout> | undefined
  let hardTimer: ReturnType<typeof setTimeout> | undefined

  const removeLoader = () => {
    if (loaderRemoved) return
    loaderRemoved = true
    if (graceTimer !== undefined) clearTimeout(graceTimer)
    if (hardTimer !== undefined) clearTimeout(hardTimer)
    if (!loader || !document.contains(loader)) return
    loader.style.setProperty('opacity', '0', 'important')
    setTimeout(() => {
      if (document.contains(loader)) loader.remove()
    }, OVERLAY_FADE_MS)
  }

  if (loader) {
    iframe.addEventListener(
      'load',
      () => {
        if (!loaderRemoved) graceTimer = setTimeout(removeLoader, 500)
      },
      { once: true },
    )
    hardTimer = setTimeout(removeLoader, 10_000)
  }

  if (activeMessageListener) {
    window.removeEventListener('message', activeMessageListener)
  }

  const handleMessage = (e: MessageEvent) => {
    if (e.source !== iframe.contentWindow) return
    if (!isTrustedCheckoutOrigin(e.origin, endpoint)) return
    const evnt = parseCheckoutMessage(e.data)
    if (!evnt) return
    if (evnt.event === 'ready') {
      removeLoader()
    }
    if (evnt.event === 'backdrop') {
      drawnBackdrop = {
        color: evnt.color ?? drawnBackdrop?.color,
        blur: evnt.blur ?? drawnBackdrop?.blur,
      }
      if (document.body.contains(wrapper)) {
        setWrapperBlur(wrapper, evnt.visible === true && evnt.blur === true)
      }
    }
    if (evnt.event === 'close') {
      removeLoader()
      if (document.body.contains(wrapper)) {
        teardownScale()
        releaseWrapper()
        document.body.removeChild(wrapper)
      }
      window.removeEventListener('message', handleMessage)
      if (activeMessageListener === handleMessage) activeMessageListener = null
      window.dispatchEvent(
        new CustomEvent('moonbase-checkout-closed', {
          detail: evnt,
        }),
      )
    }
    const windowEventName = checkoutWindowEvents[evnt.event]
    if (windowEventName) {
      window.dispatchEvent(
        new CustomEvent(windowEventName, {
          detail: evnt,
        }),
      )
    }
  }

  activeMessageListener = handleMessage
  window.addEventListener('message', handleMessage)
}

