let maxHeight: number | null = null
let layoutSignature: string | null = null

function getWindow(): Window | undefined {
  return typeof window === 'undefined' ? undefined : window
}

export function measureViewportHeight(): number | null {
  const view = getWindow()
  const viewport = view?.visualViewport
  if (!view || !viewport) return null
  const signature = `${view.innerWidth}x${view.innerHeight}`
  if (signature !== layoutSignature) {
    layoutSignature = signature
    maxHeight = null
  }
  const height = viewport.height
  if (!Number.isFinite(height) || height <= 0) return maxHeight
  maxHeight = maxHeight === null ? height : Math.max(maxHeight, height)
  return maxHeight
}

export function resetViewportHeight(): void {
  maxHeight = null
  layoutSignature = null
}

export function trackViewportHeight(el: HTMLElement): () => void {
  const view = getWindow()
  const viewport = view?.visualViewport
  if (!view || !viewport) return () => {}
  resetViewportHeight()
  let applied: number | null = null
  let frame: number | null = null

  const write = () => {
    frame = null
    const height = measureViewportHeight()
    if (height === null || height === applied) return
    applied = height
    el.style.setProperty('height', `${height}px`, 'important')
  }

  const schedule = () => {
    if (frame === null) frame = view.requestAnimationFrame(write)
  }

  write()
  viewport.addEventListener('resize', schedule)
  view.addEventListener('orientationchange', schedule)

  return () => {
    if (frame !== null) view.cancelAnimationFrame(frame)
    frame = null
    viewport.removeEventListener('resize', schedule)
    view.removeEventListener('orientationchange', schedule)
    resetViewportHeight()
  }
}
