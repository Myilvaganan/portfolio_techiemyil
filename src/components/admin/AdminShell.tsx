import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { NavLink, useInRouterContext, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import { AlertTriangle, Bell, Handshake, Sparkles, Home, LineChart, PiggyBank, ShieldCheck, Target, Waves, Calculator, FolderOpen, Globe, LayoutDashboard, LogOut, LayoutGrid, Wallet, Wrench, Fingerprint, WifiOff, Loader2, ArrowDown, PieChart, Scale, TrendingUp, BarChart3, Landmark, CreditCard, HandCoins, NotebookPen, HeartPulse, ReceiptText } from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import { personal } from '@/data/personal'
import { Avatar, IconBadge, assignColors } from '@/components/ui/Avatar'
import profilePhoto from '@/assets/images/profile.jpg'
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

interface NavItem {
  label: string
  to: string
  icon: typeof LayoutDashboard
}

interface NavSection {
  label?: string
  items: NavItem[]
}

const SEARCH_KEYWORDS: Record<string, string> = {
  '/admin/loans': 'emi prepay foreclosure',
  '/admin/trading-journal': 'mt5 forex options calendar',
  '/admin/health-report': 'inbody weight fat body',
  '/admin/household': 'rent electricity bescom tangedco petrol bike zomato swiggy rapido ola instamart amazon appusamy visalakshi',
  '/admin/tax': 'itr income tax return tds advance tax refund 80c 80d hra form 16 26as ais capital gains regime',
  '/admin/net-worth': 'assets liabilities wealth',
  '/admin/budgets': 'budget limit category overspend rules family',
  '/admin/cash-flow': 'income savings runway burn projection',
  '/admin/lending': 'lend loan owed friend borrowed money receivable emi split pass through',
  '/admin/chat': 'ask question assistant chatbot ai answer',
  '/admin/goals': 'goal target house bike emergency fund savings',
  '/admin/investments': 'returns sip capital gains deductions 80c reminders itr',
  '/admin/security': '2fa two factor authenticator password login',
  '/admin/site': 'messages contact analytics visitors',
  '/admin/credit-cards': 'card spend',
  '/admin/bank-statements': 'bank spend transactions',
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: 'Dashboard', to: '/admin', icon: LayoutDashboard },
      { label: 'Ask My Data', to: '/admin/chat', icon: Sparkles },
      { label: 'Website', to: '/admin/site', icon: Globe },
      { label: 'Security', to: '/admin/security', icon: ShieldCheck },
    ],
  },
  {
    label: 'Documents',
    items: [{ label: 'Document Manager', to: '/admin/documents', icon: FolderOpen }],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Bank Statements', to: '/admin/bank-statements', icon: Landmark },
      { label: 'Credit Cards', to: '/admin/credit-cards', icon: CreditCard },
      { label: 'Loans', to: '/admin/loans', icon: HandCoins },
      { label: 'Household', to: '/admin/household', icon: Home },
      { label: 'Tax Information', to: '/admin/tax', icon: ReceiptText },
      { label: 'Budgets', to: '/admin/budgets', icon: PiggyBank },
      { label: 'Cash Flow', to: '/admin/cash-flow', icon: Waves },
      { label: 'Net Worth', to: '/admin/net-worth', icon: Scale },
      { label: 'Lending', to: '/admin/lending', icon: Handshake },
      { label: 'Goals', to: '/admin/goals', icon: Target },
      { label: 'Investments', to: '/admin/investments', icon: LineChart },
    ],
  },
  {
    label: 'Health',
    items: [{ label: 'Health Report', to: '/admin/health-report', icon: HeartPulse }],
  },
  {
    label: 'Tools',
    items: [
      { label: 'Margin Calculator', to: '/admin/margin-calculator', icon: Calculator },
      { label: 'Portfolio Rebalance', to: '/admin/portfolio-rebalance', icon: PieChart },
      { label: 'Zerodha Dashboard', to: '/admin/zerodha', icon: TrendingUp },
      { label: 'Options Analytics', to: '/admin/options-analytics', icon: BarChart3 },
      { label: 'Trading Journal', to: '/admin/trading-journal', icon: NotebookPen },
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
interface ScaleProps {
  scale: UiScaleId
  onScale: (id: UiScaleId) => void
  lock: AppLock
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
      <div role="radiogroup" aria-label="Display size" className="grid grid-cols-4 gap-1.5">
        {UI_SCALES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={scale === s.id}
            aria-label={s.label}
            onClick={() => onScale(s.id)}
            className={cn('btn-3d flex h-11 items-center justify-center rounded-xl border font-semibold transition-colors', scale === s.id ? 'border-accent/40 bg-accent/15 text-accent' : 'border-border bg-surface-2 text-text')}
            style={{ fontSize: `${12 + i * 2.5}px` }}
          >
            A
          </button>
        ))}
      </div>
    </div>
  )
}

