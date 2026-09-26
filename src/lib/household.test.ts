import { describe, expect, it } from 'vitest'
import type { Txn } from './statements'
import { classify, groupStats, householdTxns, lastMonths, nextRentDue } from './household'

const txn = (date: string, description: string, merchant: string, debit: number, category = 'Other', credit = 0): Txn =>
  ({ id: `${date}${description}${debit}`, statementId: 's', accountKey: 'a', date, description, merchant, debit, credit, category }) as Txn

describe('household classify', () => {
  it('routes rent by the payee UPI id even when the merchant name was mis-read', () => {
    expect(classify(txn('2025-01-05', 'UPI/Appu Samy/XXXX8921@IDIB/UPI/INDIAN BAN', 'Appu Samy', 1, 'Transfer'))?.group).toBe('rentSalem')
    expect(classify(txn('2025-01-05', 'UPI/C VISHALAK/jagannatht863@/Home Rent/KARNA', 'C VISHALAK', 1, 'Rent'))?.group).toBe('rentBengaluru')
    expect(classify(txn('2025-01-05', 'UPI/XXXX5717@ybl/Dec 2024/Karnataka Bank', 'Appu Samy House', 1, 'Food & Dining'))?.group).toBe('rentBengaluru')
    expect(classify(txn('2025-01-05', 'UPI/XXXX8927/Room rent/veer. dayma@okax/Axis', 'Veer Dayma', 1, 'Rent'))?.group).toBe('rentOther')
  })

  it('finds utilities, bike costs and delivery apps, and skips card payments, EMIs and surcharges', () => {
    expect(classify(txn('2025-01-05', 'BESCOM BBPS', 'BESCOM', 1))).toEqual({ group: 'electricity', brand: 'BESCOM' })
    expect(classify(txn('2025-01-05', 'TANGEDCO bill', 'TNEB', 1))?.brand).toBe('TANGEDCO')
    expect(classify(txn('2025-01-05', '/UPI/ICICI Bank UPI/P2M/XXXX3263/INDIAN OIL', 'Indian Oil', 1, 'Fuel'))?.group).toBe('fuel')
    expect(classify(txn('2025-01-05', 'IOCL Indane gas', 'IOCL Indane', 1, 'Fuel'))?.group).toBe('cookingGas')
    expect(classify(txn('2025-01-05', 'UPI/ELECTRONIC/mab.XXXX0177/BIKE SERVI/AXIS B', 'Electronic', 1))?.group).toBe('bikeService')
    expect(classify(txn('2025-01-05', 'ROYAL ENFIELD SALEM IN', 'Royal Enfield', 1, 'Shopping'))?.group).toBe('bikeService')
    expect(classify(txn('2025-01-05', 'UPI/Swiggy Instamart', 'Swiggy Instamart', 1))).toEqual({ group: 'quickCommerce', brand: 'Instamart' })
    expect(classify(txn('2025-01-05', 'UPI/Swiggy/order', 'Swiggy', 1))).toEqual({ group: 'food', brand: 'Swiggy' })
    expect(classify(txn('2025-01-05', 'UPI/Rapido', 'Rapido', 1))?.group).toBe('rides')
    expect(classify(txn('2025-01-05', 'UPI/amznlpa-t5ehezz/Request from Am/Amazon', 'Appu Samy House', 1))).toBeNull()
    expect(classify(txn('2025-01-05', 'AMAZON PAY INDIA PVT LT BANGALORE IN', 'Amazon', 1))?.group).toBe('shopping')
    expect(classify(txn('2025-01-05', 'BIL/XXXX5989/ICICI BANK CREDIT CA', 'Appu Samy House', 1))).toBeNull()
    expect(classify(txn('2025-01-05', 'Amazon EMI', 'Amazon', 1, 'EMI & Loans'))).toBeNull()
    expect(classify(txn('2025-01-05', 'UPI/Amazon Pay/amazonpaylater/Request fr/YES BANK', 'Amazon Pay Later', 8115, 'Shopping'))).toBeNull()
    expect(classify(txn('2025-01-05', 'Fuel Surcharge', 'Fuel Surcharge', 1, 'Fees & Interest'))).toBeNull()
  })
})

describe('household stats', () => {
  it('nets refunds, spreads by month and marks paid rent months', () => {
    const list = householdTxns(
      [
        txn('2026-08-05', 'UPI/Appu Samy/XXXX8921@IDIB', 'Appu Samy', 10000, 'Rent'),
        txn('2026-09-05', 'UPI/Appu Samy/XXXX8921@IDIB', 'Appu Samy', 10000, 'Rent'),
        txn('2026-09-10', 'UPI/Zomato', 'Zomato', 500, 'Food & Dining'),
        txn('2026-09-11', 'UPI/Zomato refund', 'Zomato', 0, 'Refund', 200),
      ],
      [txn('2026-09-12', 'SWIGGY BANGALORE', 'Swiggy', 350, 'Food & Dining')],
    )
    const months = lastMonths('2026-09', 3)
    expect(months).toEqual(['2026-07', '2026-08', '2026-09'])
    const stats = groupStats(list, months, '2026-09')
    const rent = stats.find((s) => s.id === 'rentSalem')!
    expect(rent).toMatchObject({ total: 20000, thisMonth: 10000, lastMonth: 10000, paid: [false, true, true] })
    expect(nextRentDue(rent.last)).toBe('2026-10-05')
    const food = stats.find((s) => s.id === 'food')!
    expect(food).toMatchObject({ total: 650, count: 2, thisMonth: 650 })
    expect(food.brands.map((b) => b.brand)).toEqual(['Swiggy', 'Zomato'])
  })
})
