import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OptionsAnalytics } from './OptionsAnalytics'
import * as store from '@/lib/optionsStore'
import { demoFills } from '@/lib/optionsDemo'
import dhanCsv from '@/lib/fixtures/dhanGlobalTransaction.csv?raw'

vi.mock('@/lib/optionsStore', () => ({
  fetchStoredBrokers: vi.fn(),
  fetchStoredFills: vi.fn(),
  saveFills: vi.fn(),
  clearStoredFills: vi.fn(),
}))

const ZERODHA_CSV = [
  'symbol,isin,trade_date,exchange,segment,series,trade_type,auto_square,quantity,price,trade_id,order_id,order_execution_time',
  'NIFTY2592324500CE,,2025-09-22,NSE,FO,,buy,false,75,100,1,11,2025-09-22T09:31:10',
  'NIFTY2592324500CE,,2025-09-22,NSE,FO,,sell,false,75,140,2,12,2025-09-22T10:05:00',
  'NIFTY2592324600PE,,2025-09-22,NSE,FO,,sell,false,75,80,3,13,2025-09-22T11:00:00',
  'NIFTY2592324600PE,,2025-09-22,NSE,FO,,buy,false,75,100,4,14,2025-09-22T11:20:00',
].join('\n')

// A different broker: other column names, contract written out in words, day-first dates, AM/PM.
const OTHER_CSV = [
  'Scrip Name,Action,Traded Qty,Rate,Trade Date',
  'NIFTY 25 SEP 2025 24500 CE,B,75,100,22-Sep-2025 09:31:10 AM',
  'NIFTY 25 SEP 2025 24500 CE,S,75,110,22-Sep-2025 10:05:00 AM',
].join('\n')

// jsdom's File has no text(); browsers do.
const csvFile = (content: string, name: string) => Object.assign(new File([content], name, { type: 'text/csv' }), { text: async () => content })

const mockVault = (vault: Record<string, unknown[]>) => {
  vi.mocked(store.fetchStoredBrokers).mockResolvedValue(Object.keys(vault))
  vi.mocked(store.fetchStoredFills).mockImplementation(async (id) => (vault[id] ?? []) as never)
}

const ICICI_CSV = [
  'Trade Date,Contract Descriptor,Exchange,Action,Qty,Price,Value,Order Ref.,Securities Transaction Tax-STT,Transaction Charges,Stamp Duty,SEBI Turnover Charges,Brokerage,Service Tax On Brokerage,Total Charges',
  '"10-Sep-26","OPT-SENSEX-10-Sep-2026-74900-P-E-I","BSE","Sell","1000","1.82","1812","#20260910A400081220","2.72","0.59","0","0","20","3.72","27.03"',
  '"10-Sep-26","OPT-SENSEX-10-Sep-2026-74900-P-E-I","BSE","Buy","1000","0.59","621","#20260910A400081063","0","0.2","0.02","0","20","3.62","23.84"',
].join('\n')

