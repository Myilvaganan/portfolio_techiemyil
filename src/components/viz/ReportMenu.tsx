import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, Eye, FileSpreadsheet, FileText, Printer, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildReportHtml, downloadCsv, downloadHtmlReport, fileStamp, printReport, type ReportDoc } from '@/lib/report'

export interface CsvExport {
  filename: string
  columns: string[]
  rows: (string | number)[][]
}

// Report downloads (HTML, print/PDF) and CSV export, offered the same way in every module.
/** The report inside the app, full screen: works on phones where download and print aren't available. */
function ReportViewer({ doc, onClose }: { doc: ReportDoc; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-bg pt-[var(--inset-top,0px)]" role="dialog" aria-label={doc.title}>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button type="button" aria-label="Close report" onClick={onClose} className="rounded-full p-2 text-text-secondary hover:text-text">
          <X className="h-5 w-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{doc.title}</p>
        <button type="button" onClick={() => frame.current?.contentWindow?.print()} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary">
          <Printer className="h-3.5 w-3.5" /> Print / PDF
        </button>
      </div>
      <iframe ref={frame} title={doc.title} srcDoc={buildReportHtml(doc)} className="w-full flex-1 bg-white" />
    </div>,
    document.body,
  )
}

export function ReportMenu({ report, csv, filename, disabled, className, label = 'Reports' }: { report: () => ReportDoc; csv?: () => CsvExport; filename: string; disabled?: boolean; className?: string; label?: string }) {
  const [open, setOpen] = useState(false)
  const [viewing, setViewing] = useState<ReportDoc | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const item = 'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-xs text-text-secondary transition-colors hover:bg-surface-3 hover:text-text'
  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        data-cursor="hover"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-text disabled:opacity-50"
      >
        <Download className="h-3.5 w-3.5" />
        {label}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-[60] mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setViewing(report())
              setOpen(false)
            }}
          >
            <Eye className="h-3.5 w-3.5" /> View report
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              downloadHtmlReport(report(), `${filename}-${fileStamp()}`)
              setOpen(false)
            }}
          >
            <FileText className="h-3.5 w-3.5" /> Download report (HTML)
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              printReport(report())
              setOpen(false)
            }}
          >
            <Printer className="h-3.5 w-3.5" /> Print / save as PDF
          </button>
          {csv && (
            <button
              type="button"
              role="menuitem"
              className={item}
              onClick={() => {
                const c = csv()
                downloadCsv(`${c.filename}-${fileStamp()}`, c.columns, c.rows)
                setOpen(false)
              }}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Export data (CSV)
            </button>
          )}
        </div>
      )}
      {viewing && <ReportViewer doc={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}
