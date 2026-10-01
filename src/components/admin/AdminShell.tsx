import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useInRouterContext, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import { AlarmClock, BedDouble, Salad, Cake, Milestone, Pill, Receipt, Sun, Timer, BellRing, BookLock, CalendarDays, Droplets, UserRound, ChevronRight, X, Gem, Flame, ClipboardList, LifeBuoy, Mountain, Eye, EyeOff, CalendarCheck, Repeat, Brain, ShieldAlert, Scale3d, AlertTriangle, Bell, Handshake, Sparkles, Home, LineChart, PiggyBank, ShieldCheck, Target, Waves, Calculator, FolderOpen, Globe, LayoutDashboard, LogOut, LayoutGrid, Wallet, Fingerprint, WifiOff, Loader2, ArrowDown, PieChart, Scale, TrendingUp, BarChart3, Landmark, CreditCard, HandCoins, NotebookPen, HeartPulse, ReceiptText } from 'lucide-react'
import tmLogo from '@/assets/images/logo.webp'
import { SITE_URL, openExternal } from '@/lib/host'
import { Logo } from '@/components/ui/Logo'
import { personal } from '@/data/personal'
import { Avatar, IconBadge, assignColors } from '@/components/ui/Avatar'
import { useProfile } from '@/lib/profile'
import { useGrowthDoc } from '@/lib/growthApi'
import { todayStr } from '@/lib/journal'
import { dayDivisions, istTime, nallaNeram } from '@/lib/panchang/core'
import { dayFacts, rasiPalan, specialsFor } from '@/lib/panchang/days'
import { placeOf } from '@/lib/panchang/note'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { cn } from '@/lib/utils'
import { clearStoredToken } from '@/lib/adminAuth'
import { formatInr } from '@/lib/kite'
import { noticesFrom, type Notice } from '@/lib/pulse'
import { useAdminPulse } from '@/hooks/useAdminPulse'
import { useIdleLock } from '@/hooks/useIdleLock'
import { UI_SCALES, useUiScale, type UiScaleId } from '@/hooks/useUiScale'
import { useAppLock } from '@/hooks/useAppLock'
import { useOnline, useTouchGestures } from '@/hooks/useTouchGestures'
import { GlobalSearch } from './GlobalSearch'
import { LocalePicker } from './LocalePicker'
import { SLIDE, haptic, markTabNavigation, useNavDirection, useNativeFeel, useTitleScrolledAway } from '@/lib/native'
import { useT, type TKey } from '@/lib/i18n'
import { usePrivacy } from '@/lib/privacy'
import { useNativePushTaps, usePush } from '@/lib/push'
import { useDismissedNotices } from '@/lib/dismissed'
import { useLocale } from '@/lib/locale'
import { useSkin, type Skin } from '@/hooks/useSkin'
import { NoirSplash } from './Cinema'

interface NavItem {
  label: string
  k: TKey
  to: string
  icon: typeof LayoutDashboard
}

export interface NavSection {
  label?: string
  k?: TKey
  items: NavItem[]
}

const SEARCH_KEYWORDS: Record<string, string> = {
  '/loans': 'emi prepay foreclosure',
  '/subscriptions': 'recurring renewal netflix insurance domain price rise cancel',
  '/debt-free': 'avalanche snowball payoff prepay credit card interest emi',
  '/runway': 'emergency fund months job loss stress test savings',
  '/life-admin': 'passport licence insurance puc kyc deadline expiry renewal advance tax itr',
  '/habits': 'streak routine daily checklist workout reading',
  '/profile': 'profile photo picture name personal info settings account',
  '/tamil-calendar': 'tamil calendar panchangam thithi nakshatra rahu kalam nalla neram festival pradosham ekadasi amavasai pournami rasi palan horoscope',
  '/diary': 'diary journal notes daily notes private personal locked',
  '/today': 'today plan agenda daily list check-in',
  '/focus': 'tasks todo focus pomodoro timer deep work',
  '/sleep-mood': 'sleep mood energy log',
  '/medicines': 'medicine tablet vitamin supplement reminder',
  '/family': 'birthday anniversary family dates star natchathiram',
  '/receipts': 'receipt bill photo scan cash expense',
  '/goal-timeline': 'goal net worth debt free timeline projection',
  '/reminders': 'reminder alarm repeat vaccine vaccination child baby immunisation schedule',
  '/calories': 'calories food diet meal nutrition protein carbs fat kcal weight loss',
  '/water': 'water drink hydration litres glass reminder',
  '/guardrails': 'rules stop loss limit discipline checklist risk',
  '/trading-journal': 'mt5 forex options calendar',
  '/health-report': 'inbody weight fat body',
  '/household': 'rent electricity bescom tangedco petrol bike zomato swiggy rapido ola instamart amazon appusamy visalakshi',
  '/tax': 'itr income tax return tds advance tax refund 80c 80d hra form 16 26as ais capital gains regime',
  '/net-worth': 'assets liabilities wealth',
  '/budgets': 'budget limit category overspend rules family',
  '/cash-flow': 'income savings runway burn projection',
  '/lending': 'lend loan owed friend borrowed money receivable emi split pass through',
  '/chat': 'ask question assistant chatbot ai answer',
  '/goals': 'goal target house bike emergency fund savings',
  '/investments': 'returns sip capital gains deductions 80c reminders itr',
  '/security': '2fa two factor authenticator password login',
  '/site': 'messages contact analytics visitors',
  '/credit-cards': 'card spend',
  '/bank-statements': 'bank spend transactions',
}

