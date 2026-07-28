import { useEffect } from 'react'

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA'])

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return EDITABLE_TAGS.has(target.tagName) || target.isContentEditable
}

export function useDisableCopy({ disabled = false }: { disabled?: boolean } = {}) {
  useEffect(() => {
    if (disabled) return

    function handleCopyOrCut(e: ClipboardEvent) {
      if (isEditableTarget(e.target)) return
      e.preventDefault()
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return
      if (isEditableTarget(e.target)) return
      const key = e.key.toLowerCase()
      if (key === 'c' || key === 'x' || key === 'a') {
        e.preventDefault()
      }
    }

    document.addEventListener('copy', handleCopyOrCut)
    document.addEventListener('cut', handleCopyOrCut)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('copy', handleCopyOrCut)
      document.removeEventListener('cut', handleCopyOrCut)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [disabled])
}
