import { useRef, useEffect } from 'react'

export function useMagnetic<T extends HTMLElement>(strength = 0.35) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(pointer: coarse)').matches) return

    function handleMove(e: MouseEvent) {
      const rect = el!.getBoundingClientRect()
      const x = e.clientX - rect.left - rect.width / 2
      const y = e.clientY - rect.top - rect.height / 2
      el!.style.transform = `translate(${x * strength}px, ${y * strength}px)`
    }

    function handleLeave() {
      el!.style.transform = 'translate(0px, 0px)'
    }

    el.addEventListener('mousemove', handleMove)
    el.addEventListener('mouseleave', handleLeave)
    return () => {
      el.removeEventListener('mousemove', handleMove)
      el.removeEventListener('mouseleave', handleLeave)
    }
  }, [strength])

  return ref
}
