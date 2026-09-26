import { importTrades, saveAccount } from './journalStore'
import { accountFromReport, parseMt5Report, positionsToTrades, readReportFile } from './mt5'

// MetaTrader 5 writes "ReportHistory-<account>.html" into its Documents folder. Chrome can be given read access to that
// folder once (File System Access API); the handle is kept in IndexedDB so later visits sync without asking again.

const DB = 'techiemyil-admin'
const STORE = 'handles'
const KEY = 'mt5-folder'
const SEEN_KEY = 'mt5_folder_seen'
export const REPORT_FILE = /^ReportHistory-\d+\.html?$/i

type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?: (o: { mode: 'read' }) => Promise<PermissionState>
  requestPermission?: (o: { mode: 'read' }) => Promise<PermissionState>
  values?: () => AsyncIterable<FileSystemHandle>
}

export const folderSyncSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window && 'indexedDB' in window

function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1)
    open.onupgradeneeded = () => open.result.createObjectStore(STORE)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction(STORE, mode)
      const req = run(tx.objectStore(STORE))
      tx.oncomplete = () => { db.close(); resolve(req.result) }
      tx.onabort = () => { db.close(); reject(tx.error || req.error) }
      tx.onerror = () => { db.close(); reject(tx.error || req.error) }
    }
  })
}

export const savedFolder = () => idb<DirHandle | undefined>('readonly', (s) => s.get(KEY) as IDBRequest<DirHandle | undefined>).catch(() => undefined)
export const forgetFolder = async () => {
  await idb('readwrite', (s) => s.delete(KEY))
  try { localStorage.removeItem(SEEN_KEY) } catch { /* Storage may be unavailable. */ }
}

export async function pickFolder(): Promise<DirHandle> {
  const handle = (await (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker({ id: 'mt5-reports', mode: 'read' })) as DirHandle
  await idb('readwrite', (s) => s.put(handle, KEY))
  try { localStorage.removeItem(SEEN_KEY) } catch { /* Rechecking is safe. */ }
  return handle
}

/** 'granted' lets a sync run silently; 'prompt' needs a click (browsers only ask during a user gesture). */
export async function folderPermission(handle: DirHandle, ask = false): Promise<PermissionState> {
  if (!handle.queryPermission) return 'granted'
  const state = await handle.queryPermission({ mode: 'read' })
  if (state === 'granted' || !ask || !handle.requestPermission) return state
  return handle.requestPermission({ mode: 'read' })
}

function readSeen(): Record<string, number> {
  try {
    const value = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

/** Which report files are new or changed since the last sync (by name and modified time). */
export function changedFiles(files: { name: string; lastModified: number }[], seen: Record<string, number>) {
  return files.filter((f) => REPORT_FILE.test(f.name) && seen[f.name] !== f.lastModified)
}

export interface FolderSyncResult {
  files: number
  added: number
  accounts: string[]
  latestDate: string
  errors: string[]
}

/** Imports every new or changed ReportHistory file in the folder. Safe to repeat: trades already saved are skipped. */
export async function syncFolder(handle: DirHandle): Promise<FolderSyncResult> {
  const all: File[] = []
  for await (const entry of handle.values ? handle.values() : []) {
    if (entry.kind === 'file' && REPORT_FILE.test(entry.name)) all.push(await (entry as FileSystemFileHandle).getFile())
  }
  const seen = readSeen()
  const result: FolderSyncResult = { files: 0, added: 0, accounts: [], latestDate: '', errors: [] }
  for (const file of changedFiles(all, seen) as File[]) {
    try {
      const html = await readReportFile(file)
      const report = parseMt5Report(html)
      const trades = positionsToTrades(report)
      await saveAccount(accountFromReport(report), html)
      const outcome = trades.length ? await importTrades(trades) : { added: 0, invalid: 0 }
      if (outcome.invalid) throw new Error(`${outcome.invalid} trades were rejected; report will be retried`)
      result.files++
      result.added += outcome.added
      if (!result.accounts.includes(report.account)) result.accounts.push(report.account)
      const latest = trades.map((t) => t.date).sort().pop() ?? ''
      if (latest > result.latestDate) result.latestDate = latest
      seen[file.name] = file.lastModified
    } catch (err) {
      result.errors.push(`${file.name}: ${err instanceof Error ? err.message : 'could not be read'}`)
    }
  }
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
  } catch {
    // Without storage every sync re-checks all files, which is still safe.
  }
  return result
}
