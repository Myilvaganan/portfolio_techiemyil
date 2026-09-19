import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { ResumeDownloadModal } from '@/components/common/ResumeDownloadModal'

interface ResumeDownloadContextValue {
  requestResume: () => void
}

const ResumeDownloadContext = createContext<ResumeDownloadContextValue | null>(null)

export function ResumeDownloadProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const requestResume = useCallback(() => setOpen(true), [])
  const value = useMemo(() => ({ requestResume }), [requestResume])

  return (
    <ResumeDownloadContext.Provider value={value}>
      {children}
      <ResumeDownloadModal open={open} onOpenChange={setOpen} />
    </ResumeDownloadContext.Provider>
  )
}

export function useResumeDownload() {
  const ctx = useContext(ResumeDownloadContext)
  if (!ctx) throw new Error('useResumeDownload must be used within ResumeDownloadProvider')
  return ctx
}
