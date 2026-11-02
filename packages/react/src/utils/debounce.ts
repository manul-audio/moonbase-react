export function debounce<T extends (...args: any[]) => any>(
  func: T,
  waitMs = 100,
): ((...args: Parameters<T>) => Promise<void>) & { cancel: () => void } {
  let timeoutToken: ReturnType<typeof setTimeout> | undefined

  const debounced = async (...args: Parameters<T>): Promise<void> => {
    if (timeoutToken !== undefined) clearTimeout(timeoutToken)
    timeoutToken = setTimeout(() => {
      func(...args)
    }, waitMs)
  }

  debounced.cancel = () => {
    if (timeoutToken !== undefined) {
      clearTimeout(timeoutToken)
      timeoutToken = undefined
    }
  }

  return debounced
}

