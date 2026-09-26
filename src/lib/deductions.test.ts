import { describe, expect, it } from 'vitest'
import { detectDeductions, LIMIT_80C } from './deductions'
import type { Txn } from './statements'

const t = (date: string, description: string, debit: number): Txn => ({ id: date + description, statementId: 's', accountKey: 'a', date, description, merchant: '', debit, credit: 0, category: 'Other' })

describe('deductions', () => {
  const txns = [
    t('2025-06-01', 'LIC PREMIUM 12345', 30000),
    t('2025-07-01', 'PPF DEPOSIT', 100000),
    t('2025-08-01', 'STAR HEALTH INSURANCE', 18000),
    t('2025-09-01', 'NPS TRUST TIER1', 20000),
    t('2024-06-01', 'LIC PREMIUM', 99999),
  ]
  it('finds amounts inside the financial year only', () => {
    const [c80, d80, nps] = detectDeductions(txns, '2025-26')
    expect(c80.found).toBe(130000)
    expect(c80.headroom).toBe(20000)
    expect(d80.found).toBe(18000)
    expect(d80.headroom).toBe(7000)
    expect(nps.headroom).toBe(30000)
  })
  it('adds home-loan principal and caps the counted amount', () => {
    const [c80] = detectDeductions(txns, '2025-26', { homeLoanPrincipal: 60000 })
    expect(c80.found).toBe(190000)
    expect(c80.counted).toBe(LIMIT_80C)
    expect(c80.headroom).toBe(0)
  })
})
