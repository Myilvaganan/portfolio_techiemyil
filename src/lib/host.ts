/**
 * The admin app lives on its own domain (admin.techiemyil.com) and the portfolio on techiemyil.com — one build, split
 * by host. Locally, open http://admin.localhost:5173 for the admin app, or set VITE_APP=admin.
 */
export const IS_ADMIN_HOST =
  (typeof window !== 'undefined' && /^admin\./.test(window.location.hostname)) || import.meta.env.VITE_APP === 'admin'

export const ADMIN_URL = 'https://admin.techiemyil.com'

export const SITE_URL = 'https://techiemyil.com'

/** Open another site: a new tab on the web; in the Android app the system browser (Capacitor hands off other hosts). */
export function openExternal(url: string) {
  const native = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
  if (native) window.location.href = url
  else window.open(url, '_blank', 'noopener')
}
