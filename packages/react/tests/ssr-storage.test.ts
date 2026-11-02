import { describe, expect, it } from 'vitest'
import {
  SplitBrowserStore,
  createServerCookieStore,
  parseCookieToken,
  serializeStorefrontState,
} from '../src/ssr'

function makeJwt(expSecondsFromNow: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const payload = btoa(JSON.stringify({ iat: now, exp: now + expSecondsFromNow }))
  return `${header}.${payload}.sig`
}

describe('SplitBrowserStore and ServerCookieStore security', () => {
  it('stores full auth in localStorage but only mirrors accessToken to document.cookie (never refreshToken)', () => {
    const store = new SplitBrowserStore({ cookieName: 'moonbase_ssr_token' })
    const accessToken = makeJwt(900)
    store.set('moonbase_auth', {
      accessToken,
      refreshToken: 'SUPER_SECRET_REFRESH_TOKEN',
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      user: { id: 'u1', email: 'a@b.c', name: 'Alice', tenantId: 't1' },
    })

    const rawLocal = window.localStorage.getItem('moonbase_auth')
    expect(rawLocal).toContain('SUPER_SECRET_REFRESH_TOKEN')
    expect(document.cookie).toContain(`moonbase_ssr_token=${encodeURIComponent(accessToken)}`)
    expect(document.cookie).not.toContain('SUPER_SECRET_REFRESH_TOKEN')

    store.remove('moonbase_auth')
    expect(parseCookieToken(document.cookie, 'moonbase_ssr_token')).toBeNull()
  })

  it('reconstructs a per-request server IStore from a Cookie header without cross-request leakage', () => {
    const tokenA = makeJwt(600)
    const tokenB = makeJwt(600)
    const storeA = createServerCookieStore(
      `foo=1; moonbase_ssr_token=${encodeURIComponent(tokenA)}; bar=2`,
    )
    const storeB = createServerCookieStore(`moonbase_ssr_token=${encodeURIComponent(tokenB)}`)

    expect(storeA.get<any>('moonbase_auth')?.accessToken).toBe(tokenA)
    expect(storeB.get<any>('moonbase_auth')?.accessToken).toBe(tokenB)
  })

  it('escapes dangerous script characters in serializeStorefrontState', () => {
    const serialized = serializeStorefrontState({
      storefront: null,
      loadedStorefront: true,
      closed: false,
      currentUser: { name: '</script><script>alert(1)</script>' } as any,
      loadedUser: true,
    })
    expect(serialized).not.toContain('</script>')
    expect(JSON.parse(serialized).currentUser.name).toBe('</script><script>alert(1)</script>')
  })
})
