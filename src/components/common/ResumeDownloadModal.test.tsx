import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResumeDownloadModal } from './ResumeDownloadModal'
import { notifyResumeDownload } from '@/lib/download'
import { openResume } from '@/lib/resume'

vi.mock('@/lib/download', () => ({ notifyResumeDownload: vi.fn() }))
vi.mock('@/lib/resume', () => ({ openResume: vi.fn() }))

function setup() {
  const onOpenChange = vi.fn()
  render(<ResumeDownloadModal open onOpenChange={onOpenChange} />)
  return { onOpenChange, user: userEvent.setup() }
}

describe('ResumeDownloadModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks the download and asks for a name when it is empty', async () => {
    const { user, onOpenChange } = setup()

    await user.click(screen.getByRole('button', { name: /download resume/i }))

    expect(screen.getByText(/tell me your name/i)).toBeInTheDocument()
    expect(notifyResumeDownload).not.toHaveBeenCalled()
    expect(openResume).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('downloads with only a name; optional fields are omitted', async () => {
    const { user, onOpenChange } = setup()

    await user.type(screen.getByLabelText(/name \/ nickname/i), '  Jane  ')
    await user.click(screen.getByRole('button', { name: /download resume/i }))

    expect(notifyResumeDownload).toHaveBeenCalledWith({
      name: 'Jane',
      email: undefined,
      reason: undefined,
      reasonDetail: undefined,
    })
    expect(openResume).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('rejects a malformed optional email', async () => {
    const { user } = setup()

    await user.type(screen.getByLabelText(/name \/ nickname/i), 'Jane')
    await user.type(screen.getByLabelText(/^email/i), 'not-an-email')
    await user.click(screen.getByRole('button', { name: /download resume/i }))

    expect(screen.getByText(/doesn.t look right/i)).toBeInTheDocument()
    expect(openResume).not.toHaveBeenCalled()
  })

  it('sends email, reason and the "Other" detail when provided', async () => {
    const { user } = setup()

    await user.type(screen.getByLabelText(/name \/ nickname/i), 'Jane')
    await user.type(screen.getByLabelText(/^email/i), 'jane@acme.com')
    await user.selectOptions(screen.getByLabelText(/why are you here/i), 'Other')
    await user.type(screen.getByLabelText(/other reason/i), 'Saw your talk')
    await user.click(screen.getByRole('button', { name: /download resume/i }))

    expect(notifyResumeDownload).toHaveBeenCalledWith({
      name: 'Jane',
      email: 'jane@acme.com',
      reason: 'Other',
      reasonDetail: 'Saw your talk',
    })
  })
})
