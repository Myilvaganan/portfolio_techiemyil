// Downloadable reports shared by every admin module: a standalone HTML report (opens anywhere, prints to PDF)
// and CSV export for tables.

export type Tone = 'good' | 'bad' | 'warn' | 'info'

export interface ReportKpi {
  label: string
  value: string
  note?: string
  tone?: Tone
}

export interface ReportSection {
  title: string
  note?: string
  kpis?: ReportKpi[]
  bars?: { label: string; value: number; display: string; tone?: Tone }[]
  table?: { columns: string[]; rows: (string | number)[][]; rightAlign?: number[] }
  bullets?: { text: string; tone?: Tone }[]
  text?: string
}

export interface ReportDoc {
  title: string
  subtitle?: string
  sections: ReportSection[]
}

const TABLE_ROW_LIMIT = 600

export const escapeHtml = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const TONE: Record<Tone, string> = { good: '#15803d', bad: '#dc2626', warn: '#b45309', info: '#2563eb' }

const CSS = `
*{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#14161a;font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}
.wrap{max-width:980px;margin:0 auto;padding:32px 24px 56px}
header{border-bottom:2px solid #14161a;padding-bottom:14px;margin-bottom:24px}
.eyebrow{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#15803d}
h1{margin:6px 0 4px;font-size:28px;letter-spacing:-.02em}.sub{color:#5c6169;font-size:13px}
section{background:#fff;border:1px solid #e3e5e9;border-radius:14px;padding:18px 20px;margin-bottom:16px;break-inside:avoid-page}
h2{margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#5c6169}.note{color:#5c6169;font-size:12px;margin:0 0 12px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:10px}
.kpi{border:1px solid #e3e5e9;border-radius:10px;padding:10px 12px}.kpi b{display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#5c6169}
.kpi span{display:block;font-size:20px;font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums}.kpi i{display:block;font-style:normal;font-size:11px;color:#5c6169;margin-top:1px}
.bars{margin-top:10px}.bar{display:grid;grid-template-columns:170px 1fr 110px;gap:10px;align-items:center;font-size:12px;margin:7px 0}
.bar .t{height:8px;background:#eceef1;border-radius:99px;overflow:hidden}.bar .f{height:100%;border-radius:99px;background:#2563eb}.bar .v{text-align:right;font-variant-numeric:tabular-nums}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:10px}th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#5c6169;border-bottom:1px solid #d5d8de;padding:6px 8px}
td{padding:6px 8px;border-bottom:1px solid #eef0f3;font-variant-numeric:tabular-nums}tr:nth-child(even) td{background:#fafbfc}.r{text-align:right}
ul{margin:10px 0 0;padding-left:0;list-style:none}li{position:relative;padding-left:18px;margin:6px 0}li:before{content:"";position:absolute;left:2px;top:.55em;width:8px;height:8px;border-radius:99px;background:var(--c,#2563eb)}
footer{margin-top:24px;color:#8a8f98;font-size:11px;text-align:center}
@page{margin:12mm}@media print{body{background:#fff}.wrap{padding:0}section{border-color:#d5d8de}}
@media(max-width:640px){.bar{grid-template-columns:1fr 90px}.bar .t{grid-column:1/3;order:3}}
`

export function buildReportHtml(doc: ReportDoc): string {
  const when = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  const sections = doc.sections
    .map((s) => {
      const parts: string[] = [`<h2>${escapeHtml(s.title)}</h2>`]
      if (s.note) parts.push(`<p class="note">${escapeHtml(s.note)}</p>`)
      if (s.text) parts.push(`<p>${escapeHtml(s.text)}</p>`)
      if (s.kpis?.length) {
        parts.push(
          `<div class="kpis">${s.kpis
            .map((k) => `<div class="kpi"><b>${escapeHtml(k.label)}</b><span style="color:${k.tone ? TONE[k.tone] : 'inherit'}">${escapeHtml(k.value)}</span>${k.note ? `<i>${escapeHtml(k.note)}</i>` : ''}</div>`)
            .join('')}</div>`,
        )
      }
      if (s.bars?.length) {
        const max = Math.max(...s.bars.map((b) => Math.abs(b.value)), 1)
        parts.push(
          `<div class="bars">${s.bars
            .map((b) => `<div class="bar"><span>${escapeHtml(b.label)}</span><div class="t"><div class="f" style="width:${(Math.abs(b.value) / max) * 100}%;background:${b.tone ? TONE[b.tone] : '#2563eb'}"></div></div><span class="v">${escapeHtml(b.display)}</span></div>`)
            .join('')}</div>`,
        )
      }
      if (s.table) {
        const right = new Set(s.table.rightAlign ?? [])
        const rows = s.table.rows.slice(0, TABLE_ROW_LIMIT)
        parts.push(
          `<table><thead><tr>${s.table.columns.map((c, i) => `<th class="${right.has(i) ? 'r' : ''}">${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${rows
            .map((r) => `<tr>${r.map((c, i) => `<td class="${right.has(i) ? 'r' : ''}">${escapeHtml(c)}</td>`).join('')}</tr>`)
            .join('')}</tbody></table>`,
        )
        if (s.table.rows.length > TABLE_ROW_LIMIT) parts.push(`<p class="note">Showing the first ${TABLE_ROW_LIMIT} of ${s.table.rows.length} rows — export the CSV for everything.</p>`)
      }
      if (s.bullets?.length) parts.push(`<ul>${s.bullets.map((b) => `<li style="--c:${TONE[b.tone ?? 'info']}">${escapeHtml(b.text)}</li>`).join('')}</ul>`)
      return `<section>${parts.join('')}</section>`
    })
    .join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(doc.title)}</title><style>${CSS}</style></head><body><div class="wrap"><header><div class="eyebrow">Techie Myil · Admin report</div><h1>${escapeHtml(doc.title)}</h1><div class="sub">${escapeHtml(doc.subtitle ?? '')}${doc.subtitle ? ' · ' : ''}Generated ${escapeHtml(when)}</div></header>${sections}<footer>Personal analysis prepared from your own data. Figures may contain estimates; verify against original statements. Not financial advice.</footer></div></body></html>`
}

export function downloadFile(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const downloadHtmlReport = (doc: ReportDoc, filename: string) => downloadFile(filename.endsWith('.html') ? filename : `${filename}.html`, buildReportHtml(doc), 'text/html;charset=utf-8')

// Prints through a hidden frame so the browser's "Save as PDF" works without a pop-up.
export function printReport(doc: ReportDoc) {
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  frame.srcdoc = buildReportHtml(doc)
  frame.onload = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    setTimeout(() => frame.remove(), 60_000)
  }
  document.body.appendChild(frame)
}

const csvCell = (v: string | number) => {
  if (typeof v === 'number') return String(v)
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(columns: string[], rows: (string | number)[][]): string {
  return [columns, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
}

export const downloadCsv = (filename: string, columns: string[], rows: (string | number)[][]) =>
  downloadFile(filename.endsWith('.csv') ? filename : `${filename}.csv`, `﻿${toCsv(columns, rows)}`, 'text/csv;charset=utf-8')

export const fileStamp = () => new Date().toISOString().slice(0, 10)
