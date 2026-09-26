import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const api = vi.hoisted(() => ({
  fetchSecurity: vi.fn(),
  startTwoFactor: vi.fn(),
  enableTwoFactor: vi.fn(),
  disableTwoFactor: vi.fn(),
  newRecoveryCodes: vi.fn(),
}))
vi.mock('@/lib/platformApi', () => api)
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,AAAA') } }))

import { Security } from './Security'

const off = { enabled: false, recoveryLeft: 0, enabledAt: null, disabledByServer: false, maxFailures: 5, lockMinutes: 15 }

describe('Security page', () => {
  it('walks through setup: QR and key, confirm with a code, then shows the recovery codes once', async () => {
    api.fetchSecurity.mockResolvedValue(off)
    api.startTwoFactor.mockResolvedValue({ secret: 'ABCDEFGHIJKLMNOP', uri: 'otpauth://totp/x' })
    api.enableTwoFactor.mockResolvedValue({ recoveryCodes: ['AAAAA-BBBBB', 'CCCCC-DDDDD'] })
    const user = userEvent.setup()
    render(<Security />)
    await user.click(await screen.findByRole('button', { name: /Set up two-step verification/ }))
    expect(await screen.findByAltText(/QR code/)).toBeInTheDocument()
    expect(screen.getByText('ABCD EFGH IJKL MNOP')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Code from your authenticator/), '123456')
    await user.click(screen.getByRole('button', { name: 'Turn on' }))
    expect(api.enableTwoFactor).toHaveBeenCalledWith('123456')
    expect(await screen.findByText('AAAAA-BBBBB')).toBeInTheDocument()
    expect(screen.getByText(/won.t be shown again/)).toBeInTheDocument()
  })

  it('shows the on state and needs a code to turn it off', async () => {
    api.fetchSecurity.mockResolvedValue({ ...off, enabled: true, recoveryLeft: 6, enabledAt: '2026-09-26T00:00:00Z' })
    api.disableTwoFactor.mockRejectedValueOnce(new Error('That code is not right.'))
    const user = userEvent.setup()
    render(<Security />)
    expect(await screen.findByText(/Two-step verification is on/)).toBeInTheDocument()
    expect(screen.getByText(/6 recovery codes left/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Turn off/ }))
    await user.type(screen.getByLabelText(/Code from your authenticator/), '000000')
    await user.click(screen.getByRole('button', { name: /Turn off two-step verification/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That code is not right.')
  })
})
