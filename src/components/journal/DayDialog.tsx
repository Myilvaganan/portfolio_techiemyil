import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { dateLabel } from '@/lib/journal'

/** A day's trades and notes in a pop-up — how a tapped date is shown on phones, where the side panel is off-screen. */
export function DayDialog({ open, onOpenChange, date, children }: { open: boolean; onOpenChange: (open: boolean) => void; date: string; children: ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay data-native-cursor className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          data-native-cursor
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[151] max-h-[94vh] w-[96vw] max-w-lg -translate-x-1/2 -translate-y-1/2 space-y-3 overflow-y-auto rounded-2xl border border-border bg-card p-3 shadow-2xl"
        >
          <Dialog.Title className="sr-only">{dateLabel(date)}</Dialog.Title>
          <div className="flex justify-end">
            <Dialog.Close asChild>
              <button type="button" aria-label="Close day details" className="rounded-full border border-border p-1.5 text-text-secondary hover:text-text">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
