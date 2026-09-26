import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { notifyVisit } from '@/lib/visit'
import { recordHit } from '@/lib/platformApi'

export function useVisitNotify() {
  const { pathname } = useLocation()

  useEffect(() => {
    notifyVisit(window.location.pathname)
  }, [])

  // One cookieless page view per page opened; the server ignores /admin paths.
  useEffect(() => {
    if (!pathname.startsWith('/admin')) recordHit(pathname)
  }, [pathname])
}
