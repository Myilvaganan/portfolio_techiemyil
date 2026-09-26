import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Home, BarChart3, BookOpen, Calculator, CalendarClock, CreditCard, DatabaseBackup, ExternalLink, Eye, Globe, HandCoins, Landmark, FolderOpen, HardDrive, HeartPulse, Loader2, PieChart, ReceiptText, Scale, Tags, TrendingUp, Wallet } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { listDocuments, type VaultDocument } from '@/lib/adminVault'
import { formatInr } from '@/lib/kite'
import { cn } from '@/lib/utils'
import { downloadBackup } from '@/lib/platformApi'
import { noticesFrom } from '@/lib/pulse'
import { useAdminPulse } from '@/hooks/useAdminPulse'

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

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: typeof HardDrive
}) {
  return (
    <GlassCard className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">{label}</p>
          <p className="mt-2 font-display text-2xl font-semibold text-text">{value}</p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </GlassCard>
  )
}

const QUICK_ACTIONS = [
  { label: 'Document Manager', to: '/admin/documents', icon: FolderOpen },
  { label: 'Margin Calculator', to: '/admin/margin-calculator', icon: Calculator },
  { label: 'Portfolio Rebalance', to: '/admin/portfolio-rebalance', icon: PieChart },
  { label: 'Zerodha Dashboard', to: '/admin/zerodha', icon: TrendingUp },
  { label: 'Options Analytics', to: '/admin/options-analytics', icon: BarChart3 },
  { label: 'Bank Statements', to: '/admin/bank-statements', icon: Landmark },
  { label: 'Credit Cards', to: '/admin/credit-cards', icon: CreditCard },
  { label: 'Loans', to: '/admin/loans', icon: HandCoins },
  { label: 'Health Report', to: '/admin/health-report', icon: HeartPulse },
  { label: 'Trading Journal', to: '/admin/trading-journal', icon: BookOpen },
  { label: 'Household', to: '/admin/household', icon: Home },
  { label: 'Tax Information', to: '/admin/tax', icon: ReceiptText },
  { label: 'Net Worth', to: '/admin/net-worth', icon: Scale },
  { label: 'Website', to: '/admin/site', icon: Globe },
]

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${formatInr(Math.abs(n))}`
const toneOf = (n: number | null) => (n === null || n === 0 ? 'text-text' : n > 0 ? 'text-positive' : 'text-error')

function PulseCard({ label, value, sub, icon: Icon, valueClass, onClick }: { label: string; value: string; sub?: string; icon: typeof HardDrive; valueClass?: string; onClick: () => void }) {
  return (
    <button type="button" data-cursor="hover" onClick={onClick} className="rounded-2xl text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-accent">
      <GlassCard className="h-full p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">{label}</p>
            <p className={cn('mt-1.5 truncate font-mono text-xl font-semibold text-text', valueClass)}>{value}</p>
            {sub && <p className="mt-0.5 truncate text-xs text-text-secondary">{sub}</p>}
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Icon className="h-4 w-4" />
          </span>
        </div>
      </GlassCard>
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
  const notices = pulse ? noticesFrom(pulse, signed) : []
  // Show alerts briefly, then let them go (the bell keeps them); only show again when the set changes.
  const noticeKey = notices.map((n) => n.id).join('|')
  const [showNotices, setShowNotices] = useState(false)
  useEffect(() => {
    if (!noticeKey) return
    try {
      if (sessionStorage.getItem('notices_seen') === noticeKey) return
      sessionStorage.setItem('notices_seen', noticeKey)
    } catch { /* storage unavailable: just show */ }
    setShowNotices(true)
  }, [noticeKey])

  async function backup() {
    setBackingUp(true)
    setBackupNote('')
    try {
      const b = await downloadBackup()
      setBackupNote(`Saved ${Object.keys(b.files).length} data files and a list of ${b.documents.length} documents.`)
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">Dashboard</h1>
          <p className="mt-1 text-sm text-text-secondary">Welcome back! Here&apos;s today across your trading, money, health and website.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" magnetic={false} onClick={() => void backup()} disabled={backingUp}>
            {backingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />}
            Download backup
          </Button>
          <Button variant="secondary" size="sm" magnetic={false} onClick={() => window.open('/', '_blank')}>
            Visit Website
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {backupNote && <p role="status" className="-mt-3 text-xs text-text-secondary">{backupNote} Older versions of every file are also kept in the vault for 90 days.</p>}

      {notices.length > 0 && showNotices && (
        <ul className="animate-[fadeout_0.5s_ease-in_6s_forwards] space-y-2" aria-label="Needs attention" onAnimationEnd={() => setShowNotices(false)}>
          {notices.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                data-cursor="hover"
                onClick={() => navigate(n.to)}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors',
                  n.tone === 'bad' ? 'border-error/40 bg-error/10' : n.tone === 'warn' ? 'border-amber-500/40 bg-amber-500/10' : 'border-accent/30 bg-accent/[0.06]',
                )}
              >
                <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', n.tone === 'bad' ? 'text-error' : n.tone === 'warn' ? 'text-amber-500' : 'text-accent')} />
                <span>
                  <span className="font-semibold text-text">{n.title}</span> <span className="text-text-secondary">{n.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <PulseCard
          label="Today's P&L"
          icon={TrendingUp}
          value={pulse?.todayPnl != null ? signed(pulse.todayPnl) : '—'}
          valueClass={toneOf(pulse?.todayPnl ?? null)}
          sub={pulse ? `${pulse.todayTrades} trade${pulse.todayTrades === 1 ? '' : 's'} today · all books` : 'Loading…'}
          onClick={() => navigate('/admin/trading-journal')}
        />
        <PulseCard
          label="This month"
          icon={BarChart3}
          value={pulse?.monthPnl != null ? signed(pulse.monthPnl) : '—'}
          valueClass={toneOf(pulse?.monthPnl ?? null)}
          sub="Options + Forex, before tax"
          onClick={() => navigate('/admin/trading-journal')}
        />
        <PulseCard
          label="Next EMI"
          icon={CalendarClock}
          value={pulse?.nextEmi ? formatInr(pulse.nextEmi.amount) : '—'}
          sub={pulse?.nextEmi ? `${pulse.nextEmi.loan} · ${pulse.nextEmi.days === 0 ? 'today' : `in ${pulse.nextEmi.days} days`}` : 'No upcoming EMI found'}
          onClick={() => navigate('/admin/loans')}
        />
        <PulseCard
          label="Loans outstanding"
          icon={Wallet}
          value={pulse?.loansOutstanding != null ? formatInr(pulse.loansOutstanding) : '—'}
          sub={pulse?.overdueEmis ? `${pulse.overdueEmis} overdue` : 'All paid on time'}
          valueClass={pulse?.overdueEmis ? 'text-error' : undefined}
          onClick={() => navigate('/admin/loans')}
        />
        <PulseCard
          label="Latest weight"
          icon={HeartPulse}
          value={pulse?.latestWeight ? `${pulse.latestWeight.kg.toFixed(1)} kg` : '—'}
          sub={pulse?.inbodyDaysSince != null ? `InBody ${pulse.inbodyDaysSince} days ago` : 'No InBody test yet'}
          onClick={() => navigate('/admin/health-report')}
        />
        <PulseCard
          label="Website this month"
          icon={Eye}
          value={pulse?.siteViews != null ? pulse.siteViews.toLocaleString('en-IN') : '—'}
          sub={pulse?.unreadMessages ? `${pulse.unreadMessages} unread message${pulse.unreadMessages === 1 ? '' : 's'}` : 'page views'}
          onClick={() => navigate('/admin/site')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Documents" value={loading ? '—' : String(documents.length)} icon={FolderOpen} />
        <StatCard label="Total Size" value={loading ? '—' : formatBytes(totalSize)} icon={HardDrive} />
        <StatCard label="Categories" value={loading ? '—' : String(categories)} icon={Tags} />
        <StatCard label="Uploaded This Month" value={loading ? '—' : String(thisMonth)} icon={TrendingUp} />
      </div>

      <div>
        <h2 className="mb-4 font-display text-lg font-semibold text-text">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.to}
              type="button"
              data-cursor="hover"
              onClick={() => navigate(action.to)}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card/70 px-3 py-4 text-center transition-all duration-300 hover:-translate-y-1 hover:border-accent/30"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/10 text-accent">
                <action.icon className="h-5 w-5" />
              </span>
              <span className="text-sm font-medium text-text">{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
