import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Download, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getDownloadUrl, type VaultDocument } from '@/lib/adminVault'

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.')
  return idx === -1 ? '' : filename.slice(idx + 1).toLowerCase()
}

interface PreviewModalProps {
  document: VaultDocument | null
  onOpenChange: (open: boolean) => void
}

export function PreviewModal({ document: doc, onOpenChange }: PreviewModalProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!doc) {
      setUrl(null)
      setError(null)
      return
    }

    let cancelled = false
    getDownloadUrl(doc.key, 'preview')
      .then((resolvedUrl) => {
        if (!cancelled) setUrl(resolvedUrl)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load preview.')
      })

    return () => {
      cancelled = true
    }
  }, [doc])

  const open = Boolean(doc)
  const extension = doc ? getExtension(doc.filename) : ''
  const isPdf = extension === 'pdf'
  const isImage = IMAGE_EXTENSIONS.includes(extension)

  async function handleDownload() {
    if (!doc) return
    const downloadUrl = await getDownloadUrl(doc.key, 'download')
    window.open(downloadUrl, '_blank')
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[151] flex h-[85vh] w-[92vw] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <Dialog.Title className="truncate pr-4 text-sm font-medium text-text">{doc?.filename}</Dialog.Title>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="ghost" size="sm" magnetic={false} onClick={handleDownload} aria-label="Download">
                <Download className="h-4 w-4" />
              </Button>
              <Dialog.Close asChild>
                <button type="button" aria-label="Close" className="text-text-secondary hover:text-text">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center overflow-auto bg-surface-2">
            {error && <p className="p-6 text-sm text-error">{error}</p>}
            {!error && !url && <Loader2 className="h-6 w-6 animate-spin text-text-secondary" />}
            {!error && url && isPdf && <iframe title={doc?.filename} src={url} className="h-full w-full" />}
            {!error && url && isImage && (
              <img src={url} alt={doc?.filename} className="max-h-full max-w-full object-contain" />
            )}
            {!error && url && !isPdf && !isImage && (
              <div className="p-6 text-center text-sm text-text-secondary">
                Preview isn't available for this file type — use download instead.
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
