import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Briefcase, ExternalLink, FolderOpen, HardDrive, Image, Newspaper, Tags, TrendingUp } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { listDocuments, type VaultDocument } from '@/lib/adminVault'

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
  { label: 'Projects', to: '/admin/projects', icon: Briefcase },
  { label: 'Blog Posts', to: '/admin/blog', icon: Newspaper },
  { label: 'Media Library', to: '/admin/media', icon: Image },
]

export function DashboardHome() {
  const [documents, setDocuments] = useState<VaultDocument[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

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
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">Dashboard</h1>
          <p className="mt-1 text-sm text-text-secondary">Welcome back, Admin! Here's a snapshot of the document vault.</p>
        </div>
        <Button variant="secondary" size="sm" magnetic={false} onClick={() => window.open('/', '_blank')}>
          Visit Website
          <ExternalLink className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Documents" value={loading ? '—' : String(documents.length)} icon={FolderOpen} />
        <StatCard label="Total Size" value={loading ? '—' : formatBytes(totalSize)} icon={HardDrive} />
        <StatCard label="Categories" value={loading ? '—' : String(categories)} icon={Tags} />
        <StatCard label="Uploaded This Month" value={loading ? '—' : String(thisMonth)} icon={TrendingUp} />
      </div>

      <div>
        <h2 className="mb-4 font-display text-lg font-semibold text-text">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.to}
              type="button"
              data-cursor="hover"
              onClick={() => navigate(action.to)}
              className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card/70 px-4 py-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-accent/30"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/10 text-accent">
                <action.icon className="h-5 w-5" />
              </span>
              <span className="text-sm font-medium text-text">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-text-secondary">
        Only the Document Manager is wired to real data right now — other sections in the sidebar are placeholders
        ready to be built out.
      </p>
    </div>
  )
}
