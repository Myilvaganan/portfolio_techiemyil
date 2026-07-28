import { useEffect, useMemo, useState } from 'react'
import { Download, Eye, FileWarning, LogOut, RefreshCw, UploadCloud } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { Container } from '@/components/ui/Container'
import { cn } from '@/lib/utils'
import { clearStoredToken } from '@/lib/adminAuth'
import { getDownloadUrl, listDocuments, type VaultDocument } from '@/lib/adminVault'
import { tagLabel } from '@/constants/vaultTags'
import { UploadModal } from './UploadModal'
import { PreviewModal } from './PreviewModal'

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

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function DocumentVault({ onLogout }: { onLogout: () => void }) {
  const [documents, setDocuments] = useState<VaultDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<VaultDocument | null>(null)
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const docs = await listDocuments()
      setDocuments(docs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tags = useMemo(() => {
    const unique = Array.from(new Set(documents.map((doc) => doc.tag)))
    return unique.sort((a, b) => tagLabel(a).localeCompare(tagLabel(b)))
  }, [documents])

  const filtered = activeTag ? documents.filter((doc) => doc.tag === activeTag) : documents

  function handleLogout() {
    clearStoredToken()
    onLogout()
  }

  async function handleDownload(doc: VaultDocument) {
    setPendingKey(doc.key)
    try {
      const url = await getDownloadUrl(doc.key, 'download')
      window.open(url, '_blank')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate a download link.')
    } finally {
      setPendingKey(null)
    }
  }

  return (
    <div className="min-h-screen pb-16 pt-10">
      <Container className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-text">Document Vault</h1>
            <p className="mt-1 text-sm text-text-secondary">Certificates, personal documents, payslips & more</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="secondary" size="sm" magnetic={false} onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                activeTag === null
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-border bg-surface-3 text-text-secondary hover:text-text',
              )}
            >
              All
            </button>
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(tag)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  activeTag === tag
                    ? 'border-accent/50 bg-accent/10 text-accent'
                    : 'border-border bg-surface-3 text-text-secondary hover:text-text',
                )}
              >
                {tagLabel(tag)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" magnetic={false} onClick={refresh} aria-label="Refresh">
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
            <Button size="sm" magnetic={false} onClick={() => setUploadOpen(true)}>
              <UploadCloud className="h-4 w-4" />
              Upload
            </Button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
            <FileWarning className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <GlassCard hover={false} className="overflow-hidden p-0">
          {loading ? (
            <div className="p-10 text-center text-sm text-text-secondary">Loading documents…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-text-secondary">
              No documents {activeTag ? `under "${tagLabel(activeTag)}"` : 'yet'}. Upload one to get started.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((doc) => (
                <div key={doc.key} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">{doc.filename}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                      <Chip>{tagLabel(doc.tag)}</Chip>
                      <span>{formatBytes(doc.size)}</span>
                      <span>·</span>
                      <span>{formatDate(doc.lastModified)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      magnetic={false}
                      onClick={() => setPreviewDoc(doc)}
                      aria-label={`Preview ${doc.filename}`}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      magnetic={false}
                      disabled={pendingKey === doc.key}
                      onClick={() => handleDownload(doc)}
                      aria-label={`Download ${doc.filename}`}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </Container>

      <UploadModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={() => {
          setUploadOpen(false)
          refresh()
        }}
      />

      <PreviewModal document={previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)} />
    </div>
  )
}
