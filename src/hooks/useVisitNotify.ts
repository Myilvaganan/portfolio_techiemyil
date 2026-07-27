import { useEffect } from 'react'
import { notifyVisit } from '@/lib/visit'

export function useVisitNotify() {
  useEffect(() => {
    notifyVisit(window.location.pathname)
  }, [])
}
