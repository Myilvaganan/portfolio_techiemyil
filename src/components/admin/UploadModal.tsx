import { useEffect, useRef, useState, type DragEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { File as FileIcon, Loader2, UploadCloud, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { getUploadUrl, uploadFile } from '@/lib/adminVault'
import { addCustomCategory, getCustomCategories } from '@/lib/vaultCategories'
import { VAULT_TAG_PRESETS } from '@/constants/vaultTags'

function buildTagOptions(): string[] {
  const custom = getCustomCategories().filter((c) => !(VAULT_TAG_PRESETS as readonly string[]).includes(c))
  return [...VAULT_TAG_PRESETS, ...custom]
}

const CUSTOM_TAG_VALUE = '__custom__'

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

interface UploadModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUploaded: () => void
  initialTag?: string | null
  initialFile?: File | null
}

export function UploadModal({ open, onOpenChange, onUploaded, initialTag, initialFile }: UploadModalProps) {
  const [tag, setTag] = useState<string>(VAULT_TAG_PRESETS[0])
  const [customTag, setCustomTag] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [tagOptions, setTagOptions] = useState<string[]>(buildTagOptions)
  const dragCounter = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isCustom = tag === CUSTOM_TAG_VALUE
  const effectiveTag = isCustom ? customTag : tag

  function reset() {
    setTag(VAULT_TAG_PRESETS[0])
    setCustomTag('')
    setFile(null)
    setError(null)
    setDragActive(false)
    dragCounter.current = 0
  }

  useEffect(() => {
    if (!open) return
    setTagOptions(buildTagOptions())
    if (initialTag) {
      const isPreset = (VAULT_TAG_PRESETS as readonly string[]).includes(initialTag)
      setTag(isPreset ? initialTag : CUSTOM_TAG_VALUE)
      setCustomTag(isPreset ? '' : initialTag)
    }
    if (initialFile) setFile(initialFile)
  }, [open, initialTag, initialFile])

  function handleOpenChange(next: boolean) {
    if (uploading) return
    onOpenChange(next)
    if (!next) reset()
  }

  function handleDragEnter(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    if (!e.dataTransfer.types.includes('Files')) return
    dragCounter.current += 1
    setDragActive(true)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = Math.max(0, dragCounter.current - 1)
    if (dragCounter.current === 0) setDragActive(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setDragActive(false)
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) {
      setFile(dropped)
      setError(null)
    }
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
      if (isCustom) addCustomCategory(effectiveTag)
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
            <Dialog.Title className="font-display text-lg font-semibold text-text">
              {initialTag ? `New folder: ${initialTag}` : 'Upload Document'}
            </Dialog.Title>
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
                {tagOptions.map((preset) => (
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
              {initialTag && (
                <p className="mt-2 text-xs text-text-secondary">
                  Folders are created by uploading a first file into them.
                </p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-text-secondary">File</label>
              <div
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                data-cursor="hover"
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors',
                  dragActive ? 'border-accent bg-accent/10' : 'border-border bg-surface-2 hover:border-accent/40',
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
                {file ? (
                  <>
                    <FileIcon className="h-6 w-6 text-accent" />
                    <p className="max-w-full truncate text-sm font-medium text-text">{file.name}</p>
                    <p className="text-xs text-text-secondary">{formatBytes(file.size)}</p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setFile(null)
                      }}
                      className="mt-1 text-xs font-medium text-error hover:underline"
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-6 w-6 text-text-secondary" />
                    <p className="text-sm text-text">
                      <span className="font-medium text-accent">Click to browse</span> or drag and drop
                    </p>
                    <p className="text-xs text-text-secondary">Any file type</p>
                  </>
                )}
              </div>
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
