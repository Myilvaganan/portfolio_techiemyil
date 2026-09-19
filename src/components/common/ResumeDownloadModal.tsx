import { useState, type FormEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { OTHER_REASON, RESUME_REASONS } from '@/constants/resumeReasons'
import { notifyResumeDownload } from '@/lib/download'
import { openResume } from '@/lib/resume'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const inputClass =
  'w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text placeholder:text-text-secondary/60 outline-none transition-colors focus:border-accent/50'
const labelClass = 'mb-2 block text-xs font-medium uppercase tracking-wide text-text-secondary'

interface ResumeDownloadModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ResumeDownloadModal({ open, onOpenChange }: ResumeDownloadModalProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState('')
  const [reasonDetail, setReasonDetail] = useState('')
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({})

  function handleSubmit(e: FormEvent) {
    e.preventDefault()

    const trimmedName = name.trim()
    const trimmedEmail = email.trim()
    const nextErrors: typeof errors = {}
    if (!trimmedName) nextErrors.name = 'Please tell me your name or nickname'
    if (trimmedEmail && !EMAIL_PATTERN.test(trimmedEmail)) nextErrors.email = 'That email doesn’t look right'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    notifyResumeDownload({
      name: trimmedName,
      email: trimmedEmail || undefined,
      reason: reason || undefined,
      reasonDetail: reason === OTHER_REASON ? reasonDetail.trim() || undefined : undefined,
    })
    // Called synchronously from the submit handler so the browser still treats
    // window.open as a direct result of the click and doesn't block the tab.
    openResume()
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby="resume-download-desc"
          className="fixed left-1/2 top-1/2 z-[151] max-h-[92vh] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl"
        >
          <div className="mb-1 flex items-center justify-between">
            <Dialog.Title className="font-display text-lg font-semibold text-text">Download Resume</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="text-text-secondary hover:text-text">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description id="resume-download-desc" className="mb-5 text-sm text-text-secondary">
            Quick intro before you go — only your name is required.
          </Dialog.Description>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="dl-name" className={labelClass}>
                Name / nickname <span className="text-accent">*</span>
              </label>
              <input
                id="dl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                autoComplete="name"
                maxLength={100}
                aria-invalid={!!errors.name}
                className={inputClass}
              />
              {errors.name && <p className="mt-1.5 text-xs text-error">{errors.name}</p>}
            </div>

            <div>
              <label htmlFor="dl-email" className={labelClass}>
                Email <span className="normal-case text-text-secondary/60">(optional)</span>
              </label>
              <input
                id="dl-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@company.com"
                autoComplete="email"
                maxLength={200}
                aria-invalid={!!errors.email}
                className={inputClass}
              />
              {errors.email && <p className="mt-1.5 text-xs text-error">{errors.email}</p>}
            </div>

            <div>
              <label htmlFor="dl-reason" className={labelClass}>
                Why are you here? <span className="normal-case text-text-secondary/60">(optional)</span>
              </label>
              <select
                id="dl-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full appearance-none rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent/50"
              >
                <option value="" className="bg-card">
                  Select an option
                </option>
                {RESUME_REASONS.map((option) => (
                  <option key={option} value={option} className="bg-card">
                    {option}
                  </option>
                ))}
              </select>
              {reason === OTHER_REASON && (
                <input
                  value={reasonDetail}
                  onChange={(e) => setReasonDetail(e.target.value)}
                  placeholder="Tell me a bit more"
                  aria-label="Other reason"
                  maxLength={200}
                  className={`${inputClass} mt-2`}
                />
              )}
            </div>

            <Button type="submit" magnetic={false} className="w-full">
              <Download className="h-4 w-4" />
              Download Resume
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
