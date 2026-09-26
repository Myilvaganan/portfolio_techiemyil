import { clearStoredToken, getStoredToken } from './adminAuth'
import { parseReturn, type TaxReturn } from './tax'

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL

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
  if (res.status === 404 && !data?.error) throw new Error('The tax service isn’t available on the server yet. It may still be updating — please try again in a minute.')
  if (!res.ok) throw new Error(data?.error || 'Could not reach the tax vault. Please try again.')
  return data
}

export async function fetchReturns(): Promise<TaxReturn[]> {
  return (await call('/admin/tax/returns')).returns
}

export async function saveReturns(returns: TaxReturn[]): Promise<TaxReturn[]> {
  return (await call('/admin/tax/returns', 'POST', { returns })).returns
}

export async function deleteReturn(ay: string): Promise<TaxReturn[]> {
  return (await call(`/admin/tax/returns?ay=${encodeURIComponent(ay)}`, 'DELETE')).returns
}

export interface ReadResult {
  returns: TaxReturn[]
  /** Files that were not income-tax returns, by name. */
  skipped: string[]
}

/** Reads the ITR JSON files downloaded from the e-filing portal. Nothing is sent to the server here. */
export async function readReturnFiles(files: File[]): Promise<ReadResult> {
  const returns: TaxReturn[] = []
  const skipped: string[] = []
  for (const file of files) {
    try {
      const parsed = parseReturn(JSON.parse(await file.text()), file.name)
      if (parsed) returns.push(parsed)
      else skipped.push(file.name)
    } catch {
      skipped.push(file.name)
    }
  }
  return { returns, skipped }
}
