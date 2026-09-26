import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Mt5FolderSync } from './Mt5FolderSync'
import { folderPermission, folderSyncSupported, savedFolder, syncFolder } from '@/lib/mt5Folder'
vi.mock('@/lib/mt5Folder', () => ({ folderPermission: vi.fn(), folderSyncSupported: vi.fn(), savedFolder: vi.fn(), syncFolder: vi.fn(), forgetFolder: vi.fn(), pickFolder: vi.fn() }))
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(folderSyncSupported).mockReturnValue(true)
  vi.mocked(savedFolder).mockResolvedValue({ name: 'Reports' } as Awaited<ReturnType<typeof savedFolder>>)
  vi.mocked(folderPermission).mockResolvedValue('granted')
  vi.mocked(syncFolder).mockResolvedValue({ files: 1, added: 2, accounts: ['123'], latestDate: '2026-09-25', errors: [] })
})
it('syncs a saved folder and refreshes the journal', async () => {
  const refreshed = vi.fn()
  render(<Mt5FolderSync onSynced={refreshed} />)
  expect(await screen.findByText('1 updated reports · 2 new trades')).toBeInTheDocument()
  expect(refreshed).toHaveBeenCalledOnce()
})
it('requires a click before requesting permission again', async () => {
  vi.mocked(folderPermission).mockResolvedValueOnce('prompt').mockResolvedValue('granted')
  render(<Mt5FolderSync onSynced={() => {}} />)
  expect(await screen.findByText(/Click Sync folder/)).toBeInTheDocument()
  expect(syncFolder).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Sync folder' }))
  await waitFor(() => expect(syncFolder).toHaveBeenCalledOnce())
  expect(vi.mocked(folderPermission).mock.calls[1][1]).toBe(true)
})
it('reports a folder read failure and lets the user retry', async () => {
  vi.mocked(syncFolder).mockRejectedValueOnce(new Error('Folder unavailable'))
  render(<Mt5FolderSync onSynced={() => {}} />)
  expect(await screen.findByText('Folder unavailable')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Sync folder' }))
  expect(await screen.findByText('1 updated reports · 2 new trades')).toBeInTheDocument()
})
