export function onPageRestore(restore: () => void, target?: EventTarget): () => void {
  const scope = target ?? (typeof window === 'undefined' ? undefined : window)
  if (!scope) return () => {}
  const handler = (event: Event) => {
    if (!(event as PageTransitionEvent).persisted) return
    scope.removeEventListener('pageshow', handler)
    restore()
  }
  scope.addEventListener('pageshow', handler)
  return () => scope.removeEventListener('pageshow', handler)
}

