import {
  adClicksOf,
  CartUtils,
  InMemoryStore,
  MoonbaseClient,
  NotAuthenticatedError,
  NotAuthorizedError,
  NotFoundError,
  OfferUtils,
  OrderStatus,
  parseOffSiteReferrer,
  resolveUtm,
  schemas,
  StoreClosedError,
  TokenStore,
  withoutClickIds,
  type CompletedOrder,
  type LineItem,
  type Money,
  type MoonbaseConfiguration,
  type OfferConditionContext,
  type OpenOrder,
  type Order,
  type Storefront,
  type UrchinTrackingModule,
  type User,
  type Vendor,
} from '@moonbase.sh/storefront-api'
import { v4 as uuidv4 } from 'uuid'
import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  SplitBrowserStore,
  SSR_AUTH_COOKIE_DEFAULT,
  type StorefrontHydrationState,
} from './ssr'
import { resolveDisplayCurrency } from './utils/currency'
import { debounce } from './utils/debounce'
import { forgetPurchase, pruneRememberedPurchase } from './utils/direct-purchase'
import {
  closeCheckout,
  mountCheckout,
  type CheckoutPaymentFailure,
} from './utils/iframe-checkout'
import { mountSubscription } from './utils/iframe-subscription'
import { withoutHandshakeParams } from './utils/return-url'
import { readStorage, removeStorage, writeStorage } from './utils/safe-storage'

const SDK_VERSION = '0.1.0'

export interface MoonbaseReactConfiguration extends Omit<MoonbaseConfiguration, 'endpoint'> {
  autoApplyItemOffers?: boolean
  ssrAuthCookie?: string | false
}

export interface StorefrontState {
  storefront: Storefront
  loadedStorefront: boolean
  closed: boolean
  currentOrder: Order
  currentUser: User | null
  loadedUser: boolean
  utm: UrchinTrackingModule | undefined
  autoApplyItemOffers: boolean
  vendor: Vendor | null
  loadingVendor: boolean
}

export function createEmptyStorefront(): Storefront {
  return {
    suggestedCurrency: '',
    enabledCurrencies: [],
    bundles: [],
    products: [],
    offers: [],
    promotions: [],
  }
}

export type OpenCartOrder = Extract<Order, { status: OrderStatus.Open }>

export function createEmptyOpenOrder(currency = ''): OpenCartOrder {
  return {
    id: uuidv4(),
    status: OrderStatus.Open,
    currency,
    items: [],
    couponsApplied: [],
  }
}

export interface StorefrontContext {
  readonly configuration: MoonbaseConfiguration
  readonly client: MoonbaseClient
  readonly store: StoreApi<StorefrontState>
  storefront: Storefront
  loadedStorefront: boolean
  readonly loadedStorefrontPromise: Promise<void>
  closed: boolean
  currentOrder: Order
  currentUser: User | null
  loadedUser: boolean
  readonly loadedUserPromise: Promise<void>
  utm: UrchinTrackingModule | undefined
  readonly hasUtm: boolean
  readonly hasUtmOrReferrer: boolean
  autoApplyItemOffers: boolean
  setAutoApplyItemOffers: (enabled: boolean) => void
  setAttributionConsent: (granted: boolean) => void
  updateUser: () => Promise<User | null>
  updateStorefront: () => Promise<Storefront>
  pushOrderContent: () => Promise<void>
  resetOrder: (opts?: { keepItems?: boolean }) => void
  surrenderOrder: () => Promise<void>
  enrichLineItems: (lineItems: LineItem[], order?: Order) => LineItem[]
  offerConditionContext: (order?: Order) => OfferConditionContext
  reconcileCartOffer: () => boolean
  removeCartOffer: () => Promise<void>
  closeCheckout: () => void
  onCheckoutInitiated: (callback: (order: OpenOrder, total: Money) => void) => () => void
  onCheckoutBillingDetailsAdded: (callback: (order: OpenOrder) => void) => () => void
  onCheckoutPaymentStarted: (callback: (order: OpenOrder) => void) => () => void
  onCheckoutPaymentFailed: (
    callback: (order: OpenOrder, error: CheckoutPaymentFailure) => void,
  ) => () => void
  onCheckoutCouponApplied: (callback: (order: OpenOrder, code: string) => void) => () => void
  onCheckoutCouponRemoved: (callback: (order: OpenOrder, code: string) => void) => () => void
  onCheckoutCouponRejected: (
    callback: (code: string, message: string | undefined) => void,
  ) => () => void
  onCheckoutCompleted: (callback: (order: CompletedOrder) => void) => () => void
  onCheckoutClosed: (
    callback: (intent: string | undefined, completed: boolean, order: Order | undefined) => void,
  ) => () => void
  onStorefrontUpdated: (callback: (storefront: Storefront) => void) => () => void
  onSessionEnded: (callback: (user: User) => void) => () => void
  dehydrate: () => StorefrontHydrationState
  hydrate: (state: StorefrontHydrationState) => void
  bootBrowser: (options?: { skipInitialFetch?: boolean }) => () => void
}

