import { NotFoundError } from '@moonbase.sh/storefront-api'
import { useCallback } from 'react'
import type { StorefrontContext } from '../context'
import { useStorefrontContext } from '../provider'

export function useVoucher(context?: StorefrontContext) {
  const storefront = useStorefrontContext(context)

  const peek = useCallback(
    async (code: string) => {
      try {
        return await storefront.client.vouchers.peek(code)
      } catch (e) {
        if (e instanceof NotFoundError) throw new Error('Voucher code invalid')
        throw e
      }
    },
    [storefront],
  )

  const redeem = useCallback(
    async (code: string) => {
      try {
        const result = await storefront.client.vouchers.redeem(code)
        void storefront.updateStorefront()
        return result
      } catch (e) {
        if (e instanceof NotFoundError) throw new Error('Voucher code invalid')
        throw e
      }
    },
    [storefront],
  )

  return { peek, redeem }
}
