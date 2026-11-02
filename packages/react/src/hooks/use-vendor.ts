import type { Vendor } from '@moonbase.sh/storefront-api'
import { useEffect } from 'react'
import { useStore } from 'zustand'
import type { StorefrontContext } from '../context'
import { useStorefrontContext } from '../provider'

export interface VendorComposable {
  vendor: Vendor | null
  loading: boolean
}

export function useVendor(context?: StorefrontContext): VendorComposable {
  const storefront = useStorefrontContext(context)
  const vendor = useStore(storefront.store, (s) => s.vendor)
  const loading = useStore(storefront.store, (s) => s.loadingVendor)

  useEffect(() => {
    const state = storefront.store.getState()
    if (state.vendor || state.loadingVendor) return
    storefront.store.setState({ loadingVendor: true })
    void storefront.client.vendor
      .get()
      .then((v) => {
        storefront.store.setState({ vendor: v })
      })
      .catch(() => undefined)
      .finally(() => {
        storefront.store.setState({ loadingVendor: false })
      })
  }, [storefront])

  return { vendor, loading }
}