function addWindowCustomListener<T>(
  eventName: string,
  handler: (detail: T) => void,
): () => void {
  if (typeof window === 'undefined') return () => {}
  const listener = (e: Event) => {
    handler((e as CustomEvent<T>).detail)
  }
  window.addEventListener(eventName, listener)
  return () => window.removeEventListener(eventName, listener)
}

export class StorefrontContextImpl implements StorefrontContext {
  static readonly userKey = 'moonbase_user'
  static readonly sessionKey = 'moonbase_session'
  static readonly storefrontKey = 'moonbase_storefront'
  static readonly utmKey = 'moonbase_utm'

  readonly configuration: MoonbaseConfiguration
  readonly client: MoonbaseClient
  readonly store: StoreApi<StorefrontState>

  private refreshOrderAbortController = new AbortController()
  private storefrontRefreshesStarted = 0
  private storefrontRefreshLanded = 0
  private attributionConsentSetting: boolean | undefined
  private storeAllowsAttribution: boolean | undefined
  private arrival: UrchinTrackingModule | undefined
  private browserCleanup: (() => void) | null = null
  private tokenStoreSessionEndedAttached = false
  private readonly debouncedPushOrderContent: ((order: OpenOrder) => Promise<void>) & {
    cancel: () => void
  }

  constructor(
    configuration: MoonbaseConfiguration,
    client: MoonbaseClient,
    options?: { autoApplyItemOffers?: boolean },
  ) {
    this.configuration = configuration
    this.client = client
    this.attributionConsentSetting = configuration.attributionConsent

    this.store = createStore<StorefrontState>(() => ({
      storefront: createEmptyStorefront(),
      loadedStorefront: false,
      closed: false,
      currentOrder: createEmptyOpenOrder(),
      currentUser: null,
      loadedUser: false,
      utm: undefined,
      autoApplyItemOffers: options?.autoApplyItemOffers ?? false,
      vendor: null,
      loadingVendor: false,
    }))

    this.debouncedPushOrderContent = debounce((order: OpenOrder) => {
      return this.client.orders.pushContent(
        order,
        undefined,
        this.hasUtmOrReferrer ? this.utm : undefined,
      )
    }, 500)
  }

  get storefront(): Storefront {
    return this.store.getState().storefront
  }
  set storefront(value: Storefront) {
    this.store.setState({ storefront: value })
  }

  get loadedStorefront(): boolean {
    return this.store.getState().loadedStorefront
  }
  set loadedStorefront(value: boolean) {
    this.store.setState({ loadedStorefront: value })
  }

  get closed(): boolean {
    return this.store.getState().closed
  }
  set closed(value: boolean) {
    this.store.setState({ closed: value })
  }

  get currentOrder(): Order {
    return this.store.getState().currentOrder
  }
  set currentOrder(value: Order) {
    this.store.setState({ currentOrder: value })
  }

  get currentUser(): User | null {
    return this.store.getState().currentUser
  }
  set currentUser(value: User | null) {
    this.store.setState({ currentUser: value })
  }

  get loadedUser(): boolean {
    return this.store.getState().loadedUser
  }
  set loadedUser(value: boolean) {
    this.store.setState({ loadedUser: value })
  }