// Ordered by how often each is used: the daily pair first, then trading (the busiest area), day-to-day money, periodic wealth
// and debt, and the rarely-touched admin last.
export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: 'Dashboard', k: 'nav.dashboard', to: '/', icon: LayoutDashboard },
      { label: 'Today', k: 'nav.today', to: '/today', icon: Sun },
      { label: 'Ask My Data', k: 'nav.ask', to: '/chat', icon: Sparkles },
    ],
  },
  // Every-day things first, in the order a day usually goes.
  {
    label: 'Daily',
    k: 'nav.daily',
    items: [
      { label: 'Tasks & Focus', k: 'nav.focus', to: '/focus', icon: Timer },
      { label: 'Reminders', k: 'nav.reminders', to: '/reminders', icon: AlarmClock },
      { label: 'Habits', k: 'nav.habits', to: '/habits', icon: Flame },
      { label: 'Water', k: 'nav.water', to: '/water', icon: Droplets },
      { label: 'Calories', k: 'nav.calories', to: '/calories', icon: Salad },
      { label: 'Medicines', k: 'nav.medicines', to: '/medicines', icon: Pill },
      { label: 'Tamil Calendar', k: 'nav.tamilCalendar', to: '/tamil-calendar', icon: CalendarDays },
      { label: 'Diary', k: 'nav.diary', to: '/diary', icon: BookLock },
    ],
  },
  {
    label: 'Trading',
    k: 'nav.trading',
    items: [
      { label: 'Trading Journal', k: 'nav.tradingJournal', to: '/trading-journal', icon: NotebookPen },
      { label: 'Trading Guardrails', k: 'nav.guardrails', to: '/guardrails', icon: ShieldAlert },
      { label: 'Options Analytics', k: 'nav.optionsAnalytics', to: '/options-analytics', icon: BarChart3 },
      { label: 'Zerodha Dashboard', k: 'nav.zerodha', to: '/zerodha', icon: TrendingUp },
      { label: 'Trading vs Life', k: 'nav.tradingLedger', to: '/trading-vs-life', icon: Scale3d },
      { label: 'Margin Calculator', k: 'nav.margin', to: '/margin-calculator', icon: Calculator },
    ],
  },
  {
    label: 'Spending',
    k: 'nav.money',
    items: [
      { label: 'Budgets', k: 'nav.budgets', to: '/budgets', icon: PiggyBank },
      { label: 'Bank Statements', k: 'nav.bank', to: '/bank-statements', icon: Landmark },
      { label: 'Credit Cards', k: 'nav.cards', to: '/credit-cards', icon: CreditCard },
      { label: 'Receipts', k: 'nav.receipts', to: '/receipts', icon: Receipt },
      { label: 'Household', k: 'nav.household', to: '/household', icon: Home },
      { label: 'Subscriptions', k: 'nav.subscriptions', to: '/subscriptions', icon: Repeat },
      { label: 'Cash Flow', k: 'nav.cashFlow', to: '/cash-flow', icon: Waves },
    ],
  },
  {
    label: 'Wealth & debt',
    k: 'nav.wealth',
    items: [
      { label: 'Net Worth', k: 'nav.netWorth', to: '/net-worth', icon: Scale },
      { label: 'Loans', k: 'nav.loans', to: '/loans', icon: HandCoins },
      { label: 'Debt-Free Plan', k: 'nav.debtFree', to: '/debt-free', icon: Mountain },
      { label: 'Goal timeline', k: 'nav.goalTimeline', to: '/goal-timeline', icon: Milestone },
      { label: 'Goals', k: 'nav.goals', to: '/goals', icon: Target },
      { label: 'Investments', k: 'nav.investments', to: '/investments', icon: LineChart },
      { label: 'Portfolio Rebalance', k: 'nav.rebalance', to: '/portfolio-rebalance', icon: PieChart },
      { label: 'Runway & Stress', k: 'nav.runway', to: '/runway', icon: LifeBuoy },
      { label: 'Lending', k: 'nav.lending', to: '/lending', icon: Handshake },
      { label: 'Tax Information', k: 'nav.tax', to: '/tax', icon: ReceiptText },
    ],
  },
  {
    label: 'Health & mind',
    k: 'nav.health',
    items: [
      { label: 'Health Report', k: 'nav.healthReport', to: '/health-report', icon: HeartPulse },
      { label: 'Sleep & Mood', k: 'nav.sleepMood', to: '/sleep-mood', icon: BedDouble },
      { label: 'Mind & Money', k: 'nav.mindMoney', to: '/mind-money', icon: Brain },
    ],
  },
  {
    label: 'Life',
    k: 'nav.growth',
    items: [
      { label: 'Family dates', k: 'nav.family', to: '/family', icon: Cake },
      { label: 'Life Admin', k: 'nav.lifeAdmin', to: '/life-admin', icon: ClipboardList },
      { label: 'Monthly Review', k: 'nav.monthlyReview', to: '/monthly-review', icon: CalendarCheck },
    ],
  },
  {
    label: 'Manage',
    k: 'nav.manage',
    items: [
      { label: 'Profile', k: 'nav.profile', to: '/profile', icon: UserRound },
      { label: 'Document Manager', k: 'nav.documents', to: '/documents', icon: FolderOpen },
      { label: 'Website', k: 'nav.website', to: '/site', icon: Globe },
      { label: 'Security', k: 'nav.security', to: '/security', icon: ShieldCheck },
    ],
  },
]

