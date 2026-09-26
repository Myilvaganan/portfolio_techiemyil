const KEY = 'chunk_reloaded_at'
const WINDOW_MS = 60_000

/**
 * A page file that can't be fetched usually means the installed app is holding an old copy of the site after an update.
 * Reload once to pick up the new version; if it fails again right away, let the error show instead of looping.
 */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (Date.now() - last < WINDOW_MS) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    // Without storage we still reload once per page load below.
  }
  window.location.reload()
  return true
}

/** `import()` that recovers from a stale cached build. Use inside React.lazy. */
export async function retryImport<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch (err) {
    if (reloadForNewVersion()) return new Promise<T>(() => {})
    throw err
  }
}