  get utm(): UrchinTrackingModule | undefined {
    return this.store.getState().utm
  }
  set utm(value: UrchinTrackingModule | undefined) {
    this.store.setState({ utm: value })
  }

  get autoApplyItemOffers(): boolean {
    return this.store.getState().autoApplyItemOffers
  }
  set autoApplyItemOffers(value: boolean) {
    this.store.setState({ autoApplyItemOffers: value })
  }

  setAutoApplyItemOffers(enabled: boolean): void {
    this.store.setState({ autoApplyItemOffers: enabled })
  }

  get loadedStorefrontPromise(): Promise<void> {
    if (this.store.getState().loadedStorefront) return Promise.resolve()
    return new Promise((resolve) => {
      const unsub = this.store.subscribe((state) => {
        if (state.loadedStorefront) {
          unsub()
          resolve()
        }
      })
    })
  }

  get loadedUserPromise(): Promise<void> {
    if (this.store.getState().loadedUser) return Promise.resolve()
    return new Promise((resolve) => {
      const unsub = this.store.subscribe((state) => {
        if (state.loadedUser) {
          unsub()
          resolve()
        }
      })
    })
  }

  get hasUtm(): boolean {
    const u = this.utm
    return !!u && !!(u.source || u.medium || u.campaign || u.term || u.content)
  }

  get hasUtmOrReferrer(): boolean {
    const u = this.utm
    return !!u && Object.values(u).some((v) => (Array.isArray(v) ? v.length > 0 : !!v))
  }

  get attributionConsent(): boolean {
    return this.attributionConsentSetting ?? this.storeAllowsAttribution === true
  }

  dehydrate(): StorefrontHydrationState {
    const s = this.store.getState()
    return {
      storefront: s.loadedStorefront ? s.storefront : null,
      loadedStorefront: s.loadedStorefront,
      closed: s.closed,
      currentUser: s.currentUser,
      loadedUser: s.loadedUser,
      vendor: s.vendor,
    }
  }

  hydrate(state: StorefrontHydrationState): void {
    const current = this.store.getState()
    const nextStorefront = state.storefront ?? current.storefront
    const nextOrder = {
      ...current.currentOrder,
      currency: resolveDisplayCurrency(current.currentOrder, nextStorefront),
    }
    this.storeAllowsAttribution = nextStorefront.cookieConsentRequired === false
    this.store.setState({
      storefront: nextStorefront,
      loadedStorefront: state.loadedStorefront,
      closed: state.closed,
      currentUser: state.currentUser,
      loadedUser: state.loadedUser,
      currentOrder: nextOrder,
      vendor: state.vendor ?? current.vendor,
    })
    // Server rendering and React's hydration pass read the store through
    // useSyncExternalStore's server snapshot, which zustand serves from
    // getInitialState(), not getState(). Pin that snapshot to the hydrated
    // state so SSR output and the hydration render both see the catalog.
    const hydrated = this.store.getState()
    this.store.getInitialState = () => hydrated
  }

