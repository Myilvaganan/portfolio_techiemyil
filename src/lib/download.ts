const DOWNLOAD_API_URL = import.meta.env.VITE_DOWNLOAD_API_URL

export interface ResumeDownloadDetails {
  name: string
  email?: string
  reason?: string
  reasonDetail?: string
}

// Best-effort: a failed alert to the site owner must never block the visitor's
// download, so this swallows every failure.
export function notifyResumeDownload(details: ResumeDownloadDetails) {
  if (!DOWNLOAD_API_URL) return

  fetch(DOWNLOAD_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details),
    keepalive: true,
  }).catch(() => {})
}