const SEARCH_PAGES = NAV_SECTIONS.flatMap((s) => s.items).map((i) => ({ label: i.label, to: i.to, keywords: SEARCH_KEYWORDS[i.to] }))

function useOutsideClick(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onOutside])
  return ref
}

type AppLock = ReturnType<typeof useAppLock>
const SettingsContext = createContext<ScaleProps | null>(null)

/** The same settings as the profile menu, for the Profile page. */
export function ProfileSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) return null
  return (
    <div className="space-y-4">
      <SizePicker scale={ctx.scale} onScale={ctx.onScale} />
      <LocalePicker />
      <HideNumbersRow />
      <NotificationsRow />
      <SkinRow skin={ctx.skin} onSkin={ctx.onSkin} />
      <AppLockRow lock={ctx.lock} />
    </div>
  )
}

/** The owner's photo wherever an avatar is shown. */
function MeAvatar(props: { size: 'sm' | 'md' | 'lg'; className?: string }) {
  const { name, photo } = useProfile()
  return <Avatar name={name} src={photo} {...props} />
}
function MeName() {
  return <>{useProfile().name}</>
}
interface ScaleProps {
  scale: UiScaleId
  onScale: (id: UiScaleId) => void
  lock: AppLock
  skin: Skin
  onSkin: (s: Skin) => void
}

/** Push notifications on this device: card bills, deadlines and loss-limit alerts. */
function NotificationsRow() {
  const push = usePush()
  const [tested, setTested] = useState(false)
  if (!push.supported) return null
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={push.enabled}
        disabled={push.busy}
        onClick={() => (push.enabled ? push.disable() : push.enable())}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left"
      >
        <IconBadge icon={BellRing} seed="push" size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-text">Notifications</span>
          <span className="block truncate text-xs text-text-secondary">Bills, deadlines, loss limit</span>
        </span>
        <span className={cn('relative h-6 w-10 shrink-0 rounded-full transition-colors', push.enabled ? 'bg-accent' : 'bg-surface-15')}>
          <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', push.enabled ? 'translate-x-[18px]' : 'translate-x-0.5')} />
        </span>
      </button>
      {push.enabled && (
        <button
          type="button"
          onClick={async () => {
            await push.test().catch(() => {})
            setTested(true)
          }}
          className="px-1 text-xs font-medium text-accent"
        >
          {tested ? 'Test sent — check your notifications' : 'Send a test notification'}
        </button>
      )}
      {push.error && <p className="px-1 text-xs text-error">{push.error}</p>}
    </div>
  )
}

/** One switch for the whole app: every amount turns to stars (for opening the app in public). */
function HideNumbersRow() {
  const { hidden, toggle } = usePrivacy()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={hidden}
      onClick={toggle}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left"
    >
      <IconBadge icon={hidden ? EyeOff : Eye} seed="hide-numbers" size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-text">Hide numbers</span>
        <span className="block truncate text-xs text-text-secondary">Stars instead of amounts</span>
      </span>
      <span className={cn('relative h-6 w-10 shrink-0 rounded-full transition-colors', hidden ? 'bg-accent' : 'bg-surface-15')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', hidden ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </span>
    </button>
  )
}

/** Noir (monochrome, CRED-like) or the older gold look. */
function SkinRow({ skin, onSkin }: { skin: Skin; onSkin: (s: Skin) => void }) {
  const on = skin === 'noir'
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onSkin(on ? 'aurum' : 'noir')} className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left">
      <IconBadge icon={Gem} seed="skin" size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-text">Noir look</span>
        <span className="block truncate text-xs text-text-secondary">Monochrome, premium; off for gold</span>
      </span>
      <span className={cn('relative h-6 w-10 shrink-0 rounded-full transition-colors', on ? 'bg-accent' : 'bg-surface-15')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', on ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </span>
    </button>
  )
}

