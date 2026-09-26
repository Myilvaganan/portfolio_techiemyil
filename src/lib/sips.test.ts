import { describe, expect, it } from 'vitest'
import { detectSips, sipBrand } from './sips'
import type { Txn } from './statements'

const t = (date: string, description: string, debit: number): Txn => ({ id: date + description, statementId: 's', accountKey: 'a', date, description, merchant: '', debit, credit: 0, category: 'Investments' })

describe('sips', () => {
  it('detects a monthly SIP, next date and a missed month', () => {
    const txns = [t('2026-01-05', 'NSE CLEARING MFSS SIP', 5000), t('2026-02-05', 'NSE CLEARING MFSS SIP', 5000), t('2026-04-06', 'NSE CLEARING MFSS SIP', 5000), t('2026-05-05', 'NSE CLEARING MFSS SIP', 5000), t('2026-05-09', 'SWIGGY', 300)]
    const [s] = detectSips(txns, '2026-05-20')
    expect(s.name).toBe('NSE Clearing (MFSS)')
    expect(s.monthsActive).toBe(4)
    expect(s.total).toBe(20000)
    expect(s.missedMonths).toEqual(['2026-03'])
    expect(s.nextExpected).toBe('2026-06-05')
    expect(s.active).toBe(true)
  })
  it('ignores one-offs, crypto and yearly payments', () => {
    expect(detectSips([t('2026-01-05', 'ZERODHA COIN', 1000), t('2026-02-05', 'ZERODHA COIN', 1000)], '2026-03-01')).toEqual([])
    expect(sipBrand({ description: 'COINSWITCH SIP', merchant: '' })).toBeNull()
    const yearly = [t('2023-03-05', 'HDFC MUTUAL FUND', 9000), t('2024-03-05', 'HDFC MUTUAL FUND', 9000), t('2025-03-05', 'HDFC MUTUAL FUND', 9000)]
    expect(detectSips(yearly, '2025-04-01')).toEqual([])
  })
  it('flags a stalled SIP as missed and inactive', () => {
    const txns = ['2025-01', '2025-02', '2025-03'].map((m) => t(`${m}-10`, 'GROWW SIP', 2000))
    const [s] = detectSips(txns, '2025-09-01')
    expect(s.active).toBe(false)
    expect(s.missedMonths.length).toBeGreaterThan(3)
  })
})
