import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { parseBankStatement, parseIcici, parseAxis } = require('./bankParse.js')
const { classifyBankRow } = require('./bankClassify.js')
const { detectBank } = require('./statements.js')

// Synthetic statements in the two layouts (no real account data).
const ICICI = [
  '=== page 1 ===',
  'Statement of Transactions in Saving Account no. 000000000000 in INR for the period August 1, 2025 - August 31, 2025',
  'Transaction | Withdrawal | Deposit | Balance',
  'S No. | Cheque Number | Transaction Remarks',
  'Date | Amount (INR) | Amount (INR) | (INR)',
  'Zomato',
  '1 | 03.08.2025 | 450.00 | 9550.00',
  'UPI/Zomato/zomato@hdfc/UPI/HDFC',
  'BANK/558191374943/ICI10d31',
  'Self Payee',
  '2 | 04.08.2025 | 20000.00 | 29550.00',
  'UPI/S MYILVAG/ICIC/UPI/',
  'Credit trxn',
  '3 | 05.08.2025 | 100000.00 | 129550.00',
  'NEFT-N1-EXAMPLE TECHNOLOGIES LIMITED-SAL',
  'Indian Oil',
  '4 | 06.08.2025 | 500.00 | 129050.00',
  'UPI/Indian Oil/q1@ybl/UPI/YES BANK L/6255',
  'www.icici.bank.in | Dial your Bank 1800-1080',
]

const AXIS = [
  'Statement of Axis Account No: 000000000000000 for the period (From: 01-11-2025  To: 07-09-2026)',
  'Tran Date | Chq No | Particulars | Debit | Credit | Balance | Init.',
  'OPENING BALANCE | 10000.00',
  'UPI/P2M/604329591361/KOTAK',
  '12-02-2026 | MAH/CHANNEL/AMB | 400.00 | 9600.00 3960',
  'UPI/P2M/715676360486/ZERODHA BROKING',
  '17-02-2026 | LIMIT/385125/HDFC BANK LTD | 1500.00 | 8100.00 3960',
  'UPI/P2A/708767390296/S MYILVAG/ICIC/UPI/',
  '29-02-2026 | X | 9000.00 | 17100.00 3960',
]

describe('bank statement parsers', () => {
  it('reads ICICI rows with the payee tag above the row and proves each amount with the balance', () => {
    expect(detectBank(ICICI)).toBe('icici')
    const r = parseBankStatement('icici', ICICI, 10000)
    expect(r.rows.map((x) => [x.debit, x.credit, x.balance])).toEqual([[450, 0, 9550], [20000, 0, 29550].map((v, i) => (i === 1 ? 20000 : v)).slice(0, 3) && [0, 20000, 29550], [0, 100000, 129550], [500, 0, 129050]])
    expect(r.breaks).toBe(0)
    expect(r.rows[1].tag).toBe('Self Payee')
  })

  it('never files a transfer between my own accounts under a merchant that was printed above it', () => {
    const [zomato, self, salary, oil] = parseBankStatement('icici', ICICI, 10000).rows.map((x) => classifyBankRow(x))
    expect(zomato).toMatchObject({ merchant: 'Zomato', category: 'Food & Dining', channel: 'UPI' })
    expect(self.category).toBe('Transfer')
    expect(salary.category).toBe('Salary')
    expect(oil).toMatchObject({ merchant: 'Indian Oil', category: 'Fuel' })
  })

  it('reads Axis rows whose remarks start on the line above the date', () => {
    expect(detectBank(AXIS)).toBe('axis')
    const { rows, opening } = parseAxis(AXIS)
    expect(opening).toBe(10000)
    expect(rows.map((r) => r.amount)).toEqual([400, 1500, 9000])
    expect(rows[0].description).toContain('KOTAK MAH')
    const parsed = parseBankStatement('axis', AXIS)
    expect(parsed.rows.map((r) => [r.debit, r.credit])).toEqual([[400, 0], [1500, 0], [0, 9000]])
    expect(parsed.breaks).toBe(0)
    expect(classifyBankRow(parsed.rows[1]).category).toBe('Investments')
  })

  it('does not depend on parseIcici being handed anything but lines', () => {
    expect(parseIcici(['nothing here'])).toEqual([])
  })
})
