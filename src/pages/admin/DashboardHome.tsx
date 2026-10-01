import { useEffect, useState } from 'react'
import { TodayCard } from '@/components/admin/TodayCard'
import { NAV_SECTIONS } from '@/components/admin/AdminShell'
import { SITE_URL, openExternal } from '@/lib/host'
import { useProfile } from '@/lib/profile'
import { CinemaBanner, NoirTitle, type CinemaSlide } from '@/components/admin/Cinema'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ChevronRight, X, BarChart3, CalendarClock, DatabaseBackup, ExternalLink, Eye, HardDrive, HeartPulse, Loader2, TrendingUp, Wallet } from 'lucide-react'
import { listDocuments, type VaultDocument } from '@/lib/adminVault'
import { formatInr } from '@/lib/kite'
import { cn } from '@/lib/utils'
import { downloadBackup } from '@/lib/platformApi'
import { noticesFrom } from '@/lib/pulse'
import { useAdminPulse } from '@/hooks/useAdminPulse'
import { useDismissedNotices } from '@/lib/dismissed'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`
}


const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${formatInr(Math.abs(n))}`
const toneOf = (n: number | null) => (n === null || n === 0 ? 'text-text' : n > 0 ? 'text-positive' : 'text-error')

function greetingFor(hour: number) {
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  if (hour >= 17 && hour < 21) return 'Good evening'
  return hour >= 21 ? 'Good night' : 'Working late'
}