  bootBrowser(options?: { skipInitialFetch?: boolean }): () => void {
    if (typeof window === 'undefined') return () => {}
    if (this.browserCleanup) return this.browserCleanup

    const storageListener = (event: StorageEvent) => this.handleStorageUpdate(event)
    window.addEventListener('storage', storageListener)
    if (!this.tokenStoreSessionEndedAttached) {
      this.tokenStoreSessionEndedAttached = true
      this.client.tokenStore.onSessionEnded(() => this.endSession())
    }

    const urlParams = new URLSearchParams(window.location.search)
    const fresh: UrchinTrackingModule = {
      referrer: parseOffSiteReferrer(window.document.referrer, window.location.origin),
      source: urlParams.get('utm_source') || undefined,
      medium: urlParams.get('utm_medium') || undefined,
      campaign: urlParams.get('utm_campaign') || undefined,
      term: urlParams.get('utm_term') || undefined,
      content: urlParams.get('utm_content') || undefined,
      gclid: urlParams.get('gclid') || undefined,
      gbraid: urlParams.get('gbraid') || undefined,
      wbraid: urlParams.get('wbraid') || undefined,
      fbclid: urlParams.get('fbclid') || undefined,
      msclkid: urlParams.get('msclkid') || undefined,
      ttclid: urlParams.get('ttclid') || undefined,
    }
    fresh.adClicks = adClicksOf(fresh)

    const sessionRaw = readStorage(StorefrontContextImpl.utmKey, 'session')
    const sessionCached = StorefrontContextImpl.parseCachedUtm(sessionRaw)
    const cached =
      sessionCached ??
      (this.configuration.persistUtm && this.attributionConsent
        ? StorefrontContextImpl.parseCachedUtm(
            readStorage(StorefrontContextImpl.utmKey, 'local'),
          )
        : undefined)
    const full = resolveUtm(cached, fresh)
    this.arrival = full
    const resolved = this.consentedUtm(full)
    this.utm = resolved

    const refused = this.attributionConsentSetting === false
    if (
      this.hasUtmOrReferrer &&
      (full !== sessionCached || refused) &&
      JSON.stringify(resolved) !== sessionRaw
    ) {
      writeStorage(StorefrontContextImpl.utmKey, JSON.stringify(resolved), 'session')
    }
    if (this.configuration.persistUtm && this.attributionConsent && this.hasUtmOrReferrer) {
      writeStorage(StorefrontContextImpl.utmKey, JSON.stringify(resolved), 'local')
    } else if (this.configuration.persistUtm && refused) {
      removeStorage(StorefrontContextImpl.utmKey, 'local')
    }

    const cachedOrderJson = readStorage(StorefrontContextImpl.sessionKey)
    if (cachedOrderJson) {
      try {
        this.currentOrder = JSON.parse(cachedOrderJson)
        void this.refreshOrder()
      } catch {
        this.currentOrder = createEmptyOpenOrder(
          resolveDisplayCurrency(null, this.storefront),
        )
      }
    } else {
      this.currentOrder = createEmptyOpenOrder(
        resolveDisplayCurrency(null, this.storefront),
      )
      if (this.hasUtmOrReferrer && this.attributionConsent) {
        void this.pushOrderContent()
      }
    }

    pruneRememberedPurchase()

    if (!this.loadedStorefront) {
      const cachedStorefrontJson = readStorage(StorefrontContextImpl.storefrontKey)
      const cachedStorefront = cachedStorefrontJson
        ? StorefrontContextImpl.parseCachedStorefront(cachedStorefrontJson)
        : null
      if (cachedStorefront) {
        this.store.setState({
          storefront: cachedStorefront,
          loadedStorefront: true,
        })
      }
    }

    this.currentOrder = {
      ...this.currentOrder,
      currency: resolveDisplayCurrency(this.currentOrder, this.storefront),
    }

    if (!this.currentUser && this.client.tokenStore.user) {
      try {
        this.currentUser = schemas.identity.userSchema.parse(this.client.tokenStore.user)
      } catch (err) {
        console.warn('Could not read the stored Moonbase user, signing out', err)
        this.client.tokenStore.clear()
        this.currentUser = null
      }
    }

    if (!options?.skipInitialFetch) {
      if (!this.loadedStorefront) {
        void this.updateStorefront()
      }
      if (!this.loadedUser) {
        void this.updateUser()
      }
    }

    if (window.location) {
      const urlParams2 = new URLSearchParams(window.location.search)
      const intent = urlParams2.get('mb_intent')
      const endpoint = urlParams2.get('mb_endpoint')
      if (intent === 'checkout' && urlParams2.get('mb_complete') && endpoint) {
        const parameters = Object.fromEntries(
          [...urlParams2.entries()].filter(([key]) => !key.startsWith('mb_')),
        )
        const finalEndpoint = new URL(decodeURIComponent(endpoint))
        for (const prop of Object.keys(parameters)) {
          finalEndpoint.searchParams.append(prop, parameters[prop])
        }
        mountCheckout(finalEndpoint.toString())
        window.history.replaceState(null, '', withoutHandshakeParams(window.location.href))
      }
      if (intent === 'update_subscription' && urlParams2.get('mb_complete') && endpoint) {
        const parameters = Object.fromEntries(
          [...urlParams2.entries()].filter(([key]) => !key.startsWith('mb_')),
        )
        const finalEndpoint = new URL(decodeURIComponent(endpoint))
        for (const prop of Object.keys(parameters)) {
          finalEndpoint.searchParams.append(prop, parameters[prop])
        }
        mountSubscription(finalEndpoint.toString())
        window.history.replaceState(null, '', withoutHandshakeParams(window.location.href))
      }
    }

    const billingListener = () => {
      void this.updateStorefront()
      void this.updateUser()
    }
    const completedListener = (e: Event) => {
      const order = (e as CustomEvent<{ order: CompletedOrder }>).detail.order
      if (order.id === this.currentOrder.id) {
        this.resetOrder()
      }
      forgetPurchase(order.id)
      void this.updateStorefront()
      void this.updateUser()
    }

    window.addEventListener('moonbase-checkout-billing-details-updated', billingListener)
    window.addEventListener('moonbase-checkout-completed', completedListener)

    this.browserCleanup = () => {
      window.removeEventListener('storage', storageListener)
      window.removeEventListener('moonbase-checkout-billing-details-updated', billingListener)
      window.removeEventListener('moonbase-checkout-completed', completedListener)
      this.debouncedPushOrderContent.cancel()
      this.browserCleanup = null
    }

    return this.browserCleanup
  }