/** Turns the Face ID / fingerprint app lock on or off. Hidden on devices that can't do it. */
function AppLockRow({ lock }: { lock: AppLock }) {
  const [busy, setBusy] = useState(false)
  if (!lock.supported && !lock.enabled) return null
  return (
    <button
      type="button"
      role="switch"
      aria-checked={lock.enabled}
      disabled={busy}
      onClick={async () => {
        if (lock.enabled) return lock.disable()
        setBusy(true)
        await lock.enable()
        setBusy(false)
      }}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left"
    >
      <IconBadge icon={Fingerprint} seed="app-lock" size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-text">App lock</span>
        <span className="block truncate text-xs text-text-secondary">Face ID or fingerprint</span>
      </span>
      <span className={cn('relative h-6 w-10 shrink-0 rounded-full transition-colors', lock.enabled ? 'bg-accent' : 'bg-surface-15')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', lock.enabled ? 'left-[1.125rem]' : 'left-0.5')} />
      </span>
    </button>
  )
}

/** Covers the admin until the person passes Face ID / fingerprint. */
function LockScreen({ onUnlock }: { onUnlock: () => Promise<void> }) {
  useEffect(() => {
    void onUnlock()
  }, [onUnlock])
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-bg px-6 text-center">
      <IconBadge icon={Fingerprint} seed="app-lock" size="lg" className="h-20 w-20 rounded-3xl [&>svg]:h-10 [&>svg]:w-10" />
      <div>
        <p className="font-display text-xl font-semibold text-text">Vault locked</p>
        <p className="mt-1 text-sm text-text-secondary">Use Face ID or your fingerprint to continue.</p>
      </div>
      <button type="button" onClick={() => void onUnlock()} className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-black">
        Unlock
      </button>
    </div>
  )
}

function SizePicker({ scale, onScale }: Pick<ScaleProps, 'scale' | 'onScale'>) {
  return (
    <div>
      <p className="mb-2 px-1 text-2xs font-semibold uppercase tracking-wider text-text-secondary/70">Display size</p>
      <div role="radiogroup" aria-label="Display size" className="grid grid-cols-5 gap-1.5">
        {UI_SCALES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={scale === s.id}
            aria-label={s.label}
            onClick={() => onScale(s.id)}
            className={cn('btn-3d flex h-11 items-center justify-center rounded-xl border font-semibold transition-colors', scale === s.id ? 'border-text bg-text text-bg shadow-md ring-2 ring-accent/50 ring-offset-2 ring-offset-card' : 'border-border bg-surface-2 text-text-secondary')}
            style={{ fontSize: `${11 + i * 2.5}px` }}
          >
            A
          </button>
        ))}
      </div>
    </div>
  )
}

function ProfileMenu({ onLogout, scale, onScale, lock, skin, onSkin }: { onLogout: () => void } & ScaleProps) {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClick(() => setOpen(false))

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        data-cursor="hover"
        onClick={() => setOpen((v) => !v)}
        aria-label="Profile menu" className="btn-3d glitter flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 p-0.5 transition-colors hover:border-accent/40"
      >
        <MeAvatar size="sm" className="h-full w-full ring-0" />
      </button>
      <AnimatePresence>
        {open && (
        <motion.div initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ type: 'spring', stiffness: 520, damping: 34 }} style={{ transformOrigin: 'top right' }} className="absolute right-0 top-full z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <Link to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-3 border-b border-border px-4 py-3 hover:bg-surface-3">
            <MeAvatar size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-text"><MeName /></span>
              <span className="block text-xs text-accent">View profile</span>
            </span>
            <ChevronRight className="h-4 w-4 text-text-secondary" />
          </Link>
          <div className="space-y-3 border-b border-border p-3">
            <SizePicker scale={scale} onScale={onScale} />
            <LocalePicker />
            <HideNumbersRow />
            <NotificationsRow />
            <SkinRow skin={skin} onSkin={onSkin} />
            <AppLockRow lock={lock} />
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              openExternal(SITE_URL)
            }}
            className="flex w-full items-center px-4 py-2.5 text-left text-sm text-text-secondary hover:bg-surface-3 hover:text-text"
          >
            Visit Website
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              clearStoredToken()
              onLogout()
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-error hover:bg-error/10"
          >
            <LogOut className="h-3.5 w-3.5" />
            Log out
          </button>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}

const signed = (n: number) => `${n < 0 ? '-' : ''}${formatInr(Math.abs(n))}`
const ALERTED_KEY = 'admin_alerted'
const canNotify = () => typeof window !== 'undefined' && 'Notification' in window

