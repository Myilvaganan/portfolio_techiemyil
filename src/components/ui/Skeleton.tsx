import { cn } from '@/lib/utils'

/** A shimmering placeholder block shown while data loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-lg bg-surface-10', className)} />
}

/** A page-shaped placeholder: title, a row of cards, then a list. Used while a page or its data loads. */
export function PageSkeleton({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="space-y-5">
      <div className="flex items-start gap-3.5">
        <Skeleton className="h-12 w-12 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-3.5 w-72 max-w-full" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2.5 rounded-2xl border border-border bg-surface-2 p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      <ListSkeleton rows={5} />
    </div>
  )
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}