  closeCheckout(): void {
    closeCheckout()
  }

  onCheckoutInitiated(callback: (order: OpenOrder, total: Money) => void): () => void {
    return addWindowCustomListener<{ order: OpenOrder; total: Money }>(
      'moonbase-checkout-initiated',
      (d) => callback(d.order, d.total),
    )
  }

  onCheckoutBillingDetailsAdded(callback: (order: OpenOrder) => void): () => void {
    return addWindowCustomListener<{ order: OpenOrder }>(
      'moonbase-checkout-billing-details-updated',
      (d) => callback(d.order),
    )
  }

  onCheckoutPaymentStarted(callback: (order: OpenOrder) => void): () => void {
    return addWindowCustomListener<{ order: OpenOrder }>(
      'moonbase-checkout-payment-started',
      (d) => callback(d.order),
    )
  }

  onCheckoutPaymentFailed(
    callback: (order: OpenOrder, error: CheckoutPaymentFailure) => void,
  ): () => void {
    return addWindowCustomListener<{ order: OpenOrder; error: CheckoutPaymentFailure }>(
      'moonbase-checkout-payment-failed',
      (d) => callback(d.order, d.error),
    )
  }

  onCheckoutCouponApplied(
    callback: (order: OpenOrder, code: string) => void,
  ): () => void {
    return addWindowCustomListener<{ order: OpenOrder; code: string }>(
      'moonbase-checkout-coupon-applied',
      (d) => callback(d.order, d.code),
    )
  }

  onCheckoutCouponRemoved(
    callback: (order: OpenOrder, code: string) => void,
  ): () => void {
    return addWindowCustomListener<{ order: OpenOrder; code: string }>(
      'moonbase-checkout-coupon-removed',
      (d) => callback(d.order, d.code),
    )
  }

  onCheckoutCouponRejected(
    callback: (code: string, message: string | undefined) => void,
  ): () => void {
    return addWindowCustomListener<{ code: string; message?: string }>(
      'moonbase-checkout-coupon-rejected',
      (d) => callback(d.code, d.message),
    )
  }

  onCheckoutCompleted(callback: (order: CompletedOrder) => void): () => void {
    return addWindowCustomListener<{ order: CompletedOrder }>(
      'moonbase-checkout-completed',
      (d) => callback(d.order),
    )
  }

  onCheckoutClosed(
    callback: (intent: string | undefined, completed: boolean, order: Order | undefined) => void,
  ): () => void {
    return addWindowCustomListener<{
      intent?: string
      completed?: boolean
      order?: Order
    }>('moonbase-checkout-closed', (d) =>
      callback(d.intent, d.completed === true, d.order),
    )
  }

  onStorefrontUpdated(callback: (storefront: Storefront) => void): () => void {
    return addWindowCustomListener<{ storefront: Storefront }>(
      'moonbase-storefront-updated',
      (d) => callback(d.storefront),
    )
  }

