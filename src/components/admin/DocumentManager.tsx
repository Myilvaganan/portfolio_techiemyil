import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileWarning,
  FolderOpen,
  FolderPlus,
  HardDrive,
  LayoutGrid,
  List,
  Loader2,
  MoreVertical,
  RefreshCw,
  Search,
  Tags,
  Trash2,
  TrendingUp,
  UploadCloud,
  X,
} from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { cn } from '@/lib/utils'
import { deleteDocument, getDownloadUrl, listDocuments, type VaultDocument } from '@/lib/adminVault'
import { tagLabel } from '@/constants/vaultTags'
import { UploadModal } from './UploadModal'
import { PreviewModal } from './PreviewModal'

const PAGE_SIZE = 8

type SortKey = 'newest' | 'oldest' | 'name' | 'size'

const EXTENSION_COLORS: Record<string, string> = {
  pdf: 'bg-red-500/15 text-red-400',
  doc: 'bg-blue-500/15 text-blue-400',
  docx: 'bg-blue-500/15 text-blue-400',
  xls: 'bg-emerald-500/15 text-emerald-400',
  xlsx: 'bg-emerald-500/15 text-emerald-400',
  ppt: 'bg-orange-500/15 text-orange-400',
  pptx: 'bg-orange-500/15 text-orange-400',
  zip: 'bg-purple-500/15 text-purple-400',
  jpg: 'bg-amber-500/15 text-amber-400',
  jpeg: 'bg-amber-500/15 text-amber-400',
  png: 'bg-amber-500/15 text-amber-400',
}

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.')
  return idx === -1 ? '' : filename.slice(idx + 1).toLowerCase()
}

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

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}

