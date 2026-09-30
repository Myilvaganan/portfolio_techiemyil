/**
 * The admin app lives on its own domain (admin.techiemyil.com) and the portfolio on techiemyil.com — one build, split
 * by host. Locally, open http://admin.localhost:5173 for the admin app, or set VITE_APP=admin.
 */
export const IS_ADMIN_HOST =
  (typeof window !== 'undefined' && /^admin\./.test(window.location.hostname)) || import.meta.env.VITE_APP === 'admin'

export const ADMIN_URL = 'https://admin.techiemyil.com'
