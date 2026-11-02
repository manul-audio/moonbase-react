import type {
  CommunicationPreferencesInput,
  SubscribeInput,
} from '@moonbase.sh/storefront-api'
import { useCallback } from 'react'
import type { StorefrontContext } from '../context'
import { useStorefrontContext } from '../provider'

export function useCommunicationPreferences(context?: StorefrontContext) {
  const storefront = useStorefrontContext(context)

  const subscribe = useCallback(
    (input: SubscribeInput) => storefront.client.communications.subscribe(input),
    [storefront],
  )

  const confirm = useCallback(
    (email: string, token: string) =>
      storefront.client.communications.confirm(email, token),
    [storefront],
  )

  const get = useCallback(
    (email: string, token: string) =>
      storefront.client.communications.getPreferences(email, token),
    [storefront],
  )

  const update = useCallback(
    (
      email: string,
      token: string,
      preferences: CommunicationPreferencesInput,
    ) =>
      storefront.client.communications.updatePreferences(
        email,
        token,
        preferences,
      ),
    [storefront],
  )

  const unsubscribe = useCallback(
    (email: string, token: string) =>
      storefront.client.communications.unsubscribe(email, token),
    [storefront],
  )

  return {
    subscribe,
    confirm,
    get,
    update,
    unsubscribe,
  }
}

