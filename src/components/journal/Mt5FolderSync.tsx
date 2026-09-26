import { useCallback, useEffect, useRef, useState } from 'react'
import { folderPermission, folderSyncSupported, forgetFolder, pickFolder, savedFolder, syncFolder } from '@/lib/mt5Folder'
import { pillClass } from './chrome'

/** Polls only while this journal is open. Browsers require a click to grant folder access. */
export function Mt5FolderSync({ onSynced }: { onSynced: () => void }) {
  const [handle, setHandle] = useState<Awaited<ReturnType<typeof savedFolder>>>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const running = useRef(false)
  const notify = useRef(onSynced)
  notify.current = onSynced

  const run = useCallback(async (folder: NonNullable<typeof handle>, ask = false) => {
    if (running.current) return
    running.current = true
    setBusy(true)
    try {
      if (await folderPermission(folder, ask) !== 'granted') {
        setMessage('Click Sync folder to allow access to your saved folder.')
        return
      }
      const result = await syncFolder(folder)
      setMessage(result.errors.length ? result.errors.join(' · ') : `${result.files} updated reports · ${result.added} new trades`)
      if (result.files) notify.current()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Folder sync failed. Try again.')
    } finally {
      running.current = false
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (folderSyncSupported()) void savedFolder().then((folder) => { if (!cancelled) setHandle(folder) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!handle) return
    void run(handle)
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void run(handle)
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [handle, run])

  if (!folderSyncSupported()) return null
  return <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
    <button className={pillClass} disabled={busy} onClick={async () => {
      try { setHandle(await pickFolder()) } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) setMessage('Could not open the folder. Please try again.')
      }
    }}>{handle ? 'Change MT5 folder' : 'Connect MT5 folder'}</button>
    {handle && <>
      <button className={pillClass} disabled={busy} onClick={() => void run(handle, true)}>{busy ? 'Syncing…' : 'Sync folder'}</button>
      <button className={pillClass} disabled={busy} onClick={async () => {
        try { await forgetFolder(); setHandle(undefined); setMessage('Folder disconnected.') }
        catch { setMessage('Could not disconnect the folder. Please try again.') }
      }}>Disconnect</button>
    </>}
    <span role="status">{message || 'Checks exported reports every minute while Forex is open.'}</span>
  </div>
}
