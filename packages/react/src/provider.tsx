import type { CompletedOrder } from '@moonbase.sh/storefront-api'
import React, { createContext, useContext, useEffect, useRef } from 'react'
import {
  createStorefront,
  type MoonbaseReactConfiguration,
  type StorefrontContext,
} from './context'
import type { StorefrontHydrationState } from './ssr'

export const storefrontKey = Symbol('storefront')

const StorefrontReactContext = createContext<StorefrontContext | null>(null)

export interface StorefrontProviderProps {
  /** Pass a pre-created StorefrontContext OR pass `endpoint` (+ optional `config`) */
  storefront?: StorefrontContext
  endpoint?: string
  config?: MoonbaseReactConfiguration
  /** Dehydrated state from SSR / RSC (`createServerStorefront` or `storefront.dehydrate()`) */
  initialState?: StorefrontHydrationState
  /** Optional checkout completion listener registered on mount */
  onCheckoutCompleted?: (order: CompletedOrder) => void
  children: React.ReactNode
}

export function StorefrontProvider({
  storefront: externalStorefront,
  endpoint,
  config,
  initialState,
  onCheckoutCompleted,
  children,
}: StorefrontProviderProps) {
  const ref = useRef<StorefrontContext | null>(null)
  const hydratedRef = useRef(false)

  if (!ref.current) {
    if (externalStorefront) {
      ref.current = externalStorefront
    } else if (endpoint) {
      ref.current = createStorefront(endpoint, config)
    } else {
      throw new Error(
        'StorefrontProvider requires either a `storefront` instance or an `endpoint` URL.',
      )
    }
  }

  if (initialState && !hydratedRef.current) {
    ref.current.hydrate(initialState)
    hydratedRef.current = true
  }

  const instance = ref.current

  useEffect(() => {
    const cleanupBoot = instance.bootBrowser()
    return () => {
      cleanupBoot()
    }
  }, [instance])

  useEffect(() => {
    if (!onCheckoutCompleted) return
    return instance.onCheckoutCompleted(onCheckoutCompleted)
  }, [instance, onCheckoutCompleted])

  return (
    <StorefrontReactContext.Provider value={instance}>
      {children}
    </StorefrontReactContext.Provider>
  )
}

export function useStorefrontContext(override?: StorefrontContext): StorefrontContext {
  const ctx = useContext(StorefrontReactContext)
  const resolved = override ?? ctx
  if (!resolved) {
    throw new Error('No storefront configured')
  }
  return resolved
}

