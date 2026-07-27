import { cn } from '@/lib/utils'

export function Watermark({ label = 'techiemyil.com', className }: { label?: string; className?: string }) {
  return (
    <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0 select-none overflow-hidden', className)}>
      <div
        className="absolute inset-[-20%] flex flex-wrap content-start gap-x-8 gap-y-8 opacity-[0.22] mix-blend-difference"
        style={{ transform: 'rotate(-24deg)' }}
      >
        {Array.from({ length: 40 }).map((_, i) => (
          <span key={i} className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-widest text-white">
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
