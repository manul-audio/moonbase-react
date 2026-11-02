import {
  MoonbaseError,
  NotAuthorizedError,
  OrderStatus,
  type MoonbaseClient,
  type OpenOrder,
} from '@moonbase.sh/storefront-api'
import { readStorage, removeStorage, writeStorage } from './safe-storage'

const storageKey = 'moonbase_direct_purchase'
const maxAgeMs = 24 * 60 * 60 * 1000

export interface RememberedPurchase {
  orderId: string
  userId: string | null
  couponCode: string | null
  startedAt: number
}

export function normalizeCouponCode(code: string): string {
  return code.trim().toLowerCase()
}

export function sameCouponCode(a: string, b: string): boolean {
  return normalizeCouponCode(a) === normalizeCouponCode(b)
}

export function hasCoupon(order: OpenOrder, code: string): boolean {
  return order.couponsApplied.some((coupon) => sameCouponCode(coupon.code, code))
}

function parseRemembered(raw: string): RememberedPurchase | null {
  try {
    const parsed = JSON.parse(raw)
    if (
      typeof parsed.orderId === 'string' &&
      (typeof parsed.userId === 'string' || parsed.userId === null) &&
      (typeof parsed.couponCode === 'string' || parsed.couponCode === null) &&
      typeof parsed.startedAt === 'number'
    ) {
      return parsed
    }
  } catch {
    // ignore invalid json
  }
  return null
}

function readRemembered(): RememberedPurchase | null {
  const raw = readStorage(storageKey)
  if (!raw) return null
  const remembered = parseRemembered(raw)
  if (!remembered) removeStorage(storageKey)
  return remembered
}

function isExpired(remembered: RememberedPurchase, now: number): boolean {
  return now - remembered.startedAt > maxAgeMs
}

export function forgetPurchase(orderId?: string): void {
  if (orderId === undefined || readRemembered()?.orderId === orderId) {
    removeStorage(storageKey)
  }
}

export function pruneRememberedPurchase(now = Date.now()): void {
  const remembered = readRemembered()
  if (remembered && isExpired(remembered, now)) {
    removeStorage(storageKey)
  }
}

export async function resumePurchase(
  client: MoonbaseClient,
  userId: string | null,
  couponCode?: string,
  now = Date.now(),
): Promise<{ orderId: string; couponCode: string | null } | null> {
  const remembered = readRemembered()
  if (!remembered) return null
  if (remembered.userId !== userId || isExpired(remembered, now)) {
    removeStorage(storageKey)
    return null
  }
  try {
    const order = await client.orders.get(remembered.orderId)
    if (order?.status !== OrderStatus.Open) {
      removeStorage(storageKey)
      return null
    }
    const asked = remembered.couponCode
    if (asked && couponCode && sameCouponCode(couponCode, asked)) {
      return { orderId: remembered.orderId, couponCode: asked }
    }
    if (asked) {
      const stale = order.couponsApplied.find((coupon) => sameCouponCode(coupon.code, asked))
      if (stale) {
        await client.orders.removeCouponCode(remembered.orderId, stale.code)
      }
    }
    return { orderId: remembered.orderId, couponCode: null }
  } catch {
    removeStorage(storageKey)
    return null
  }
}

export function isClosedOrderRefusal(err: unknown): boolean {
  return (
    err instanceof NotAuthorizedError || (err instanceof MoonbaseError && err.status === 400)
  )
}

export function watchForTakeover(orderId: string, onTakenOver: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const listener = (event: StorageEvent) => {
    if (event.key !== storageKey || !event.newValue) return
    if (parseRemembered(event.newValue)?.orderId === orderId) {
      onTakenOver()
    }
  }
  window.addEventListener('storage', listener)
  return () => window.removeEventListener('storage', listener)
}

export function rememberPurchase(
  orderId: string,
  userId: string | null,
  couponCode?: string | null,
  now = Date.now(),
): void {
  const entry: RememberedPurchase = {
    orderId,
    userId,
    couponCode: couponCode?.trim() || null,
    startedAt: now,
  }
  writeStorage(storageKey, JSON.stringify(entry))
}