describe('OptionsAnalytics', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockVault({})
    vi.mocked(store.saveFills).mockImplementation(async (_b, fills) => ({ added: fills.length, total: fills.length }))
    vi.mocked(store.clearStoredFills).mockResolvedValue()
  })

  it('offers a tab per broker and asks for a file when the vault is empty', async () => {
    render(<OptionsAnalytics />)
    expect(await screen.findByRole('heading', { name: /import your zerodha options trades/i })).toBeInTheDocument()
    for (const name of ['All brokers', 'Zerodha', 'Dhan', 'ICICI Direct', 'Groww', 'Pocketful (GoPocket)', 'INDmoney']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('reloads every saved broker from the vault and combines them', async () => {
    mockVault({ zerodha: demoFills().slice(0, 120), dhan: demoFills().slice(120, 240) })
    render(<OptionsAnalytics />)
    expect(await screen.findByText('Win rate')).toBeInTheDocument()
    expect(store.fetchStoredFills).toHaveBeenCalledWith('zerodha')
    expect(store.fetchStoredFills).toHaveBeenCalledWith('dhan')
    expect(screen.getByText('By broker')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Zerodha ?120$/ })).toBeInTheDocument()
  })

  it('shows a single broker on its own', async () => {
    mockVault({ zerodha: demoFills().slice(0, 100), dhan: demoFills().slice(100, 200) })
    const user = userEvent.setup()
    render(<OptionsAnalytics />)
    await screen.findByText('By broker')
    await user.click(screen.getByRole('button', { name: /^Dhan/ }))
    expect(screen.queryByText('By broker')).not.toBeInTheDocument()
    expect(screen.getByText(/Charge assumptions — Dhan/)).toBeInTheDocument()
  })

  it('imports a Zerodha file into the selected broker', async () => {
    const user = userEvent.setup()
    render(<OptionsAnalytics />)
    await screen.findByRole('heading', { name: /import your zerodha options trades/i })
    await user.upload(screen.getByLabelText('Upload tradebook file'), csvFile(ZERODHA_CSV, 'tradebook.csv'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/saved 4 new zerodha option trades/i))
    expect(store.saveFills).toHaveBeenCalledTimes(1)
    expect(vi.mocked(store.saveFills).mock.calls[0][0]).toBe('zerodha')
    expect(vi.mocked(store.saveFills).mock.calls[0][1]).toHaveLength(4)
    expect(screen.getByText('2 closed trades')).toBeInTheDocument()
    expect(screen.getByText('50.0%')).toBeInTheDocument()
  })

  it('imports another broker’s differently-formatted file and stores it under that broker', async () => {
    const user = userEvent.setup()
    render(<OptionsAnalytics />)
    await screen.findByRole('heading', { name: /import your zerodha options trades/i })
    await user.click(screen.getByRole('button', { name: 'Dhan' }))
    await user.upload(screen.getByLabelText('Upload tradebook file'), csvFile(OTHER_CSV, 'dhan.csv'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/saved 2 new dhan option trades/i))
    expect(vi.mocked(store.saveFills).mock.calls[0][0]).toBe('dhan')
    expect(vi.mocked(store.saveFills).mock.calls[0][1][0]).toMatchObject({ symbol: 'NIFTY2592524500CE', side: 'BUY', time: '09:31:10' })
  })

  it('imports an ICICI Direct order book and shows the real charges from the statement', async () => {
    const user = userEvent.setup()
    render(<OptionsAnalytics />)
    await screen.findByRole('heading', { name: /import your zerodha options trades/i })
    await user.click(screen.getByRole('button', { name: 'ICICI Direct' }))
    await user.upload(screen.getByLabelText('Upload tradebook file'), csvFile(ICICI_CSV, 'OrderBook_FNO.csv'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/saved 2 new icici direct option trades/i))
    const saved = vi.mocked(store.saveFills).mock.calls[0]
    expect(saved[0]).toBe('icici')
    expect(saved[1][0]).toMatchObject({ symbol: 'SENSEX2691074900PE', chg: { stt: expect.any(Number), total: expect.any(Number) } })
    expect(screen.getByText('after your actual charges')).toBeInTheDocument()
    expect(screen.getAllByText('₹51').length).toBeGreaterThan(0)
  })

  it('imports a Dhan daily-summary report and shows the totals from the statement', async () => {
    const user = userEvent.setup()
    render(<OptionsAnalytics />)
    await screen.findByRole('heading', { name: /import your zerodha options trades/i })
    await user.click(screen.getByRole('button', { name: 'Dhan' }))
    await user.upload(screen.getByLabelText('Upload tradebook file'), csvFile(dhanCsv, 'Dhan_GlobalTransction_Report.csv'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/new dhan option trades.*daily summary report/i))
    expect(vi.mocked(store.saveFills).mock.calls[0][0]).toBe('dhan')
    expect(screen.getByText('after your actual charges')).toBeInTheDocument()
    expect(screen.getAllByText('₹11,654').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/-₹2,78,410/).length).toBeGreaterThan(0)
  })

  it('lets you map columns by hand when they can’t be detected', async () => {
    const user = userEvent.setup()
    render(<OptionsAnalytics />)
    await screen.findByRole('heading', { name: /import your zerodha options trades/i })
    const odd = ['c1,c2,c3,c4,c5', 'NIFTY25SEP24500CE,Buy,75,100,2025-09-22 09:30:00', 'NIFTY25SEP24500CE,Sell,75,130,2025-09-22 10:00:00'].join('\n')
    await user.upload(screen.getByLabelText('Upload tradebook file'), csvFile(odd, 'odd.csv'))
    const card = (await screen.findByRole('heading', { name: /match the columns in odd.csv/i })).closest('div')!.parentElement!
    expect(within(card).getByRole('button', { name: /import with this mapping/i })).toBeDisabled()
    const pick = (label: RegExp, col: string) => user.selectOptions(within(card).getByLabelText(label), col)
    await pick(/contract \/ symbol/i, 'c1')
    await pick(/buy \/ sell/i, 'c2')
    await pick(/^quantity/i, 'c3')
    await pick(/trade price/i, 'c4')
    await pick(/trade date/i, 'c5')
    await user.click(within(card).getByRole('button', { name: /import with this mapping/i }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/saved 2 new zerodha option trades/i))
  })

  it('warns when a file has no option trades', async () => {
    const user = userEvent.setup()
    render(<OptionsAnalytics />)
    await screen.findByRole('heading', { name: /import your zerodha options trades/i })
    const equity = ['symbol,trade_type,quantity,price,trade_date', 'RELIANCE,buy,5,2900,2025-09-22'].join('\n')
    await user.upload(screen.getByLabelText('Upload tradebook file'), csvFile(equity, 'eq.csv'))
    expect(await screen.findByRole('status')).toHaveTextContent(/no option trades were found/i)
    expect(store.saveFills).not.toHaveBeenCalled()
  })

  it('adds a custom broker', async () => {
    const user = userEvent.setup()
    render(<OptionsAnalytics />)
    await screen.findByRole('heading', { name: /import your zerodha options trades/i })
    await user.click(screen.getByRole('button', { name: /\+ add broker/i }))
    await user.type(screen.getByLabelText('New broker name'), 'Angel One{enter}')
    expect(await screen.findByRole('heading', { name: /import your angel one options trades/i })).toBeInTheDocument()
  })

  it('previews sample data and exits', async () => {
    const user = userEvent.setup()
    render(<OptionsAnalytics />)
    await user.click(await screen.findByRole('button', { name: /preview with sample data/i }))
    expect(screen.getByText(/showing sample trades/i)).toBeInTheDocument()
    expect(screen.getByText('By weekday')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^orders/i }))
    await user.click(screen.getByRole('button', { name: /exit preview/i }))
    expect(await screen.findByRole('heading', { name: /import your zerodha options trades/i })).toBeInTheDocument()
  })

  it('shows an error when the vault cannot be reached', async () => {
    vi.mocked(store.fetchStoredBrokers).mockRejectedValue(new Error('Could not reach the trade vault. Please try again.'))
    render(<OptionsAnalytics />)
    expect(await screen.findByRole('status')).toHaveTextContent(/could not reach the trade vault/i)
  })

  it('moves trades kept by the older browser-only version into the vault', async () => {
    const legacy = demoFills().slice(0, 4)
    localStorage.setItem('options_fills_v1', JSON.stringify(legacy))
    render(<OptionsAnalytics />)
    await screen.findByText('Win rate')
    expect(store.saveFills).toHaveBeenCalledWith('zerodha', legacy)
    expect(localStorage.getItem('options_fills_v1')).toBeNull()
  })

  it('deletes only the selected broker after confirming', async () => {
    mockVault({ zerodha: demoFills().slice(0, 60), dhan: demoFills().slice(60, 120) })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    render(<OptionsAnalytics />)
    await screen.findByText('By broker')
    await user.click(screen.getByRole('button', { name: /^Dhan/ }))
    await user.click(screen.getByRole('button', { name: /clear dhan/i }))
    await waitFor(() => expect(store.clearStoredFills).toHaveBeenCalledWith('dhan'))
    expect(store.clearStoredFills).toHaveBeenCalledTimes(1)
  })
})