// A desktop alert for each new warning, at most once per warning per day, while an admin tab is open.
function useDesktopAlerts(notices: Notice[]) {
  useEffect(() => {
    if (!canNotify() || Notification.permission !== 'granted') return
    const today = new Date().toISOString().slice(0, 10)
    let sent: Record<string, string> = {}
    try {
      sent = JSON.parse(localStorage.getItem(ALERTED_KEY) || '{}')
    } catch {
      sent = {}
    }
    let changed = false
    for (const n of notices) {
      if (n.tone === 'info' || sent[n.id] === today) continue
      new Notification(n.title, { body: n.detail, tag: n.id })
      sent[n.id] = today
      changed = true
    }
    if (changed) {
      try {
        localStorage.setItem(ALERTED_KEY, JSON.stringify(sent))
      } catch {
        // Alerts may repeat if storage is unavailable.
      }
    }
  }, [notices])
}

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClick(() => setOpen(false))
  const navigate = useNavigate()
  const { pulse, refresh } = useAdminPulse()
  const { visible, dismiss, restoreAll, count: hiddenCount } = useDismissedNotices()
  const notices = useMemo(() => visible(pulse ? noticesFrom(pulse, signed) : []), [pulse, visible])
  const urgent = notices.some((n) => n.tone !== 'info')
  const [permission, setPermission] = useState(() => (canNotify() ? Notification.permission : 'denied'))
  useDesktopAlerts(notices)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        data-cursor="hover"
        aria-label={notices.length ? `Notifications (${notices.length})` : 'Notifications'}
        aria-expanded={open}
        onClick={() => {
          if (!open) refresh()
          setOpen((v) => !v)
        }}
        className="btn-3d glitter relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-3 text-text-secondary transition-colors hover:border-accent/40 hover:text-text"
      >
        <Bell className="h-4 w-4" />
        {notices.length > 0 && (
          <span className={cn('absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-2xs font-bold text-white', urgent ? 'bg-error' : 'bg-accent')}>
            {notices.length}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
        <motion.div initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ type: 'spring', stiffness: 520, damping: 34 }} style={{ transformOrigin: 'top right' }} className="absolute right-0 top-full z-20 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          {notices.length === 0 ? (
            <p className="p-4 text-center text-sm text-text-secondary">You&apos;re all caught up.</p>
          ) : (
            <ul className="divide-y divide-border">
              {notices.map((n) => (
                <li key={n.id} className="flex items-start">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      navigate(n.to)
                    }}
                    className="flex min-w-0 flex-1 items-start gap-2.5 py-3 pl-4 pr-1 text-left hover:bg-surface-3"
                  >
                    <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', n.tone === 'bad' ? 'text-error' : n.tone === 'warn' ? 'text-amber-500' : 'text-accent')} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-text">{n.title}</span>
                      <span className="block text-xs text-text-secondary">{n.detail}</span>
                    </span>
                  </button>
                  <button type="button" onClick={() => dismiss(n)} aria-label={`Dismiss: ${n.title}`} className="m-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-surface-5 hover:text-text">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hiddenCount > 0 && (
            <button type="button" onClick={restoreAll} className="w-full border-t border-border px-4 py-2.5 text-left text-xs text-text-secondary hover:bg-surface-3 hover:text-text">
              Show {hiddenCount} dismissed alert{hiddenCount === 1 ? '' : 's'} again
            </button>
          )}
          {permission === 'default' && (
            <button
              type="button"
              onClick={() => void Notification.requestPermission().then(setPermission)}
              className="w-full border-t border-border px-4 py-2.5 text-left text-xs font-medium text-accent hover:bg-surface-3"
            >
              Turn on desktop alerts for losses and due EMIs
            </button>
          )}
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}

// Every menu item gets its own colour, so no two tiles in a sheet look alike.
assignColors(NAV_SECTIONS.flatMap((sec) => sec.items).map((i) => i.to))

// Phone tabs: Finance opens Spending + Wealth & debt, Trading opens the trading tools, More holds everything else
// (Daily first).
const FINANCE_SECTIONS = NAV_SECTIONS.filter((sec) => sec.k === 'nav.money' || sec.k === 'nav.wealth')
const TRADING_SECTION = NAV_SECTIONS.find((sec) => sec.k === 'nav.trading')!
const MORE_SECTIONS = NAV_SECTIONS.filter((sec) => !sec.k || !['nav.money', 'nav.wealth', 'nav.trading'].includes(sec.k))

const tap = () => haptic(8)
/** A bottom-tab or menu-sheet jump: fade the next screen in instead of sliding it. */
const tabTap = () => {
  haptic(8)
  markTabNavigation()
}

