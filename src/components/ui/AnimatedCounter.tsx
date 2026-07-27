import { useEffect, useRef } from 'react'
import { useCountUp } from 'react-countup'
import { useInView } from 'framer-motion'

interface AnimatedCounterProps {
  value: number
  suffix?: string
  className?: string
  duration?: number
}

export function AnimatedCounter({ value, suffix = '', className, duration = 2.2 }: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null!)
  const inView = useInView(ref, { once: true, margin: '-10% 0px' })

  const { start } = useCountUp({
    ref,
    end: value,
    duration,
    suffix,
    startOnMount: false,
  })

  useEffect(() => {
    if (inView) start()
  }, [inView, start])

  return <span ref={ref} className={className}>{`0${suffix}`}</span>
}