/** A section label in spaced capitals, with an optional "view all" link on the right (CRED style). */
function SectionLabel({ children, action, onAction }: { children: string; action?: string; onAction?: () => void }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="noir-eyebrow !font-sans !text-xs !font-bold !tracking-[0.2em]">{children}</h2>
      {action && (
        <button type="button" onClick={onAction} className="flex items-center gap-0.5 text-sm text-text-secondary transition-colors hover:text-text">
          {action}
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

/** One card in the Money Matters rail: a thin icon, a spaced-capitals label, and the figure with a chevron. */
function MoneyCard({ label, value, sub, icon: Icon, valueClass, onClick }: { label: string; value: string; sub?: string; icon: typeof HardDrive; valueClass?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-[46%] min-w-[150px] max-w-[220px] flex-col justify-between rounded-[18px] border border-border bg-card p-4 text-left transition-[transform,border-color] duration-200 hover:border-text/30 active:scale-[0.97]"
    >
      <Icon className="h-6 w-6 text-text" strokeWidth={1.5} />
      <span className="mt-8 block">
        <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">{label}</span>
        <span className={cn('mt-1 flex items-center gap-1 text-lg font-semibold text-text', valueClass)}>
          <span className="truncate">{value}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-text-secondary" />
        </span>
        {sub && <span className="mt-0.5 block truncate text-xs text-text-secondary">{sub}</span>}
      </span>
    </button>
  )
}

/** A row like CRED's profile list: label on the left, value and an arrow on the right. */
function ListRow({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="flex w-full items-center gap-3 border-b border-border py-4 text-left last:border-b-0">
      <span className="flex-1 text-[15px] text-text">{label}</span>
      <span className="text-[15px] font-medium text-text">{value}</span>
      {onClick && <ChevronRight className="h-4 w-4 text-text-secondary" />}
    </button>
  )
}

export function DashboardHome() {
  const [documents, setDocuments] = useState<VaultDocument[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const { pulse } = useAdminPulse()
  const [backingUp, setBackingUp] = useState(false)
  const [backupNote, setBackupNote] = useState('')
  const { visible, dismiss } = useDismissedNotices()
  const notices = visible(pulse ? noticesFrom(pulse, signed) : [])

  async function backup() {
    setBackingUp(true)
    setBackupNote('')
    try {
      const b = await downloadBackup()
      setBackupNote(`Saved ${Object.keys(b.files).length} data files and a list of ${b.documents.length} documents. Older versions of every file are also kept in the vault for 90 days.`)
    } catch (e) {
      setBackupNote((e as Error).message)
    } finally {
      setBackingUp(false)
    }
  }

  useEffect(() => {
    listDocuments()
      .then(setDocuments)
      .catch(() => setDocuments([]))
      .finally(() => setLoading(false))
  }, [])

  const totalSize = documents.reduce((sum, doc) => sum + doc.size, 0)
  const categories = new Set(documents.map((doc) => doc.tag)).size
  const thisMonth = documents.filter((doc) => {
    if (!doc.lastModified) return false
    const d = new Date(doc.lastModified)
    const now = new Date()
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }).length

  const now = new Date()
  const { firstName } = useProfile()
  const lead = notices.find((n) => n.tone !== 'info') ?? notices[0]

  // The banner plays today's highlights as a short film.
  const slides: CinemaSlide[] = [{ eyebrow: now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }), title: 'Introducing today', to: '/monthly-review' }]
  if (pulse?.todayPnl != null) slides.push({ eyebrow: "Today's P&L", title: signed(pulse.todayPnl), sub: `${pulse.todayTrades} trade${pulse.todayTrades === 1 ? '' : 's'} across all books`, to: '/trading-journal' })
  if (pulse?.monthPnl != null) slides.push({ eyebrow: 'This month', title: signed(pulse.monthPnl), sub: 'Options + Forex, before tax', to: '/trading-journal' })
  if (pulse?.nextEmi) slides.push({ eyebrow: 'Next EMI', title: formatInr(pulse.nextEmi.amount), sub: `${pulse.nextEmi.loan} · ${pulse.nextEmi.days === 0 ? 'due today' : `in ${pulse.nextEmi.days} days`}`, to: '/loans' })
  if (pulse?.siteViews != null) slides.push({ eyebrow: 'Website this month', title: `${pulse.siteViews.toLocaleString('en-IN')} views`, to: '/site' })

  return (
    <div className="space-y-8">
      <section aria-label="Greeting">
        <p className="noir-eyebrow">{lead ? 'Now live' : now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <div className="mt-3 flex items-center justify-between gap-4">
          <h1 className="min-w-0 font-display text-[1.9rem] font-medium leading-[1.15] text-text sm:text-4xl">
            <NoirTitle text={lead ? lead.title : `${greetingFor(now.getHours())}, ${firstName}.`} />
          </h1>
          <button
            type="button"
            onClick={() => navigate(lead ? lead.to : '/chat')}
            className="shrink-0 rounded-[10px] border-[1.5px] border-text px-5 py-3 text-sm font-semibold text-text transition-transform active:scale-95"
          >
            {lead ? 'Review now' : 'Ask AI'}
          </button>
        </div>
        {lead && <p className="mt-2 text-sm text-text-secondary">{lead.detail}</p>}
      </section>

      <TodayCard />

      {notices.length > 0 && (
        <section aria-label="Needs attention">
          <SectionLabel>{`Needs attention (${notices.length})`}</SectionLabel>
          <ul className="space-y-3">
            {notices.map((n) => (
              <li key={n.id} className="flex items-center gap-3 rounded-[18px] border border-border bg-card p-4">
                <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border', n.tone === 'bad' ? 'text-error' : n.tone === 'warn' ? 'text-amber-500' : 'text-text')}>
                  <AlertTriangle className="h-5 w-5" strokeWidth={1.6} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-text">{n.title}</span>
                  <span className="block truncate text-xs text-text-secondary">{n.detail}</span>
                </span>
                <button type="button" onClick={() => navigate(n.to)} className="shrink-0 rounded-[10px] bg-text px-4 py-2.5 text-xs font-semibold text-bg transition-transform active:scale-95">
                  Open
                </button>
                <button type="button" onClick={() => dismiss(n)} aria-label={`Dismiss: ${n.title}`} className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-5 hover:text-text">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionLabel>Money matters</SectionLabel>
        <div className="noir-rail -mx-5 px-5 sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0">
          <MoneyCard label="Today's P&L" icon={TrendingUp} value={pulse?.todayPnl != null ? signed(pulse.todayPnl) : '—'} valueClass={toneOf(pulse?.todayPnl ?? null)} sub={pulse ? `${pulse.todayTrades} trades today` : 'Loading…'} onClick={() => navigate('/trading-journal')} />
          <MoneyCard label="This month" icon={BarChart3} value={pulse?.monthPnl != null ? signed(pulse.monthPnl) : '—'} valueClass={toneOf(pulse?.monthPnl ?? null)} sub="before tax" onClick={() => navigate('/trading-journal')} />
          <MoneyCard label="Next EMI" icon={CalendarClock} value={pulse?.nextEmi ? formatInr(pulse.nextEmi.amount) : '—'} sub={pulse?.nextEmi ? (pulse.nextEmi.days === 0 ? 'today' : `in ${pulse.nextEmi.days} days`) : 'none due'} onClick={() => navigate('/loans')} />
          <MoneyCard label="Loans" icon={Wallet} value={pulse?.loansOutstanding != null ? formatInr(pulse.loansOutstanding) : '—'} valueClass={pulse?.overdueEmis ? 'text-error' : undefined} sub={pulse?.overdueEmis ? `${pulse.overdueEmis} overdue` : 'outstanding'} onClick={() => navigate('/loans')} />
          <MoneyCard label="Weight" icon={HeartPulse} value={pulse?.latestWeight ? `${pulse.latestWeight.kg.toFixed(1)} kg` : '—'} sub={pulse?.inbodyDaysSince != null ? `InBody ${pulse.inbodyDaysSince}d ago` : 'no test yet'} onClick={() => navigate('/health-report')} />
          <MoneyCard label="Website" icon={Eye} value={pulse?.siteViews != null ? pulse.siteViews.toLocaleString('en-IN') : '—'} sub={pulse?.unreadMessages ? `${pulse.unreadMessages} unread` : 'views this month'} onClick={() => navigate('/site')} />
        </div>
      </section>

      <CinemaBanner slides={slides} onOpen={navigate} />




      {/* Every module, grouped like the menu, so nothing is more than one tap from Home. */}
      <section>
        <SectionLabel>For you</SectionLabel>
        <div className="space-y-6">
          {NAV_SECTIONS.map((sec, si) => (
            <div key={si}>
              {sec.label && <p className="mb-3 text-2xs font-semibold uppercase tracking-[0.18em] text-text-secondary">{sec.label}</p>}
              {/* One swipeable row per group, snapping to each icon. */}
              <div className="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto overscroll-x-contain px-5 pb-1 sm:scroll-px-8 [scrollbar-width:none] sm:-mx-8 sm:px-8 [&::-webkit-scrollbar]:hidden">
                {sec.items.filter((it) => it.to !== '/').map((it) => (
                  <button key={it.to} type="button" onClick={() => navigate(it.to)} className="group flex w-[4.5rem] shrink-0 snap-start flex-col items-center gap-2 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card transition-transform group-active:scale-90">
                      <it.icon className="h-5 w-5 text-text" strokeWidth={1.5} />
                    </span>
                    <span className="line-clamp-2 text-[11px] leading-tight text-text">{it.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel action="manage" onAction={() => navigate('/documents')}>Your vault</SectionLabel>
        <div className="rounded-[18px] border border-border bg-card px-4">
          <ListRow label="documents" value={loading ? '—' : String(documents.length)} onClick={() => navigate('/documents')} />
          <ListRow label="total size" value={loading ? '—' : formatBytes(totalSize)} />
          <ListRow label="categories" value={loading ? '—' : String(categories)} />
          <ListRow label="uploaded this month" value={loading ? '—' : String(thisMonth)} />
          <button type="button" onClick={() => void backup()} disabled={backingUp} className="flex w-full items-center gap-3 border-b border-border py-4 text-left">
            <span className="flex-1 text-[15px] text-text">download backup</span>
            {backingUp ? <Loader2 className="h-4 w-4 animate-spin text-text-secondary" /> : <DatabaseBackup className="h-4 w-4 text-text-secondary" />}
          </button>
          <button type="button" onClick={() => openExternal(SITE_URL)} className="flex w-full items-center gap-3 py-4 text-left">
            <span className="flex-1 text-[15px] text-text">visit website</span>
            <ExternalLink className="h-4 w-4 text-text-secondary" />
          </button>
        </div>
        {backupNote && <p role="status" className="mt-2 text-xs text-text-secondary">{backupNote}</p>}
      </section>
    </div>
  )
}
