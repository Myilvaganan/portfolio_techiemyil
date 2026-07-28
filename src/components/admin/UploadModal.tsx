import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, UploadCloud, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getUploadUrl, uploadFile } from '@/lib/adminVault'
import { VAULT_TAG_PRESETS } from '@/constants/vaultTags'

const CUSTOM_TAG_VALUE = '__custom__'

interface UploadModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUploaded: () => void
}

export function UploadModal({ open, onOpenChange, onUploaded }: UploadModalProps) {
  const [tag, setTag] = useState<string>(VAULT_TAG_PRESETS[0])
  const [customTag, setCustomTag] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isCustom = tag === CUSTOM_TAG_VALUE
  const effectiveTag = isCustom ? customTag : tag

  function reset() {
    setTag(VAULT_TAG_PRESETS[0])
    setCustomTag('')
    setFile(null)
    setError(null)
  }

  function handleOpenChange(next: boolean) {
    if (uploading) return
    onOpenChange(next)
    if (!next) reset()
  }

  async function handleUpload() {
    if (!file) {
      setError('Choose a file to upload.')
      return
    }
    if (!effectiveTag.trim()) {
      setError('Enter a tag for this document.')
      return
    }

    setUploading(true)
    setError(null)
    try {
      const { uploadUrl } = await getUploadUrl(file.name, effectiveTag, file.type)
      await uploadFile(uploadUrl, file)
      reset()
      onUploaded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[151] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-2xl"
        >
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title className="font-display text-lg font-semibold text-text">Upload Document</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="text-text-secondary hover:text-text">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-text-secondary">Tag</label>
              <select
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                className="w-full appearance-none rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent/50"
              >
                {VAULT_TAG_PRESETS.map((preset) => (
                  <option key={preset} value={preset} className="bg-card">
                    {preset}
                  </option>
                ))}
                <option value={CUSTOM_TAG_VALUE} className="bg-card">
                  Custom…
                </option>
              </select>
              {isCustom && (
                <input
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  placeholder="e.g. Insurance"
                  className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent/50"
                />
              )}
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-text-secondary">File</label>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-text-secondary file:mr-3 file:rounded-full file:border-0 file:bg-surface-3 file:px-4 file:py-2 file:text-xs file:font-medium file:text-text hover:file:bg-surface-5"
              />
            </div>

            {error && <p className="text-xs text-error">{error}</p>}

            <Button type="button" disabled={uploading} magnetic={false} onClick={handleUpload} className="w-full">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              Upload
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
