import { useEffect } from 'react'

export function useDisableContextMenu({ disabled = false }: { disabled?: boolean } = {}) {
  useEffect(() => {
    if (disabled) return

    function handleContextMenu(e: MouseEvent) {
      e.preventDefault()
    }
    document.addEventListener('contextmenu', handleContextMenu)
    return () => document.removeEventListener('contextmenu', handleContextMenu)
  }, [disabled])
}
