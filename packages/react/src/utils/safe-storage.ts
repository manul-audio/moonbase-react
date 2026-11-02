const warned = new Set<string>()

function resolve(kind: 'local' | 'session'): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return (kind === 'local' ? window.localStorage : window.sessionStorage) ?? null
  } catch {
    return null
  }
}

export function readStorage(key: string, kind: 'local' | 'session' = 'local'): string | null {
  try {
    return resolve(kind)?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function writeStorage(
  key: string,
  value: string,
  kind: 'local' | 'session' = 'local',
): boolean {
  try {
    const storage = resolve(kind)
    if (!storage) return false
    storage.setItem(key, value)
    return true
  } catch (err) {
    if (!warned.has(key)) {
      warned.add(key)
      console.warn(
        `Moonbase could not persist "${key}": this browser is blocking or has exhausted site storage.`,
        err,
      )
    }
    return false
  }
}

export function removeStorage(key: string, kind: 'local' | 'session' = 'local'): void {
  try {
    resolve(kind)?.removeItem(key)
  } catch {
    // ignore storage removal errors
  }
}

