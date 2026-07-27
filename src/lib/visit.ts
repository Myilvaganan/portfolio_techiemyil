const VISIT_API_URL = import.meta.env.VITE_VISIT_API_URL
const STORAGE_KEY = 'visit-notified-on'

function alreadyNotifiedToday(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === new Date().toISOString().slice(0, 10)
  } catch {
    return false
  }
}

function markNotifiedToday() {
  try {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString().slice(0, 10))
  } catch {
    // localStorage unavailable (e.g. private mode) — fall through silently
  }
}

export function notifyVisit(path: string) {
  if (!VISIT_API_URL || alreadyNotifiedToday()) return

  markNotifiedToday()

  fetch(VISIT_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, referrer: document.referrer }),
    keepalive: true,
  }).catch(() => {
    // Best-effort only — a failed visit alert shouldn't affect the visitor.
  })
}
