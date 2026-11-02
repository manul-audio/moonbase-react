import {
  ActivationRequestStatus,
  NotAuthenticatedError,
  type ActivationRequest,
} from '@moonbase.sh/storefront-api'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { StorefrontContext } from '../context'
import { useStorefrontContext } from '../provider'

export interface ActivationRequestComposable {
  activationRequest: ActivationRequest | null
  loading: boolean
  fulfilling: boolean
  completing: boolean
  error: string | null
  isInstalled: boolean
  fulfillLicense: () => Promise<void>
  fulfillTrial: (newsletterOptIn?: boolean) => Promise<void>
  cancel: () => Promise<void>
}

export function useActivationRequest(
  token: string | null | undefined,
  context?: StorefrontContext,
): ActivationRequestComposable {
  const storefront = useStorefrontContext(context)
  const currentUser = useStore(storefront.store, (s) => s.currentUser)

  const [activationRequest, setActivationRequest] =
    useState<ActivationRequest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [fulfilling, setFulfilling] = useState<boolean>(false)
  const [completing, setCompleting] = useState<boolean>(false)

  const activationRef = useRef<ActivationRequest | null>(null)
  activationRef.current = activationRequest
  const completionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const clearTimer = useCallback(() => {
    if (completionTimeoutRef.current !== null) {
      clearTimeout(completionTimeoutRef.current)
      completionTimeoutRef.current = null
    }
  }, [])

  const checkCompletion = useCallback(
    async (targetRequest?: ActivationRequest | null) => {
      const active = targetRequest ?? activationRef.current
      if (!active || !mountedRef.current) return
      const completed = await storefront.client.activationRequests.isCompleted(
        active.id,
      )
      if (!mountedRef.current) return
      if (completed) {
        const updated: ActivationRequest = {
          ...active,
          status: ActivationRequestStatus.Completed,
        }
        activationRef.current = updated
        setActivationRequest(updated)
        setCompleting(false)
      } else {
        completionTimeoutRef.current = setTimeout(() => {
          void checkCompletion(active)
        }, 1500)
      }
    },
    [storefront, clearTimer],
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearTimer()
    }
  }, [clearTimer])

  useEffect(() => {
    let cancelled = false
    const loadRequest = async () => {
      try {
        if (token && token.length > 0) {
          const req = await storefront.client.activationRequests.get(token)
          if (cancelled) return
          activationRef.current = req
          setActivationRequest(req)
          if (req.status === ActivationRequestStatus.Fulfilled) {
            setCompleting(true)
            void checkCompletion(req)
          }
          setLoading(false)
        } else {
          console.warn('No token given to `useActivationRequest`')
          setLoading(false)
        }
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      }
    }
    void loadRequest()
    return () => {
      cancelled = true
    }
  }, [token, storefront, checkCompletion])

  useEffect(() => {
    if (!token || activationRef.current?.licenseEligibility?.eligible) return
    let cancelled = false
    const reloadForUser = async () => {
      setLoading(true)
      try {
        const req = await storefront.client.activationRequests.get(token)
        if (cancelled) return
        activationRef.current = req
        setActivationRequest(req)
        if (req.status === ActivationRequestStatus.Fulfilled) {
          setCompleting(true)
          void checkCompletion(req)
        }
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void reloadForUser()
    return () => {
      cancelled = true
    }
  }, [currentUser, token, storefront, checkCompletion])

  const fulfillLicense = useCallback(async () => {
    const active = activationRef.current
    if (!active) return
    setFulfilling(true)
    const updated = await storefront.client.activationRequests.fulfillLicense(
      active.id,
    )
    activationRef.current = updated
    setActivationRequest(updated)
    setFulfilling(false)
    setCompleting(true)
    await checkCompletion(updated)
  }, [storefront, checkCompletion])

  const fulfillTrial = useCallback(
    async (newsletterOptIn = false) => {
      const active = activationRef.current
      if (!active) return
      setFulfilling(true)
      try {
        const user = storefront.currentUser
        if (
          newsletterOptIn &&
          user &&
          !user.communicationPreferences.newsletterOptIn
        ) {
          const { user: updatedUser } = await storefront.client.identity.update(
            user.name,
            user.email,
            undefined,
            {
              ...user.communicationPreferences,
              newsletterOptIn: true,
            },
          )
          storefront.currentUser = updatedUser
        }
        const updated = await storefront.client.activationRequests.fulfillTrial(
          active.id,
        )
        activationRef.current = updated
        setActivationRequest(updated)
        setFulfilling(false)
        setCompleting(true)
        await checkCompletion(updated)
      } catch (err) {
        console.warn('Could not fulfill trial: ', err)
        if (err instanceof NotAuthenticatedError) {
          setError('You need to be signed in to do this')
        } else {
          setError(err instanceof Error ? err.message : String(err))
        }
        setFulfilling(false)
      }
    },
    [storefront, checkCompletion],
  )

  const cancel = useCallback(async () => {
    const active = activationRef.current
    if (!active || active.status === ActivationRequestStatus.Cancelled) return
    const updated = await storefront.client.activationRequests.cancel(active.id)
    activationRef.current = updated
    setActivationRequest(updated)
  }, [storefront])

  const isInstalled =
    activationRequest?.status === ActivationRequestStatus.Completed

  return {
    activationRequest,
    loading,
    fulfilling,
    completing,
    error,
    isInstalled,
    fulfillLicense,
    fulfillTrial,
    cancel,
  }
}
