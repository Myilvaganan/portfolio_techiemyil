import { clearStoredToken, getStoredToken } from './adminAuth'
import { normalizeReport, type DailyLog, type Goal, type HealthReport, type HistoryPoint } from './health'

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL
const MAX_PHOTO_SIDE = 2000

async function call(path: string, method = 'GET', body?: unknown) {
  const token = getStoredToken()
  const res = await fetch(`${ADMIN_API_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) clearStoredToken()
  const data = await res.json().catch(() => null)
  if (res.status === 404 && !data?.error) throw new Error('The health report service isn’t available on the server yet. It may still be updating — please try again in a minute.')
  if (!res.ok) throw new Error(data?.error || 'Could not reach the health vault. Please try again.')
  return data
}

const toReports = (list: Partial<HealthReport>[]) => list.map(normalizeReport)

export async function fetchReports(): Promise<HealthReport[]> {
  const data = await call('/admin/health/reports')
  return toReports(data.reports)
}

/** Creates or updates reports (a blank id creates). Returns every stored report. */
export async function saveReports(reports: HealthReport[]): Promise<HealthReport[]> {
  const data = await call('/admin/health/reports', 'POST', { reports: reports.map((r) => ({ ...r, id: r.id || undefined })) })
  return toReports(data.reports)
}

export async function deleteReport(id: string): Promise<HealthReport[]> {
  const data = await call(`/admin/health/reports?id=${encodeURIComponent(id)}`, 'DELETE')
  return toReports(data.reports)
}

/** Downscales a phone photo to a JPEG data URL small enough for the Lambda, keeping the print legible. */
export async function photoToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not read that photo.')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.85)
}

/** Reads a photo of the printed report. Nothing is saved — the result is for the user to check first. */
export async function scanReport(file: File): Promise<{ report: HealthReport; history: HistoryPoint[] }> {
  const image = await photoToDataUrl(file)
  const data = await call('/admin/health/scan', 'POST', { image })
  return { report: normalizeReport(data.report), history: data.history ?? [] }
}

export async function fetchGoal(): Promise<Goal | null> {
  const data = await call('/admin/health/goal')
  return data.goal ?? null
}

export async function saveGoal(goal: Partial<Goal>): Promise<Goal> {
  const data = await call('/admin/health/goal', 'POST', { goal })
  return data.goal
}

export async function fetchLogs(): Promise<DailyLog[]> {
  const data = await call('/admin/health/logs')
  return data.logs ?? []
}

export async function saveLog(log: DailyLog): Promise<DailyLog[]> {
  const data = await call('/admin/health/logs', 'POST', { log })
  return data.logs ?? []
}

export async function deleteLog(date: string): Promise<DailyLog[]> {
  const data = await call(`/admin/health/logs?date=${encodeURIComponent(date)}`, 'DELETE')
  return data.logs ?? []
}
