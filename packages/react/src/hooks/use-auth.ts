import {
  schemas,
  type Address,
  type CommunicationPreferences,
  type ConnectableAccountProvider,
  type SignUpOptions,
  type SignUpResult,
  type User,
} from '@moonbase.sh/storefront-api'
import { useCallback } from 'react'
import { useStore } from 'zustand'
import type { StorefrontContext } from '../context'
import { useStorefrontContext } from '../provider'
import { forgetPurchase } from '../utils/direct-purchase'

export function useAuth(context?: StorefrontContext) {
  const storefront = useStorefrontContext(context)
  const user: User | null = useStore(storefront.store, (s) => s.currentUser)
  const loaded: boolean = useStore(storefront.store, (s) => s.loadedUser)

  const signIn = useCallback(
    async (email: string, password: string) => {
      const signedInUser = await storefront.client.identity.signIn(email, password)
      storefront.currentUser = signedInUser
      void storefront.updateStorefront()
      return signedInUser
    },
    [storefront],
  )

  const signUp = useCallback(
    async (
      name: string,
      email: string,
      password: string,
      address: Address | null | undefined,
      acceptedPrivacyPolicy: boolean,
      acceptedTermsAndConditions: boolean,
      communicationOptIn?: boolean,
      options?: SignUpOptions,
    ): Promise<SignUpResult> => {
      const result = await storefront.client.identity.signUp(
        name,
        email,
        password,
        address,
        acceptedPrivacyPolicy,
        acceptedTermsAndConditions,
        communicationOptIn,
        {
          ...options,
          utm:
            options?.utm ??
            (storefront.hasUtmOrReferrer ? storefront.utm : undefined),
        },
      )
      if (result.status === 'signed-in') {
        storefront.currentUser = result.user
        void storefront.updateStorefront()
      }
      return result
    },
    [storefront],
  )

  const signOut = useCallback(async () => {
    const revoked = storefront.client.identity.signOut()
    storefront.currentUser = null
    storefront.resetOrder({ keepItems: true })
    forgetPurchase()
    await storefront.updateStorefront()
    await revoked
  }, [storefront])

  const getAccessToken = useCallback(async () => {
    return await storefront.client.tokenStore.getAccessToken()
  }, [storefront])

  const update = useCallback(
    async (
      name: string | null,
      email: string,
      emailConfirmationToken?: string,
      communicationPreferences?: CommunicationPreferences,
    ) => {
      const result = await storefront.client.identity.update(
        name,
        email,
        emailConfirmationToken,
        communicationPreferences,
      )
      if (storefront.currentUser) {
        storefront.currentUser = result.user
      }
      return result
    },
    [storefront],
  )

  const setPassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await storefront.client.identity.setPassword(currentPassword, newPassword)
    },
    [storefront],
  )

  const forgotPassword = useCallback(
    async (email: string) => {
      await storefront.client.identity.forgotPassword(email)
    },
    [storefront],
  )

  const resetPassword = useCallback(
    async (email: string, newPassword: string, code: string) => {
      await storefront.client.identity.resetPassword(email, newPassword, code)
    },
    [storefront],
  )

  const confirmAccount = useCallback(
    async (email: string, code: string) => {
      const result = await storefront.client.identity.confirmAccount(email, code)
      if (result.status === 'SignedIn') {
        storefront.currentUser = schemas.identity.userSchema.parse(
          storefront.client.tokenStore.user,
        )
        void storefront.updateStorefront()
      }
      return result
    },
    [storefront],
  )

  const confirmEmail = useCallback(
    async (email: string, code: string) => {
      return await storefront.client.identity.confirmEmail(email, code)
    },
    [storefront],
  )

  const confirmEmailChange = useCallback(
    async (email: string, code: string) => {
      await storefront.client.identity.confirmEmailChange(email, code)
      return await storefront.updateUser()
    },
    [storefront],
  )

  const getConnectionUrl = useCallback(
    async (
      provider: ConnectableAccountProvider,
      redirectUri: string,
      loginId?: string,
    ) => {
      return await storefront.client.identity.getConnectionUrl(
        provider,
        redirectUri,
        loginId,
      )
    },
    [storefront],
  )

  const disconnectAccount = useCallback(
    async (provider: ConnectableAccountProvider) => {
      await storefront.client.identity.disconnectAccount(provider)
      return await storefront.updateUser()
    },
    [storefront],
  )

  const refreshUser = useCallback(async () => {
    return await storefront.updateUser()
  }, [storefront])

  return {
    user,
    loaded,
    loadedPromise: storefront.loadedUserPromise,
    signIn,
    signUp,
    signOut,
    getAccessToken,
    update,
    setPassword,
    forgotPassword,
    resetPassword,
    confirmAccount,
    confirmEmail,
    confirmEmailChange,
    getConnectionUrl,
    disconnectAccount,
    refreshUser,
  }
}

