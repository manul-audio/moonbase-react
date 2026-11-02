const HANDSHAKE_PREFIX = 'mb_'

export function withoutHandshakeParams(href: string): string {
  const url = new URL(href)
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith(HANDSHAKE_PREFIX)) {
      url.searchParams.delete(key)
    }
  }
  return url.href
}

export function currentPageUrl(): string {
  if (typeof window === 'undefined' || !window.location) return ''
  return withoutHandshakeParams(window.location.href)
}