function ProfileMenu({ onLogout, scale, onScale, lock }: { onLogout: () => void } & ScaleProps) {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClick(() => setOpen(false))
  const navigate = useNavigate()

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        data-cursor="hover"
        onClick={() => setOpen((v) => !v)}
        aria-label="Profile menu" className="btn-3d glitter flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 p-0.5 transition-colors hover:border-accent/40"
      >
        <Avatar name={personal.brand} src={profilePhoto} size="sm" className="h-full w-full ring-0" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium text-text">{personal.brand}</p>
            <p className="text-xs text-text-secondary">Administrator</p>
          </div>
          <div className="space-y-3 border-b border-border p-3">
            <SizePicker scale={scale} onScale={onScale} />
            <AppLockRow lock={lock} />
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              navigate('/')
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
        </div>
      )}
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
  const notices = useMemo(() => (pulse ? noticesFrom(pulse, signed) : []), [pulse])
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
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          {notices.length === 0 ? (
            <p className="p-4 text-center text-sm text-text-secondary">You&apos;re all caught up.</p>
          ) : (
            <ul className="divide-y divide-border">
              {notices.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      navigate(n.to)
                    }}
                    className="flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-surface-3"
                  >
                    <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', n.tone === 'bad' ? 'text-error' : n.tone === 'warn' ? 'text-amber-500' : 'text-accent')} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-text">{n.title}</span>
                      <span className="block text-xs text-text-secondary">{n.detail}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
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
        </div>
      )}
    </div>
  )
}

// Every menu item gets its own colour, so no two tiles in a sheet look alike.
assignColors(NAV_SECTIONS.flatMap((sec) => sec.items).map((i) => i.to))

const FINANCE_SECTION = NAV_SECTIONS.find((sec) => sec.label === 'Finance')!
const TOOLS_SECTION = NAV_SECTIONS.find((sec) => sec.label === 'Tools')!
const MORE_SECTIONS = NAV_SECTIONS.filter((sec) => sec.label !== 'Finance' && sec.label !== 'Tools')

const tap = () => {
  try {
    navigator.vibrate?.(8)
  } catch {
    /* haptics are optional */
  }
}

