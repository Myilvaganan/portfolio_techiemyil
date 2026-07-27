import { useEffect } from 'react'

export function useDisableContextMenu() {
  useEffect(() => {
    function handleContextMenu(e: MouseEvent) {
      e.preventDefault()
    }
    document.addEventListener('contextmenu', handleContextMenu)
    return () => document.removeEventListener('contextmenu', handleContextMenu)
  }, [])
}