  onSessionEnded(callback: (user: User) => void): () => void {
    return addWindowCustomListener<{ user: User }>('moonbase-session-ended', (d) =>
      callback(d.user),
    )
  }

  private endSession(): void {
    const user = this.currentUser
    if (!user) return
    this.resetOrder({ keepItems: true })
    forgetPurchase()
    this.currentUser = null
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('moonbase-session-ended', { detail: { user } }))
    }
    void this.updateStorefront()
  }

  async updateUser(): Promise<User | null> {
    const requested = this.client.tokenStore.user
    try {
      const user = await this.client.identity.get()
      this.store.setState({ currentUser: user, loadedUser: true })
      return user
    } catch (err) {
      const stored = this.client.tokenStore.user
      if (stored !== null && stored !== requested) {
        this.store.setState({ loadedUser: true })
        return this.currentUser
      }
      if (!(err instanceof NotAuthenticatedError || err instanceof StoreClosedError)) {
        console.error('Could not load user', err)
      }
      this.store.setState({ currentUser: null, loadedUser: true })
      return null
    }
  }

  async updateStorefront(): Promise<Storefront> {
    const refresh = ++this.storefrontRefreshesStarted
    let latestStorefront: Storefront | undefined
    try {
      latestStorefront = await this.client.storefront.get(
        this.hasUtmOrReferrer ? this.utm : undefined,
      )
    } catch (err) {
      if (!(err instanceof StoreClosedError)) throw err
      this.closeStore()
      return this.storefront
    }
    if (refresh < this.storefrontRefreshLanded) {
      return this.storefront
    }
    if (latestStorefront) {
      this.storefrontRefreshLanded = refresh
      writeStorage(StorefrontContextImpl.storefrontKey, JSON.stringify(latestStorefront))
      const nextOrder: Order = {
        ...this.currentOrder,
        currency: resolveDisplayCurrency(this.currentOrder, latestStorefront),
      }
      if (nextOrder.status === OrderStatus.Open) {
        nextOrder.items = this.enrichLineItems(nextOrder.items, nextOrder)
      }
      this.store.setState({
        storefront: latestStorefront,
        loadedStorefront: true,
        currentOrder: nextOrder,
      })
      if (
        this.reconcileCartOffer() &&
        this.currentOrder.status === OrderStatus.Open &&
        this.currentOrder.items.length > 0
      ) {
        void this.pushOrderContent()
      }
      const consentedBefore = this.attributionConsent
      this.storeAllowsAttribution = latestStorefront.cookieConsentRequired === false
      this.attributionConsentChanged(consentedBefore)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('moonbase-storefront-updated', {
            detail: { storefront: latestStorefront },
          }),
        )
      }
    }
    return latestStorefront ?? this.storefront
  }

  private closeStore(): void {
    removeStorage(StorefrontContextImpl.storefrontKey)
    this.client.tokenStore.clear()
    this.store.setState({
      closed: true,
      storefront: createEmptyStorefront(),
      loadedStorefront: true,
      currentUser: null,
    })
    this.resetOrder()
  }

  setAttributionConsent(granted: boolean): void {
    const before = this.attributionConsent
    this.attributionConsentSetting = granted
    this.attributionConsentChanged(before)
    if (!granted && typeof window !== 'undefined') {
      if (this.hasUtmOrReferrer) {
        writeStorage(StorefrontContextImpl.utmKey, JSON.stringify(this.utm), 'session')
      }
      if (this.configuration.persistUtm) {
        removeStorage(StorefrontContextImpl.utmKey, 'local')
      }
    }
  }

  private attributionConsentChanged(before: boolean): void {
    const granted = this.attributionConsent
    if (typeof window === 'undefined' || granted === before) return
    if (granted && this.configuration.persistUtm) {
      const persisted = StorefrontContextImpl.parseCachedUtm(
        readStorage(StorefrontContextImpl.utmKey, 'local'),
      )
      this.arrival = resolveUtm(persisted, this.arrival ?? {})
    }
    const resolved = this.consentedUtm(this.arrival ?? {})
    this.utm = resolved
    if (this.hasUtmOrReferrer) {
      writeStorage(StorefrontContextImpl.utmKey, JSON.stringify(resolved), 'session')
      if (granted && this.configuration.persistUtm) {
        writeStorage(StorefrontContextImpl.utmKey, JSON.stringify(resolved), 'local')
      }
    }
    if (
      granted &&
      this.hasUtmOrReferrer &&
      !readStorage(StorefrontContextImpl.sessionKey)
    ) {
      void this.pushOrderContent()
    }
  }

  static parseCachedUtm(raw: string | null): UrchinTrackingModule | undefined {
    if (!raw) return undefined
    try {
      return JSON.parse(raw)
    } catch (err) {
      console.warn(`Could not parse cached UTM from ${StorefrontContextImpl.utmKey}`, err)
      return undefined
    }
  }

  private consentedUtm(utm: UrchinTrackingModule): UrchinTrackingModule {
    return this.attributionConsent ? utm : withoutClickIds(utm)
  }

  async pushOrderContent(): Promise<void> {
    if (this.currentOrder.status !== OrderStatus.Open) return
    writeStorage(StorefrontContextImpl.sessionKey, JSON.stringify(this.currentOrder))
    this.refreshOrderAbortController.abort()
    this.refreshOrderAbortController = new AbortController()
    await this.debouncedPushOrderContent(this.currentOrder)
  }

  static parseCachedStorefront(json: string): Storefront | null {
    let raw: unknown
    try {
      raw = JSON.parse(json)
    } catch (err) {
      console.warn('Could not parse the cached storefront; starting from an empty one', err)
      return null
    }
    const parsed = schemas.storefront.storefrontSchema.safeParse(raw)
    return parsed.success ? parsed.data : (raw as Storefront)
  }

  private handleStorageUpdate(event: StorageEvent): void {
    switch (event.key) {
      case StorefrontContextImpl.sessionKey:
        this.currentOrder = event.newValue
          ? JSON.parse(event.newValue)
          : createEmptyOpenOrder(this.storefront?.suggestedCurrency || '')
        break
      case StorefrontContextImpl.storefrontKey: {
        const storefront = event.newValue
          ? StorefrontContextImpl.parseCachedStorefront(event.newValue)
          : null
        if (storefront) this.storefront = storefront
        break
      }
      case StorefrontContextImpl.utmKey: {
        const utm = StorefrontContextImpl.parseCachedUtm(event.newValue)
        if (utm) {
          this.arrival = utm
          this.utm = this.consentedUtm(utm)
        }
        break
      }
      case TokenStore.storageKey:
        if (!event.newValue) {
          const user = this.currentUser
          this.currentUser = null
          console.warn('User was removed')
          if (user && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('moonbase-session-ended', { detail: { user } }))
          }
        } else {
          try {
            this.currentUser = schemas.identity.userSchema.parse(JSON.parse(event.newValue))
          } catch (err) {
            console.warn('Could not read the updated Moonbase user', err)
          }
        }
        break
    }
  }

  async refreshOrder(): Promise<void> {
    const refreshingId = this.currentOrder.id
    try {
      const latestOrder = await this.client.orders.get(refreshingId, {
        abort: this.refreshOrderAbortController.signal,
      })
      if (this.currentOrder.id !== refreshingId) return
      if (latestOrder) {
        if (latestOrder.status !== OrderStatus.Open) {
          this.resetOrder()
        } else {
          latestOrder.items = this.enrichLineItems(latestOrder.items, latestOrder)
          latestOrder.currency = resolveDisplayCurrency(latestOrder, this.storefront)
          writeStorage(StorefrontContextImpl.sessionKey, JSON.stringify(latestOrder))
          this.currentOrder = latestOrder
          if (
            this.loadedStorefront &&
            this.reconcileCartOffer() &&
            latestOrder.items.length > 0
          ) {
            void this.pushOrderContent()
          }
        }
      }
    } catch (err) {
      if (err instanceof NotAuthorizedError && this.currentOrder.id === refreshingId) {
        this.resetOrder()
      }
    }
  }

  resetOrder(opts?: { keepItems?: boolean }): void {
    const previous = this.currentOrder
    const keep = opts?.keepItems ?? false
    const keptItems =
      keep && previous.status === OrderStatus.Open ? previous.items : []
    const nextOrder: OpenCartOrder = {
      id: uuidv4(),
      currency: this.storefront?.suggestedCurrency || '',
      status: OrderStatus.Open,
      items: keptItems,
      couponsApplied: [],
    }
    this.currentOrder = nextOrder
    if (keep && nextOrder.items.length > 0) {
      writeStorage(StorefrontContextImpl.sessionKey, JSON.stringify(nextOrder))
    } else {
      removeStorage(StorefrontContextImpl.sessionKey)
    }
  }

  async surrenderOrder(): Promise<void> {
    try {
      await this.client.orders.removeBillingDetails(this.currentOrder.id)
    } catch (err) {
      if (err instanceof NotFoundError) return
      console.warn('Could not surrender order:', err)
    }
  }

  offerConditionContext(order: Order = this.currentOrder): OfferConditionContext {
    return CartUtils.conditionContext(
      this.storefront,
      order,
      resolveDisplayCurrency(order, this.storefront),
    )
  }

  reconcileCartOffer(): boolean {
    const order = this.currentOrder
    if (order.status !== OrderStatus.Open) return false
    const best = CartUtils.bestCartOffer(
      this.storefront,
      order,
      resolveDisplayCurrency(order, this.storefront),
    )
    if (best?.id === order.offerId) return false
    this.currentOrder = {
      ...order,
      offerId: best?.id,
    }
    return true
  }

  async removeCartOffer(): Promise<void> {
    const order = this.currentOrder
    if (order.status === OrderStatus.Open) {
      const updated: OpenCartOrder = { ...order, offerId: undefined }
      this.currentOrder = updated
      writeStorage(StorefrontContextImpl.sessionKey, JSON.stringify(updated))
      await this.client.orders.removeOffer(updated.id)
    }
  }

  enrichLineItems(lineItems: LineItem[], order?: Order): LineItem[] {
    if (!this.storefront) return lineItems
    const context = this.offerConditionContext(order)
    return lineItems.map((item) => {
      const offer = this.storefront.offers?.find((o) => o.id === item.offerId)
      if (item.type === 'Product') {
        const product = this.storefront.products.find((p) => p.id === item.productId)
        let variation = CartUtils.productLineVariation(
          product,
          item.variationId,
          item.targetLicenseId,
        )
        if (offer && variation && OfferUtils.eligible(offer, context)) {
          variation = OfferUtils.applyToVariation(offer, variation)
        }
        return {
          ...item,
          product,
          variation,
          price: variation?.price,
          appliedDiscount: variation?.discount ?? item.appliedDiscount,
        }
      } else {
        const bundle = this.storefront.bundles.find((b) => b.id === item.bundleId)
        const variations = bundle?.variations || []
        let variation = variations.find((v) => v.id === item.variationId)
        if (offer && variation && OfferUtils.eligible(offer, context)) {
          variation = OfferUtils.applyToVariation(offer, variation)
        }
        return {
          ...item,
          bundle,
          variation,
          price: variation?.price,
          appliedDiscount: variation?.discount ?? item.appliedDiscount,
        }
      }
    })
  }
}

export function createStorefront(
  endpoint: string,
  config?: MoonbaseReactConfiguration,
): StorefrontContext {
  const { autoApplyItemOffers, ssrAuthCookie, ...restConfig } = config ?? {}
  const defaultStore =
    restConfig.store ??
    (typeof window !== 'undefined'
      ? new SplitBrowserStore({ cookieName: ssrAuthCookie ?? SSR_AUTH_COOKIE_DEFAULT })
      : new InMemoryStore())

  const configuration: MoonbaseConfiguration = {
    ...restConfig,
    endpoint,
    store: defaultStore,
    sdk: `${restConfig.sdk ?? ''} @moonbase.sh/react/${SDK_VERSION}`.trim().replace(/\s+/g, ' '),
  }

  return new StorefrontContextImpl(configuration, new MoonbaseClient(configuration), {
    autoApplyItemOffers,
  })
}
