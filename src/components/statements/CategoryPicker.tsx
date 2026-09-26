import * as Dialog from '@radix-ui/react-dialog'
import { Banknote, Bus, CircleHelp, ChevronDown, Clapperboard, Coins, Fuel, GraduationCap, HandCoins, HeartPulse, Home, Landmark, LineChart, Plane, ReceiptText, Repeat, ShieldCheck, ShoppingBag, ShoppingBasket, UtensilsCrossed, Zap, X, type LucideIcon } from 'lucide-react'
import { IconBadge, assignColors } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Groceries: ShoppingBasket,
  'Food & Dining': UtensilsCrossed,
  Shopping: ShoppingBag,
  Transport: Bus,
  Fuel,
  Travel: Plane,
  'Bills & Utilities': Zap,
  Subscriptions: Repeat,
  Health: HeartPulse,
  Education: GraduationCap,
  Entertainment: Clapperboard,
  Rent: Home,
  'EMI & Loans': HandCoins,
  Investments: LineChart,
  Insurance: ShieldCheck,
  'Gold Savings': Coins,
  'Cash Withdrawal': Banknote,
  'Fees & Charges': ReceiptText,
  Taxes: Landmark,
  Other: CircleHelp,
}
// One colour per category, none repeated.
assignColors(Object.keys(CATEGORY_ICONS))

export const categoryIcon = (c: string): LucideIcon => CATEGORY_ICONS[c] ?? CircleHelp

/** A category shown as a coloured icon and name. */
export function CategoryChip({ category, className }: { category: string; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <IconBadge icon={categoryIcon(category)} seed={category} size="sm" className="h-6 w-6 rounded-md [&>svg]:h-3.5 [&>svg]:w-3.5" />
      <span className="truncate text-xs font-medium text-text">{category}</span>
    </span>
  )
}

/** One tap on the current category opens a grid of every category as a big icon tile; tapping one files it. */
export function CategoryPicker({ value, categories, title, busy, onPick }: { value: string; categories: string[]; title: string; busy?: boolean; onPick: (category: string) => void }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" disabled={busy} aria-label={`${title}: change category, now ${value}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-2 py-1 pl-1.5 pr-2 hover:border-accent/40 disabled:opacity-60">
          <CategoryChip category={value} />
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/60" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-[80] max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-border bg-card p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[30rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="section-title">File under…</Dialog.Title>
              <Dialog.Description className="truncate text-sm text-text-secondary">{title}</Dialog.Description>
            </div>
            <Dialog.Close aria-label="Close" className="rounded-full p-2 text-text-secondary hover:bg-surface-3 hover:text-text">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
            {categories.map((c) => (
              <Dialog.Close key={c} asChild>
                <button type="button" onClick={() => onPick(c)} className={cn('flex flex-col items-center gap-2 rounded-2xl border px-2 py-3 text-center text-xs font-medium transition-transform active:scale-95', c === value ? 'border-accent/50 bg-accent/15 text-accent' : 'border-border bg-surface-2 text-text')}>
                  <IconBadge icon={categoryIcon(c)} seed={c} size="md" />
                  <span className="leading-tight">{c}</span>
                </button>
              </Dialog.Close>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