/** Native-app style navigation for phones: five tabs, with sheets for Finance and everything else. */
function MobileTabBar({ onLogout, scale, onScale, lock, skin, onSkin }: { onLogout: () => void } & ScaleProps) {
  const t = useT()
  const { pathname } = useLocation()
  const [sheet, setSheet] = useState<null | 'finance' | 'trading' | 'more'>(null)
  // Only the grab handle drags the sheet closed, so swiping inside it scrolls the list as normal.
  const dragControls = useDragControls()
  useEffect(() => setSheet(null), [pathname])

  const inFinance = FINANCE_SECTIONS.some((sec) => sec.items.some((i) => pathname.startsWith(i.to)))
  const inTrading = TRADING_SECTION.items.some((i) => pathname.startsWith(i.to))
  const tab = (active: boolean) =>
    cn('flex flex-1 select-none flex-col items-center gap-0.5 py-2 text-2xs font-medium transition-[transform,color] duration-150 active:scale-90', active ? 'text-accent' : 'text-text-secondary')
  const link = (to: string, label: string, Icon: typeof LayoutDashboard, end = false) => (
    <NavLink to={to} end={end} onClick={tabTap} className={({ isActive }) => tab(isActive && !sheet)}>
      <Icon className="h-5 w-5" />
      {label}
    </NavLink>
  )
  const sections = sheet === 'finance' ? FINANCE_SECTIONS : sheet === 'trading' ? [TRADING_SECTION] : MORE_SECTIONS

  return (
    <div className="lg:hidden">
      <AnimatePresence>
        {sheet && (
          <>
            <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/60" onClick={() => setSheet(null)} />
            <motion.div
              key="sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 320 }}
              drag="y"
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 90 || info.velocity.y > 500) setSheet(null)
              }}
              className="nav-sheet fixed inset-x-0 bottom-0 z-50 max-h-[86vh] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-border bg-card px-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-3"
            >
              <div onPointerDown={(e) => dragControls.start(e)} className="-mx-4 -mt-3 mb-1 flex cursor-grab touch-none justify-center px-4 pb-4 pt-3">
                <div className="h-1 w-10 rounded-full bg-surface-15" />
              </div>
              {sheet === 'more' && (
                <div className="mb-6 flex items-center gap-4 border-b border-border pb-6 pt-2">
                  <MeAvatar size="lg" className="h-16 w-16" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-semibold uppercase tracking-wide text-text"><MeName /></p>
                    <p className="text-sm text-text-secondary">administrator · private vault</p>
                  </div>
                </div>
              )}
              {sections.map((section, idx) => (
                <div key={section.label ?? idx} className="mb-7">
                  {section.k && <p className="mb-4 px-1 text-[11px] font-bold uppercase tracking-[0.2em] text-text-secondary">{t(section.k)}</p>}
                  <div className="grid grid-cols-4 gap-x-2 gap-y-5">
                    {section.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/'}
                        onClick={markTabNavigation}
                        className={({ isActive }) => cn('group flex flex-col items-center gap-2 text-center text-[11px] leading-tight', isActive ? 'text-accent' : 'text-text')}
                      >
                        {({ isActive }) => (
                          <>
                            <span className={cn('flex h-14 w-14 items-center justify-center rounded-full border transition-transform duration-150 group-active:scale-90', isActive ? 'border-accent bg-surface-3' : 'border-border')}>
                              <item.icon className="h-[22px] w-[22px]" strokeWidth={1.5} />
                            </span>
                            <span>{t(item.k)}</span>
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}
              {sheet === 'more' && (
                <div className="mb-4 space-y-3">
                  <p className="px-1 pt-2 text-[11px] font-bold uppercase tracking-[0.2em] text-text-secondary">Settings</p>
                  <SizePicker scale={scale} onScale={onScale} />
                  <LocalePicker />
                  <HideNumbersRow />
                  <NotificationsRow />
                  <SkinRow skin={skin} onSkin={onSkin} />
                  <AppLockRow lock={lock} />
                </div>
              )}
              {sheet === 'more' && (
                <div className="grid grid-cols-2 gap-2.5">
                  <button type="button" onClick={() => openExternal(SITE_URL)} className="rounded-2xl border border-border bg-surface-2 py-3 text-xs font-medium text-text">
                    Visit Website
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearStoredToken()
                      onLogout()
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-2xl border border-border bg-surface-2 py-3 text-xs font-medium text-error"
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-[60] flex border-t border-border bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        {link('/', t('nav.home'), LayoutDashboard, true)}
        <button type="button" onClick={() => {
            tap()
            setSheet(sheet === 'finance' ? null : 'finance')
          }} className={tab(sheet === 'finance' || (!sheet && inFinance))}>
          <Wallet className="h-5 w-5" />
          {t('nav.finance')}
        </button>
        <NavLink to="/chat" onClick={tabTap} aria-label="Ask AI" className="relative flex flex-1 select-none flex-col items-center justify-end pb-1.5 pt-2 text-[10px] font-medium">
          {({ isActive }) => (
            <>
              <span className={cn('tab-orb -mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400 text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-4px_6px_rgba(0,0,0,0.25),0_12px_22px_-4px_rgba(217,70,239,0.6)] ring-4 ring-bg transition-transform duration-150 active:scale-90', isActive && !sheet && 'scale-105')}>
                <Sparkles className="h-6 w-6" />
              </span>
              <span className={cn('mt-0.5', isActive && !sheet ? 'text-accent' : 'text-text-secondary')}>{t('nav.askAi')}</span>
            </>
          )}
        </NavLink>
        <button
          type="button"
          onClick={() => {
            tap()
            setSheet(sheet === 'trading' ? null : 'trading')
          }}
          className={tab(sheet === 'trading' || (!sheet && inTrading))}
        >
          <TrendingUp className="h-5 w-5" />
          {t('nav.trading')}
        </button>
        <button type="button" onClick={() => {
            tap()
            setSheet(sheet === 'more' ? null : 'more')
          }} className={tab(sheet === 'more')}>
          <LayoutGrid className="h-5 w-5" />
          {t('nav.more')}
        </button>
      </nav>
    </div>
  )
}

export function AdminShell({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  // After a few idle minutes the numbers turn to stars. Signing in lasts 30 days, so this never signs out.
  useIdleLock(() => {}, { lockAfter: Infinity })
  const t = useT()
  // Changing region or currency remounts the page, so figures formatted outside React pick up the new settings too.
  const { version: localeVersion } = useLocale()
  const { pathname } = useLocation()
  const { scale, setScale } = useUiScale()
  const lock = useAppLock()
  const online = useOnline()
  const navigate = useNavigate()
  useNativePushTaps(navigate)
  // Bumping the key remounts the page, so it fetches fresh data: that is what pull-to-refresh does.
  const [refreshKey, setRefreshKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const refresh = useCallback(() => {
    if (!navigator.onLine) return
    setRefreshing(true)
    setRefreshKey((k) => k + 1)
    window.setTimeout(() => setRefreshing(false), 900)
  }, [])
  const back = useCallback(() => navigate(-1), [navigate])
  const pull = useTouchGestures({ onRefresh: refresh, onBack: back })

  useNativeFeel()
  const { skin, setSkin } = useSkin()
  const direction = useNavDirection()
  const isPhone = typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
  const motionFor = isPhone ? SLIDE[direction] : SLIDE.tab

  // The Aurum design system is scoped to html.admin, so the public site keeps its own look.
  useEffect(() => {
    document.documentElement.classList.add('admin')
    return () => document.documentElement.classList.remove('admin')
  }, [])

  return (
    <SettingsContext.Provider value={{ scale, onScale: setScale, lock, skin, onSkin: setSkin }}>
    <div className="touch-app relative min-h-screen bg-bg">
      <div className="aurum-backdrop" aria-hidden />
      {skin === 'noir' && <NoirSplash />}
      {lock.enabled && lock.locked && <LockScreen onUnlock={lock.unlock} />}
      {!online && (
        <div role="status" className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black">
          <WifiOff className="h-3.5 w-3.5" /> You are offline. Showing the last saved data.
        </div>
      )}
      {(pull > 0 || refreshing) && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center lg:hidden" style={{ transform: `translateY(${refreshing ? 24 : pull * 40}px)`, opacity: refreshing ? 1 : pull }}>
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card shadow-lg">
            {refreshing ? <Loader2 className="h-5 w-5 animate-spin text-accent" /> : <ArrowDown className={cn('h-5 w-5 text-accent transition-transform', pull >= 1 && 'rotate-180')} />}
          </span>
        </div>
      )}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-card/85 backdrop-blur-xl lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-border px-5">
          <Link to="/" aria-label="Home">
            <Logo />
          </Link>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {NAV_SECTIONS.map((section, idx) => (
            <div key={section.label ?? `section-${idx}`}>
              {section.k && (
                <p className="mb-2 px-3 text-2xs font-semibold uppercase tracking-wider text-text-secondary/70">
                  {t(section.k)}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive ? 'text-accent' : 'text-text-secondary hover:bg-surface-3 hover:text-text',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          // One highlight that glides between items as you move through the menu.
                          <motion.span
                            layoutId="aurum-nav-active"
                            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                            className="absolute inset-0 rounded-xl border border-accent/25 bg-accent/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                          />
                        )}
                        <IconBadge icon={item.icon} seed={item.to} size="sm" className="relative" />
                        <span className="relative line-clamp-2 leading-tight">{t(item.k)}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-border p-4">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5">
            <MeAvatar size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text"><MeName /></p>
              <p className="flex items-center gap-1 text-xs text-text-secondary">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Administrator
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="relative z-[1] lg:pl-64">
        <header className="aurum-header glitter sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-bg/75 px-5 backdrop-blur-md sm:px-8 lg:px-10">
{skin === 'noir' && pathname === '/' ? <CoinPill /> : <HeaderTitle />}
          <GlobalSearch pages={SEARCH_PAGES} />

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle simple={skin === 'noir'} className={skin === 'noir' && pathname === '/' ? 'hidden sm:flex' : undefined} />
            <NotificationBell />
            <ProfileMenu onLogout={onLogout} scale={scale} onScale={setScale} lock={lock} skin={skin} onSkin={setSkin} />
          </div>
        </header>

        <motion.main key={`${pathname}-${refreshKey}-${localeVersion}`} initial={motionFor.initial} animate={motionFor.animate} transition={isPhone && direction !== 'tab' ? { duration: 0.4, ease: [0.05, 0.7, 0.1, 1] } : { duration: 0.25, ease: [0.2, 0, 0, 1] }} onAnimationComplete={() => {
            // A leftover transform would make <main> the frame for every fixed overlay inside a page (sheets would sit
            // behind the tab bar and shrink to the content column), so clear it once the entrance is done.
            const el = document.querySelector<HTMLElement>('main.aurum-page')
            if (el) el.style.transform = 'none'
          }}
          className="aurum-page overflow-x-clip space-y-6 px-5 py-6 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:px-8 sm:pt-8 lg:px-10 lg:pb-10">
          {children}
        </motion.main>
      </div>
      <MobileTabBar onLogout={onLogout} scale={scale} onScale={setScale} lock={lock} skin={skin} onSkin={setSkin} />
    </div>
    </SettingsContext.Provider>
  )
}

function PageBadgeInner() {
  const { pathname } = useLocation()
  const item = NAV_SECTIONS.flatMap((sec) => sec.items).find((i) => (i.to === '/' ? pathname === '/' : pathname.startsWith(i.to)))
  return item ? <IconBadge icon={item.icon} seed={item.to} size="lg" className="mt-0.5" /> : null
}

/** Phone-only: the logo and the current page's name fill the left of the top bar. */
function HeaderTitle() {
  return useInRouterContext() ? <HeaderTitleInner /> : null
}
function HeaderTitleInner() {
  const { pathname } = useLocation()
  // Large title in the page, compact title in the bar once it scrolls away — the Android/iOS "large title" pattern.
  const title = useTitleScrolledAway(pathname)
  return (
    <div className="relative flex min-w-0 items-center gap-2.5 lg:hidden">
      <Link to="/" aria-label="Home" className="shrink-0">
        <Logo showName={false} />
      </Link>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={title ?? 'brand'}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.18 }}
          className="truncate font-display text-base font-semibold text-text"
        >
          {title ?? personal.brand}
        </motion.span>
      </AnimatePresence>
    </div>
  )
}

/** Phone home only: a gold pill in the top bar with a slow marquee of what matters today (CRED's coin pill). */
function CoinPill() {
  const navigate = useNavigate()
  const { pulse } = useAdminPulse()
  const { visible } = useDismissedNotices()
  const cal = useGrowthDoc('calendar')
  const water = useGrowthDoc('water')
  const tasks = useGrowthDoc('tasks')
  const reminders = useGrowthDoc('reminders')
  // The day at a glance: Tamil date and festival, Rahu kalam, the next good time and your palan.
  const sky = useMemo(() => {
    const today = todayStr()
    const place = placeOf(cal.value.place)
    const shift = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
    const f = dayFacts(today, place)
    const div = dayDivisions(today, place)
    return { f, div, specials: specialsFor(f, dayFacts(shift(-1), place), dayFacts(shift(1), place)), good: nallaNeram(div) }
  }, [cal.value.place])
  const items = useMemo(() => {
    const out: string[] = []
    const today = todayStr()
    const now = new Date()
    out.push(`${sky.f.tamil.monthName} ${sky.f.tamil.day}${sky.specials.length ? ` · ${sky.specials.map((x) => x.name).join(', ')}` : ''}`)
    if (now < sky.div.rahu.end) out.push(`Rahu ${istTime(sky.div.rahu.start)}–${istTime(sky.div.rahu.end)}`)
    const nextGood = sky.good.find((g) => g.end > now)
    if (nextGood) out.push(`Good time ${istTime(nextGood.start)}–${istTime(nextGood.end)}`)
    if (cal.value.rasi >= 0) {
      const p = rasiPalan(cal.value.rasi, cal.value.star, sky.f)
      out.push(p.chandrashtamam ? 'Chandrashtamam — go slow' : `Palan ${'★'.repeat(p.score)}`)
    }
    const target = water.value.customMl || water.value.targetMl
    if (target) out.push(`Water ${((water.value.logs[today] || 0) / 1000).toFixed(1)}/${(target / 1000).toFixed(1)} L`)
    const open = tasks.value.tasks.filter((t) => t.when === 'today' && !t.done).length
    if (open) out.push(`${open} task${open === 1 ? '' : 's'} today`)
    const rem = reminders.value.items.filter((r) => !r.done && r.date <= today).sort((a, b) => a.hour - b.hour)[0]
    if (rem) out.push(`⏰ ${rem.title}`)
    if (pulse?.todayPnl != null) out.push(`Today ${signed(pulse.todayPnl)}`)
    if (pulse?.nextEmi) out.push(`EMI ${formatInr(pulse.nextEmi.amount)} ${pulse.nextEmi.days === 0 ? 'today' : `in ${pulse.nextEmi.days}d`}`)
    if (pulse?.monthPnl != null) out.push(`Month ${signed(pulse.monthPnl)}`)
    for (const n of pulse ? visible(noticesFrom(pulse, signed)).slice(0, 3) : []) out.push(n.title)
    return out.length ? out : [personal.brand]
  }, [pulse, visible, sky, cal.value, water.value, tasks.value, reminders.value])
  const text = items.join('   ·   ')
  return (
    <button type="button" onClick={() => navigate('/today')} className="noir-coin-pill relative flex h-10 min-w-0 max-w-[15rem] flex-1 items-center gap-2 overflow-hidden rounded-full pl-1.5 pr-3 lg:hidden" aria-label={text}>
      <img src={tmLogo} alt="" aria-hidden="true" className="h-7 w-7 shrink-0 rounded-full" width={28} height={28} />
      <span className="relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
        <span className="noir-marquee text-sm font-semibold" aria-hidden>
          <span className="pr-8">{text}</span>
          <span className="pr-8">{text}</span>
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
    </button>
  )
}

/** The coloured icon tile shown beside a page's title, matched to the page from the menu. */
export function PageBadge() {
  return useInRouterContext() ? <PageBadgeInner /> : null
}
