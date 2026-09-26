import { useEffect, useRef, useState } from 'react'
import { Download, FileSpreadsheet, FileText, Printer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { downloadCsv, downloadHtmlReport, fileStamp, printReport, type ReportDoc } from '@/lib/report'

export interface CsvExport {
  filename: string
  columns: string[]
  rows: (string | number)[][]
}

// Report downloads (HTML, print/PDF) and CSV export, offered the same way in every module.
export function ReportMenu({ report, csv, filename, disabled, className, label = 'Reports' }: { report: () => ReportDoc; csv?: () => CsvExport; filename: string; disabled?: boolean; className?: string; label?: string }) {
  const [open, setOpen] = useState(false)
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
        <div role="menu" className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
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
    </div>
  )
}