/** Native-app style navigation for phones: five tabs, with sheets for Finance and everything else. */
function MobileTabBar({ onLogout, scale, onScale, lock }: { onLogout: () => void } & ScaleProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [sheet, setSheet] = useState<null | 'finance' | 'tools' | 'more'>(null)
  // Only the grab handle drags the sheet closed, so swiping inside it scrolls the list as normal.
  const dragControls = useDragControls()
  useEffect(() => setSheet(null), [pathname])

  const inFinance = FINANCE_SECTION.items.some((i) => pathname.startsWith(i.to))
  const inTools = TOOLS_SECTION.items.some((i) => pathname.startsWith(i.to))
  const tab = (active: boolean) =>
    cn('flex flex-1 select-none flex-col items-center gap-0.5 py-2 text-2xs font-medium transition-[transform,color] duration-150 active:scale-90', active ? 'text-accent' : 'text-text-secondary')
  const link = (to: string, label: string, Icon: typeof LayoutDashboard, end = false) => (
    <NavLink to={to} end={end} onClick={tap} className={({ isActive }) => tab(isActive && !sheet)}>
      <Icon className="h-5 w-5" />
      {label}
    </NavLink>
  )
  const sections = sheet === 'finance' ? [FINANCE_SECTION] : sheet === 'tools' ? [TOOLS_SECTION] : MORE_SECTIONS

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
              className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-border bg-card px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-3"
            >
              <div onPointerDown={(e) => dragControls.start(e)} className="-mx-4 -mt-3 mb-1 flex cursor-grab touch-none justify-center px-4 pb-4 pt-3">
                <div className="h-1 w-10 rounded-full bg-surface-15" />
              </div>
              {sections.map((section, idx) => (
                <div key={section.label ?? idx} className="mb-4">
                  {section.label && sheet === 'more' && <p className="mb-2 px-1 text-2xs font-semibold uppercase tracking-wider text-text-secondary/70">{section.label}</p>}
                  <div className="grid grid-cols-3 gap-2.5">
                    {section.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/admin'}
                        className={({ isActive }) =>
                          cn('btn-3d flex flex-col items-center gap-2 rounded-2xl border border-border px-2 py-3.5 text-center text-xs font-medium transition-transform duration-150 active:scale-95', isActive ? 'border-accent/40 bg-accent/15 text-accent' : 'bg-surface-2 text-text')
                        }
                      >
                        <IconBadge icon={item.icon} seed={item.to} size="md" />
                        <span className="leading-tight">{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}
              {sheet === 'more' && (
                <div className="mb-4 space-y-3">
                  <SizePicker scale={scale} onScale={onScale} />
                  <AppLockRow lock={lock} />
                </div>
              )}
              {sheet === 'more' && (
                <div className="grid grid-cols-2 gap-2.5">
                  <button type="button" onClick={() => navigate('/')} className="rounded-2xl border border-border bg-surface-2 py-3 text-xs font-medium text-text">
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
        {link('/admin', 'Home', LayoutDashboard, true)}
        <button type="button" onClick={() => {
            tap()
            setSheet(sheet === 'finance' ? null : 'finance')
          }} className={tab(sheet === 'finance' || (!sheet && inFinance))}>
          <Wallet className="h-5 w-5" />
          Finance
        </button>
        <NavLink to="/admin/chat" onClick={tap} aria-label="Ask AI" className="relative flex flex-1 select-none flex-col items-center justify-end pb-1.5 pt-2 text-[10px] font-medium">
          {({ isActive }) => (
            <>
              <span className={cn('-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400 text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-4px_6px_rgba(0,0,0,0.25),0_12px_22px_-4px_rgba(217,70,239,0.6)] ring-4 ring-bg transition-transform duration-150 active:scale-90', isActive && !sheet && 'scale-105')}>
                <Sparkles className="h-6 w-6" />
              </span>
              <span className={cn('mt-0.5', isActive && !sheet ? 'text-accent' : 'text-text-secondary')}>Ask AI</span>
            </>
          )}
        </NavLink>
        <button
          type="button"
          onClick={() => {
            tap()
            setSheet(sheet === 'tools' ? null : 'tools')
          }}
          className={tab(sheet === 'tools' || (!sheet && inTools))}
        >
          <Wrench className="h-5 w-5" />
          Tools
        </button>
        <button type="button" onClick={() => {
            tap()
            setSheet(sheet === 'more' ? null : 'more')
          }} className={tab(sheet === 'more')}>
          <LayoutGrid className="h-5 w-5" />
          More
        </button>
      </nav>
    </div>
  )
}

export function AdminShell({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  // After a few idle minutes the numbers turn to stars. Signing in lasts 30 days, so this never signs out.
  useIdleLock(() => {}, { lockAfter: Infinity })
  const { pathname } = useLocation()
  const { scale, setScale } = useUiScale()
  const lock = useAppLock()
  const online = useOnline()
  const navigate = useNavigate()
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

  return (
    <div className="touch-app min-h-screen bg-bg">
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
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-border px-5">
          <Logo />
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {NAV_SECTIONS.map((section, idx) => (
            <div key={section.label ?? `section-${idx}`}>
              {section.label && (
                <p className="mb-2 px-3 text-2xs font-semibold uppercase tracking-wider text-text-secondary/70">
                  {section.label}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/admin'}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-accent/15 text-accent'
                          : 'text-text-secondary hover:bg-surface-3 hover:text-text',
                      )
                    }
                  >
                    <IconBadge icon={item.icon} seed={item.to} size="sm" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-border p-4">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5">
            <Avatar name={personal.brand} src={profilePhoto} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text">{personal.brand}</p>
              <p className="flex items-center gap-1 text-xs text-text-secondary">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Administrator
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="glitter sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-bg/80 px-5 backdrop-blur-md sm:px-8 lg:px-10">
<HeaderTitle />
          <GlobalSearch pages={SEARCH_PAGES} />

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <NotificationBell />
            <ProfileMenu onLogout={onLogout} scale={scale} onScale={setScale} lock={lock} />
          </div>
        </header>

        <motion.main key={`${pathname}-${refreshKey}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }} className="space-y-6 px-5 py-6 pb-32 sm:px-8 sm:py-8 lg:px-10 lg:pb-10">
          {children}
        </motion.main>
      </div>
      <MobileTabBar onLogout={onLogout} scale={scale} onScale={setScale} lock={lock} />
    </div>
  )
}

function PageBadgeInner() {
  const { pathname } = useLocation()
  const item = NAV_SECTIONS.flatMap((sec) => sec.items).find((i) => (i.to === '/admin' ? pathname === '/admin' : pathname.startsWith(i.to)))
  return item ? <IconBadge icon={item.icon} seed={item.to} size="lg" className="mt-0.5" /> : null
}

/** Phone-only: the logo and the current page's name fill the left of the top bar. */
function HeaderTitle() {
  return useInRouterContext() ? <HeaderTitleInner /> : null
}
function HeaderTitleInner() {
  return (
    <div className="flex min-w-0 items-center gap-2.5 lg:hidden">
      <Logo showName={false} />
      <span className="truncate font-display text-base font-semibold text-text sm:hidden">{personal.brand}</span>
    </div>
  )
}

/** The coloured icon tile shown beside a page's title, matched to the page from the menu. */
export function PageBadge() {
  return useInRouterContext() ? <PageBadgeInner /> : null
}
