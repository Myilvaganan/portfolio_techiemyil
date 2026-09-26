import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const login = vi.hoisted(() => vi.fn())
vi.mock('@/lib/adminVault', () => {
  class TwoFactorRequired extends Error {}
  return { loginAdmin: login, TwoFactorRequired }
})

import { TwoFactorRequired } from '@/lib/adminVault'
import { ThemeProvider } from '@/hooks/useTheme'
import { AdminLogin } from './AdminLogin'

const renderLogin = (onSuccess: () => void) =>
  render(
    <ThemeProvider>
      <AdminLogin onSuccess={onSuccess} />
    </ThemeProvider>,
  )

describe('AdminLogin', () => {
  it('asks for a code after the password, then signs in with it', async () => {
    login.mockRejectedValueOnce(new TwoFactorRequired('Enter the code'))
    login.mockResolvedValueOnce(undefined)
    const onSuccess = vi.fn()
    const user = userEvent.setup()
    renderLogin(onSuccess)
    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Password'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))
    expect(await screen.findByText('Two-step verification')).toBeInTheDocument()
    expect(login).toHaveBeenLastCalledWith('admin', 'secret', undefined)
    await user.type(screen.getByLabelText('Code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    expect(login).toHaveBeenLastCalledWith('admin', 'secret', '123456')
    expect(onSuccess).toHaveBeenCalled()
  })

  it('shows a wrong code as an error and stays on the code step', async () => {
    login.mockRejectedValueOnce(new TwoFactorRequired('first'))
    login.mockRejectedValueOnce(new TwoFactorRequired('That code is not right.'))
    const user = userEvent.setup()
    renderLogin(() => {})
    await user.type(screen.getByLabelText('Username'), 'a')
    await user.type(screen.getByLabelText('Password'), 'b')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))
    await user.type(await screen.findByLabelText('Code'), '000000')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That code is not right.')
    expect(screen.getByLabelText('Code')).toBeInTheDocument()
  })
})
