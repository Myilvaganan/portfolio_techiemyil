import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StatementUploader } from './StatementUploader'
import * as api from '@/lib/statementsApi'

vi.mock('@/lib/statementsApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/statementsApi')>()), processStatementFile: vi.fn() }))

const pdf = (name: string) => new File(['%PDF-1.4'], name, { type: 'application/pdf' })
const saved = (n: number) => ({ statement: { txnCount: n } as never, replaced: 0 })

describe('StatementUploader', () => {
  beforeEach(() => vi.clearAllMocks())

  it('accepts many files at once and reports each result', async () => {
    vi.mocked(api.processStatementFile).mockImplementation(async ({ file, onProgress }) => {
      onProgress({ stage: 'reading', done: 1, total: 2 })
      return saved(file.name.startsWith('a') ? 12 : 30)
    })
    const onSaved = vi.fn()
    const user = userEvent.setup()
    render(<StatementUploader kind="card" onSaved={onSaved} />)
    await user.upload(screen.getByLabelText('Upload statements'), [pdf('a-card.pdf'), pdf('b-card.pdf'), pdf('c-card.pdf')])
    await waitFor(() => expect(screen.getAllByText(/transactions saved/i)).toHaveLength(3))
    expect(api.processStatementFile).toHaveBeenCalledTimes(3)
    expect(onSaved).toHaveBeenCalledTimes(3)
    expect(screen.getByText(/12 transactions saved/)).toBeInTheDocument()
  })

  it('asks for the password once and unlocks every locked file with it', async () => {
    vi.mocked(api.processStatementFile).mockImplementation(async ({ file, password }) => {
      if (password !== 'secret') throw Object.assign(new api.StatementError('locked', 'password_required'), { uploadId: `id-${file.name}` })
      return saved(5)
    })
    const user = userEvent.setup()
    render(<StatementUploader kind="card" onSaved={() => {}} />)
    await user.upload(screen.getByLabelText('Upload statements'), [pdf('one.pdf'), pdf('two.pdf')])
    expect(await screen.findAllByText(/password protected/i)).toHaveLength(2)
    const unlock = screen.getByRole('button', { name: /unlock 2 files/i })
    expect(unlock).toBeDisabled()
    await user.type(screen.getByPlaceholderText(/type once/i), 'secret')
    await user.click(unlock)
    await waitFor(() => expect(screen.getAllByText(/5 transactions saved/i)).toHaveLength(2))
    const retries = vi.mocked(api.processStatementFile).mock.calls.slice(2).map((c) => c[0])
    expect(retries.map((r) => r.resumeId).sort()).toEqual(['id-one.pdf', 'id-two.pdf'])
    expect(retries.every((r) => r.password === 'secret')).toBe(true)
  })

  it('says when the password was wrong', async () => {
    vi.mocked(api.processStatementFile).mockRejectedValue(Object.assign(new api.StatementError('wrong', 'wrong_password'), { uploadId: 'x' }))
    const user = userEvent.setup()
    render(<StatementUploader kind="bank" onSaved={() => {}} />)
    await user.type(screen.getByPlaceholderText(/type once/i), 'nope')
    await user.upload(screen.getByLabelText('Upload statements'), pdf('s.pdf'))
    expect(await screen.findByText(/did not open this pdf/i)).toBeInTheDocument()
  })

  it('rejects unsupported file types without uploading them', async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<StatementUploader kind="bank" onSaved={() => {}} />)
    await user.upload(screen.getByLabelText('Upload statements'), new File(['x'], 'photo.png', { type: 'image/png' }))
    expect(await screen.findByText(/only pdf, csv or txt/i)).toBeInTheDocument()
    expect(api.processStatementFile).not.toHaveBeenCalled()
  })
})
