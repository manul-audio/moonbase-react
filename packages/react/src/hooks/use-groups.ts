import { useCallback } from 'react'
import type { StorefrontContext } from '../context'
import { useStorefrontContext } from '../provider'

export function useGroups(context?: StorefrontContext) {
  const storefront = useStorefrontContext(context)

  const join = useCallback(
    (groupId: string) => storefront.client.groups.join(groupId),
    [storefront],
  )

  return { join }
}
