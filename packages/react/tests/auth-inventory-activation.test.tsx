import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActivationRequestStatus, NotFoundError } from '@moonbase.sh/storefront-api'
import { createStorefront } from '../src/context'
import { StorefrontProvider } from '../src/provider'
import { useAuth } from '../src/hooks/use-auth'
import { useActivationRequest } from '../src/hooks/use-activation-request'
import { useVoucher } from '../src/hooks/use-voucher'
import { useCommunicationPreferences } from '../src/hooks/use-communication-preferences'
import { useGroups } from '../src/hooks/use-groups'
import { useInventory } from '../src/hooks/use-inventory'

describe('useAuth, useActivationRequest, useVoucher, useCommunicationPreferences, useGroups, useInventory', () => {
  it('signs in via useAuth, updates currentUser, and refreshes storefront', async () => {
    const sf = createStorefront('https://demo.moonbase.sh')
    vi.spyOn(sf, 'updateStorefront').mockResolvedValue(sf.storefront)
    vi.spyOn(sf, 'updateUser').mockResolvedValue(null)
    const mockUser = { id: 'u1', email: 'dev@manul.audio', name: 'Dev', tenantId: 't1' } as any
    vi.spyOn(sf.client.identity, 'signIn').mockResolvedValueOnce(mockUser)
    const updateSfSpy = vi.spyOn(sf, 'updateStorefront').mockResolvedValue({} as any)

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <StorefrontProvider storefront={sf}>{children}</StorefrontProvider>
    )
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.signIn('dev@manul.audio', 'secret')
    })

    expect(result.current.user?.email).toBe('dev@manul.audio')
    expect(updateSfSpy).toHaveBeenCalled()
  })

  it('resolves activation request token and provisions trial via fulfillTrial + isCompleted polling', async () => {
    const sf = createStorefront('https://demo.moonbase.sh')
    vi.spyOn(sf, 'updateStorefront').mockResolvedValue(sf.storefront)
    const mockUser = {
      id: 'u1',
      email: 'dev@manul.audio',
      name: 'Dev',
      tenantId: 't1',
      communicationPreferences: { newsletterOptIn: false, productUpdatesOptIn: false },
    } as any
    vi.spyOn(sf, 'updateUser').mockResolvedValue(mockUser)
    sf.store.setState({
      currentUser: mockUser,
      loadedUser: true,
      loadedStorefront: true,
    })

    vi.spyOn(sf.client.activationRequests, 'get').mockResolvedValue({
      id: 'ar-1',
      status: ActivationRequestStatus.Requested,
      trialEligibility: { eligible: true, requiresNewsletterOptIn: true },
    } as any)
    const updateUserSpy = vi
      .spyOn(sf.client.identity, 'update')
      .mockResolvedValue({ user: { ...mockUser, communicationPreferences: { newsletterOptIn: true, productUpdatesOptIn: false } } } as any)
    const fulfillTrialSpy = vi
      .spyOn(sf.client.activationRequests, 'fulfillTrial')
      .mockResolvedValue({
        id: 'ar-1',
        status: ActivationRequestStatus.Fulfilled,
        trialEligibility: { eligible: false, requiresNewsletterOptIn: false },
      } as any)
    vi.spyOn(sf.client.activationRequests, 'isCompleted').mockResolvedValueOnce(true)

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <StorefrontProvider storefront={sf}>{children}</StorefrontProvider>
    )
    const { result } = renderHook(() => useActivationRequest('tok-123'), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activationRequest?.id).toBe('ar-1')

    await act(async () => {
      await result.current.fulfillTrial(true)
    })

    expect(updateUserSpy).toHaveBeenCalled()
    expect(fulfillTrialSpy).toHaveBeenCalledWith('ar-1')
    await waitFor(() => expect(result.current.isInstalled).toBe(true))
  })

  function activationHarness() {
    const sf = createStorefront('https://demo.moonbase.sh')
    vi.spyOn(sf, 'updateStorefront').mockResolvedValue(sf.storefront)
    vi.spyOn(sf, 'updateUser').mockResolvedValue(null)
    sf.store.setState({ loadedUser: true, loadedStorefront: true })
    vi.spyOn(sf.client.activationRequests, 'get').mockResolvedValue({
      id: 'ar-2',
      status: ActivationRequestStatus.Requested,
      licenseEligibility: { eligible: true },
      trialEligibility: { eligible: true, requiresNewsletterOptIn: false },
    } as any)
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <StorefrontProvider storefront={sf}>{children}</StorefrontProvider>
    )
    return { sf, wrapper }
  }

  it('fulfillLicense failure surfaces as error and resets fulfilling instead of rejecting', async () => {
    const { sf, wrapper } = activationHarness()
    vi.spyOn(sf.client.activationRequests, 'fulfillLicense').mockRejectedValue(
      new Error('No free seats'),
    )
    const { result } = renderHook(() => useActivationRequest('tok-456'), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await expect(result.current.fulfillLicense()).resolves.toBeUndefined()
    })

    expect(result.current.error).toBe('No free seats')
    expect(result.current.fulfilling).toBe(false)
    expect(result.current.completing).toBe(false)
    expect(result.current.activationRequest?.status).toBe(ActivationRequestStatus.Requested)
  })

  it('fulfillTrial failure surfaces as error and resets fulfilling', async () => {
    const { sf, wrapper } = activationHarness()
    vi.spyOn(sf.client.activationRequests, 'fulfillTrial').mockRejectedValue(
      new Error('Trial already used'),
    )
    const { result } = renderHook(() => useActivationRequest('tok-789'), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await expect(result.current.fulfillTrial(false)).resolves.toBeUndefined()
    })

    expect(result.current.error).toBe('Trial already used')
    expect(result.current.fulfilling).toBe(false)
    expect(result.current.completing).toBe(false)
  })

  it('redeems voucher and translates NotFoundError to "Voucher code invalid"', async () => {
    const sf = createStorefront('https://demo.moonbase.sh')
    sf.store.setState({ currentUser: { id: 'u1' } as any, loadedUser: true, loadedStorefront: true })
    vi.spyOn(sf.client.vouchers, 'redeem').mockResolvedValueOnce({ id: 'v1', code: 'FREE' } as any)
    vi.spyOn(sf.client.vouchers, 'peek').mockRejectedValueOnce(new NotFoundError('missing'))

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <StorefrontProvider storefront={sf}>{children}</StorefrontProvider>
    )
    const { result } = renderHook(() => useVoucher(), { wrapper })

    const redeemed = await result.current.redeem('FREE')
    expect(redeemed.code).toBe('FREE')
    await expect(result.current.peek('BAD')).rejects.toThrow('Voucher code invalid')
  })

  it('delegates communicationPreferences, groups, and inventory endpoints', async () => {
    const sf = createStorefront('https://demo.moonbase.sh')
    sf.store.setState({ currentUser: { id: 'u1' } as any, loadedUser: true, loadedStorefront: true })
    const subSpy = vi
      .spyOn(sf.client.communications, 'subscribe')
      .mockResolvedValueOnce({ status: 'subscribed' } as any)
    const joinSpy = vi.spyOn(sf.client.groups, 'join').mockResolvedValueOnce()
    const licensesSpy = vi
      .spyOn(sf.client.inventory.licenses, 'get')
      .mockResolvedValueOnce({ items: [], nextUrl: null } as any)

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <StorefrontProvider storefront={sf}>{children}</StorefrontProvider>
    )
    const { result: comm } = renderHook(() => useCommunicationPreferences(), { wrapper })
    const { result: groups } = renderHook(() => useGroups(), { wrapper })
    const { result: inv } = renderHook(() => useInventory(), { wrapper })

    await comm.current.subscribe({ email: 'a@b.c' })
    await groups.current.join('grp-1')
    await inv.current.getLicenses()

    expect(subSpy).toHaveBeenCalledWith({ email: 'a@b.c' })
    expect(joinSpy).toHaveBeenCalledWith('grp-1')
    expect(licensesSpy).toHaveBeenCalled()
  })
})