function FileIcon({ filename }: { filename: string }) {
  const ext = getExtension(filename)
  const colorClass = EXTENSION_COLORS[ext] || 'bg-surface-3 text-text-secondary'
  return (
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold uppercase', colorClass)}>
      {ext ? ext.slice(0, 3) : <FileWarning className="h-4 w-4" />}
    </span>
  )
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof HardDrive }) {
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

function RowMenu({
  doc,
  onDelete,
  onDownload,
}: {
  doc: VaultDocument
  onDelete: () => void
  onDownload: () => void
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function close() {
      setOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={`More actions for ${doc.filename}`}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-surface-3 hover:text-text"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <button
            type="button"
            onClick={onDownload}
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-text-secondary hover:bg-surface-3 hover:text-text"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-error hover:bg-error/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

export function DocumentManager() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [documents, setDocuments] = useState<VaultDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [category, setCategory] = useState('all')
  const [fileType, setFileType] = useState('all')
  const [sort, setSort] = useState<SortKey>('newest')
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [page, setPage] = useState(1)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadPrefillTag, setUploadPrefillTag] = useState<string | null>(null)
  const [previewDoc, setPreviewDoc] = useState<VaultDocument | null>(null)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<VaultDocument | null>(null)
  const [deleting, setDeleting] = useState(false)

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
    if (searchParams.get('q')) setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const categories = useMemo(() => {
    const unique = Array.from(new Set(documents.map((d) => d.tag)))
    return unique.sort((a, b) => tagLabel(a).localeCompare(tagLabel(b)))
  }, [documents])

  const fileTypes = useMemo(() => {
    const unique = Array.from(new Set(documents.map((d) => getExtension(d.filename)).filter(Boolean)))
    return unique.sort()
  }, [documents])

  const filtered = useMemo(() => {
    let result = documents
    if (category !== 'all') result = result.filter((d) => d.tag === category)
    if (fileType !== 'all') result = result.filter((d) => getExtension(d.filename) === fileType)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((d) => d.filename.toLowerCase().includes(q))
    }
    const sorted = [...result]
    if (sort === 'newest') sorted.sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || ''))
    else if (sort === 'oldest') sorted.sort((a, b) => (a.lastModified || '').localeCompare(b.lastModified || ''))
    else if (sort === 'name') sorted.sort((a, b) => a.filename.localeCompare(b.filename))
    else if (sort === 'size') sorted.sort((a, b) => b.size - a.size)
    return sorted
  }, [documents, category, fileType, search, sort])

  useEffect(() => {
    setPage(1)
  }, [category, fileType, search, sort])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const totalSize = documents.reduce((sum, d) => sum + d.size, 0)
  const thisMonthCount = documents.filter((d) => {
    if (!d.lastModified) return false
    const dt = new Date(d.lastModified)
    const now = new Date()
    return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth()
  }).length

  function handleNewFolder() {
    const name = window.prompt('Category name for the new folder:')
    if (!name || !name.trim()) return
    setUploadPrefillTag(name.trim())
    setUploadOpen(true)
  }

  function openUpload() {
    setUploadPrefillTag(null)
    setUploadOpen(true)
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

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteDocument(deleteTarget.key)
      setDeleteTarget(null)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">Document Manager</h1>
          <p className="mt-1 text-sm text-text-secondary">Upload, organize and manage all your documents securely.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" magnetic={false} onClick={handleNewFolder}>
            <FolderPlus className="h-4 w-4" />
            New Folder
          </Button>
          <Button size="sm" magnetic={false} onClick={openUpload}>
            <UploadCloud className="h-4 w-4" />
            Upload Document
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Documents" value={String(documents.length)} icon={FolderOpen} />
        <StatCard label="Total Size" value={formatBytes(totalSize)} icon={HardDrive} />
        <StatCard label="Categories" value={String(categories.length)} icon={Tags} />
        <StatCard label="Uploaded This Month" value={String(thisMonthCount)} icon={TrendingUp} />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          <FileWarning className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents by name…"
            className="w-full rounded-full border border-border bg-surface-2 py-2.5 pl-10 pr-4 text-sm text-text outline-none transition-colors focus:border-accent/50"
          />
        </div>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="appearance-none rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm text-text outline-none transition-colors focus:border-accent/50"
        >
          <option value="all">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {tagLabel(cat)}
            </option>
          ))}
        </select>

        <select
          value={fileType}
          onChange={(e) => setFileType(e.target.value)}
          className="appearance-none rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm text-text outline-none transition-colors focus:border-accent/50"
        >
          <option value="all">All Types</option>
          {fileTypes.map((ext) => (
            <option key={ext} value={ext}>
              {ext.toUpperCase()}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="appearance-none rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm text-text outline-none transition-colors focus:border-accent/50"
        >
          <option value="newest">Sort by: Newest</option>
          <option value="oldest">Sort by: Oldest</option>
          <option value="name">Sort by: Name</option>
          <option value="size">Sort by: Size</option>
        </select>

        <div className="flex items-center gap-1 rounded-full border border-border bg-surface-2 p-1">
          <button
            type="button"
            aria-label="Grid view"
            onClick={() => setView('grid')}
            className={cn('flex h-8 w-8 items-center justify-center rounded-full', view === 'grid' ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:text-text')}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="List view"
            onClick={() => setView('list')}
            className={cn('flex h-8 w-8 items-center justify-center rounded-full', view === 'list' ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:text-text')}
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        <Button variant="ghost" size="sm" magnetic={false} onClick={refresh} aria-label="Refresh">
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </Button>
      </div>

      <GlassCard hover={false} className="overflow-hidden p-0">
        {loading ? (
          <div className="p-10 text-center text-sm text-text-secondary">Loading documents…</div>
        ) : pageItems.length === 0 ? (
          <div className="p-10 text-center text-sm text-text-secondary">
            No documents match your filters. {documents.length === 0 && 'Upload one to get started.'}
          </div>
        ) : view === 'list' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Size</th>
                  <th className="px-5 py-3 font-medium">Uploaded On</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageItems.map((doc) => (
                  <tr key={doc.key} className="transition-colors hover:bg-surface-2">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <FileIcon filename={doc.filename} />
                        <span className="max-w-[240px] truncate text-sm font-medium text-text">{doc.filename}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <Chip>{tagLabel(doc.tag)}</Chip>
                    </td>
                    <td className="px-5 py-3.5 text-text-secondary">{getExtension(doc.filename).toUpperCase() || '—'}</td>
                    <td className="px-5 py-3.5 text-text-secondary">{formatBytes(doc.size)}</td>
                    <td className="px-5 py-3.5 text-text-secondary">{formatDateTime(doc.lastModified)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          aria-label={`Preview ${doc.filename}`}
                          onClick={() => setPreviewDoc(doc)}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-surface-3 hover:text-text"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Download ${doc.filename}`}
                          disabled={pendingKey === doc.key}
                          onClick={() => handleDownload(doc)}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-surface-3 hover:text-text disabled:opacity-50"
                        >
                          {pendingKey === doc.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        </button>
                        <RowMenu doc={doc} onDownload={() => handleDownload(doc)} onDelete={() => setDeleteTarget(doc)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {pageItems.map((doc) => (
              <div key={doc.key} className="rounded-2xl border border-border bg-surface-2 p-4">
                <div className="flex items-start justify-between">
                  <FileIcon filename={doc.filename} />
                  <RowMenu doc={doc} onDownload={() => handleDownload(doc)} onDelete={() => setDeleteTarget(doc)} />
                </div>
                <p className="mt-3 truncate text-sm font-medium text-text">{doc.filename}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                  <Chip>{tagLabel(doc.tag)}</Chip>
                  <span>{formatBytes(doc.size)}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button variant="secondary" size="sm" magnetic={false} className="flex-1" onClick={() => setPreviewDoc(doc)}>
                    <Eye className="h-4 w-4" />
                    Preview
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    magnetic={false}
                    disabled={pendingKey === doc.key}
                    onClick={() => handleDownload(doc)}
                    aria-label={`Download ${doc.filename}`}
                  >
                    {pendingKey === doc.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {!loading && filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-text-secondary">
          <span>
            Showing {(currentPage - 1) * PAGE_SIZE + 1} to {Math.min(currentPage * PAGE_SIZE, filtered.length)} of{' '}
            {filtered.length} documents
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous page"
              disabled={currentPage === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === totalPages || Math.abs(n - currentPage) <= 1)
              .reduce<number[]>((acc, n) => {
                if (acc.length && n - acc[acc.length - 1] > 1) acc.push(-1)
                acc.push(n)
                return acc
              }, [])
              .map((n, i) =>
                n === -1 ? (
                  <span key={`ellipsis-${i}`} className="px-1 text-text-secondary">
                    …
                  </span>
                ) : (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-medium',
                      n === currentPage ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border text-text-secondary hover:text-text',
                    )}
                  >
                    {n}
                  </button>
                ),
              )}
            <button
              type="button"
              aria-label="Next page"
              disabled={currentPage === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <UploadModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        initialTag={uploadPrefillTag}
        onUploaded={() => {
          setUploadOpen(false)
          refresh()
        }}
      />
      <PreviewModal document={previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)} />

      <Dialog.Root open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 z-[151] w-[92vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <Dialog.Title className="font-display text-lg font-semibold text-text">Delete document?</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" aria-label="Close" className="text-text-secondary hover:text-text">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
            <p className="text-sm text-text-secondary">
              This will permanently delete <span className="font-medium text-text">{deleteTarget?.filename}</span>. This
              can't be undone.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <Button variant="secondary" size="sm" magnetic={false} className="flex-1" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancel
              </Button>
              <Button
                size="sm"
                magnetic={false}
                className="flex-1 !bg-error hover:!bg-error/90"
                onClick={handleDeleteConfirmed}
                disabled={deleting}
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
