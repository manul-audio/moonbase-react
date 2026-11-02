import { z } from 'zod'
import { withCheckoutBackdrop } from './checkout-backdrop'
import { isTrustedCheckoutOrigin } from './iframe-checkout'
import { trackViewportHeight } from './viewport-height'

const closeEventSchema = z.object({
  source: z.literal('moonbase-subscription'),
  event: z.literal('close'),
  completed: z.boolean(),
})

const updatedPaymentMethodSchema = z.object({
  source: z.literal('moonbase-subscription'),
  event: z.literal('updated-payment-method'),
})

const eventSchema = z.discriminatedUnion('event', [closeEventSchema, updatedPaymentMethodSchema])

export function mountSubscription(endpoint: string): void {
  if (typeof window === 'undefined') {
    console.warn('Can not mount subscription server side')
    return
  }
  if (document.getElementById('moonbase-subscription')) return

  const iframe = document.createElement('iframe')
  iframe.id = 'moonbase-subscription'
  iframe.src = withCheckoutBackdrop(endpoint)
  iframe.style.position = 'fixed'
  iframe.style.top = '0px'
  iframe.style.left = '0px'
  iframe.style.right = '0px'
  iframe.style.border = 'none'
  iframe.style.colorScheme = 'normal'
  iframe.style.backgroundColor = 'transparent'
  iframe.style.zIndex = Number.MAX_SAFE_INTEGER.toString()
  iframe.setAttribute('background', 'transparent')
  iframe.setAttribute('frameborder', '0')
  iframe.setAttribute('allowtransparency', 'true')
  iframe.setAttribute('allow', 'payment')
  iframe.style.setProperty('height', '100vh', 'important')
  iframe.style.setProperty('height', '100dvh', 'important')
  iframe.width = '100%'

  document.body.append(iframe)
  document.documentElement.style.overflow = 'hidden'
  const stopHeightTracking = trackViewportHeight(iframe)

  const handleMessage = (e: MessageEvent) => {
    if (e.origin && !isTrustedCheckoutOrigin(e.origin, endpoint)) return
    try {
      const evnt = eventSchema.parse(e.data)
      if (evnt.event === 'close') {
        if (document.body.contains(iframe)) {
          stopHeightTracking()
          document.documentElement.style.removeProperty('overflow')
          document.body.removeChild(iframe)
        }
        window.removeEventListener('message', handleMessage)
        window.dispatchEvent(
          new CustomEvent('moonbase-subscription-closed', {
            detail: evnt,
          }),
        )
      }
    } catch (err) {
      if ((e.data as { source?: unknown } | null)?.source === 'moonbase-subscription') {
        console.error('Could not parse event:', e.data, err)
      }
    }
  }

  window.addEventListener('message', handleMessage)
  window.onmessage = handleMessage
}
