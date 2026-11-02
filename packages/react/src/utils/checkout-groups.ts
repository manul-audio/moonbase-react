import type { MoonbaseClient } from '@moonbase.sh/storefront-api'

export async function recordCheckoutGroups(
  client: MoonbaseClient,
  orderId: string,
  groupIds?: string[],
): Promise<void> {
  if (!groupIds?.length) return
  try {
    await client.orders.joinGroups(orderId, groupIds)
  } catch (err) {
    console.warn('Moonbase: could not record checkout group enrollment', err)
  }
}
