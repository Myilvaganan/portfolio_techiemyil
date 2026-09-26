import { describe, expect, it } from 'vitest'
import type { Txn } from './statements'
import { classifyTax, effectiveRate, fyOf, latestPerYear, missingYears, parseReturn, taxTxns, totals, verifyChallans } from './tax'

// Trimmed, made-up returns in the shape of the portal's JSON (no real identifiers).
const itr1 = (over: Record<string, unknown> = {}) => ({
  ITR: {
    ITR1: {
      CreationInfo: { JSONCreationDate: '2025-09-05' },
      Form_ITR1: { FormName: 'ITR-1', AssessmentYear: '2025' },
      FilingStatus: { OptOutNewTaxRegime: 'N', ItrFilingDueDate: '2025-07-31' },
      ITR1_IncomeDeductions: {
        GrossSalary: 1400000,
        AllwncExemptUs10: { AllwncExemptUs10Dtls: [{ SalNatureDesc: '10(10A)', SalOthAmount: 30000 }], TotalAllwncExemptUs10: 30000 },
        DeductionUs16: 75000,
        IncomeFromSal: 1295000,
        IncomeOthSrc: 500,
        GrossTotIncome: 1295500,
        DeductUndChapVIA: { Section80C: 0, Section80D: 0, TotalChapVIADeductions: 0 },
        TotalIncome: 1295500,
      },
      ITR1_TaxComputation: { TaxPayableOnRebate: 100000, Rebate87A: 0, EducationCess: 4000, GrossTaxLiability: 104000, NetTaxLiability: 104000, IntrstPay: { IntrstPayUs234B: 1500, IntrstPayUs234C: 500, IntrstPayUs234A: 0, LateFilingFee234F: 0 } },
      TaxPaid: { TaxesPaid: { TDS: 70000, TCS: 0, AdvanceTax: 0, SelfAssessmentTax: 36000, TotalTaxesPaid: 106000 } },
      Refund: { RefundDue: 0 },
      TDSonSalaries: { TDSonSalary: [{ EmployerOrDeductorOrCollectDetl: { TAN: 'AAAA00000A', EmployerOrDeductorOrCollecterName: 'ACME LTD' }, IncChrgSal: 1400000, TotalTDSSal: 70000 }] },
      TaxPayments: { TaxPayment: [{ BSRCode: '0510002', DateDep: '2025-09-05', SrlNoOfChaln: 1, Amt: 36000 }] },
      ...over,
    },
  },
})

describe('parseReturn', () => {
  it('reads an ITR-1: income, tax, interest, payments and regime', () => {
    const r = parseReturn(itr1(), '1.json')!
    expect(r).toMatchObject({ ay: '2025', form: 'ITR-1', regime: 'new', filedOn: '2025-09-05', dueDate: '2025-07-31', refund: 0 })
    expect(r.income).toMatchObject({ grossSalary: 1400000, salary: 1295000, taxable: 1295500, exemptAllowances: 30000 })
    expect(r.tax).toMatchObject({ beforeRebate: 100000, liability: 104000, total: 106000 })
    expect(r.paid).toMatchObject({ tds: 70000, selfAssessment: 36000, total: 106000 })
    expect(r.employers).toEqual([{ name: 'ACME LTD', tan: 'AAAA00000A', income: 1400000, tds: 70000 }])
    expect(r.challans).toEqual([{ date: '2025-09-05', bsr: '0510002', serial: 1, amount: 36000 }])
    expect(effectiveRate(r)).toBeCloseTo(8.03, 1)
  })

  it('adds the rebate back to get the tax before rebate, and reads the old regime flags', () => {
    const r = parseReturn(
      itr1({
        FilingStatus: { NewTaxRegime: 'N' },
        ITR1_TaxComputation: { TaxPayableOnRebate: 0, Rebate87A: 11122, GrossTaxLiability: 0, NetTaxLiability: 0 },
        ITR1_IncomeDeductions: { DeductUndChapVIA: { Section80C: 27873, Section80D: 0, TotalChapVIADeductions: 27873 }, TotalIncome: 472430 },
      }),
    )!
    expect(r.regime).toBe('old')
    expect(r.tax).toMatchObject({ beforeRebate: 11122, rebate87A: 11122, liability: 0, total: 0 })
    expect(r.deductions).toEqual([{ label: '80C', amount: 27873 }])
  })

  it('reads an ITR-3: schedules, trading loss, carried-forward loss and foreign assets', () => {
    const r = parseReturn({
      ITR: {
        ITR3: {
          CreationInfo: { JSONCreationDate: '2026-07-30' },
          Form_ITR3: { FormName: 'ITR-3', AssessmentYear: '2026' },
          PartA_GEN1: { FilingStatus: { F10IEACurrAYOldRegime: 'N', ItrFilingDueDate: '2026-08-31' } },
          TradingAccount: { TotRevenueFrmOperations: 90000, GrossProfitFrmBusProf: -60000 },
          ITR3ScheduleBP: { IncChrgUnHdProftGain: -60000 },
          ScheduleS: { TotalGrossSalary: 2400000, DeductionUS16: 75000, TotIncUnderHeadSalaries: 2325000, Salaries: [{ NameOfEmployer: 'ACME LTD', TANofEmployer: 'AAAA00000A', Salarys: { GrossSalary: 2400000 } }] },
          ScheduleCFL: { TotalLossCFSummary: { LossSummaryDetail: { BusLossOthThanSpecLossCF: 23000 } } },
          ScheduleTDS1: { TDSonSalary: [{ EmployerOrDeductorOrCollectDetl: { TAN: 'AAAA00000A', EmployerOrDeductorOrCollecterName: 'ACME LTD' }, IncChrgSal: 2400000, TotalTDSSal: 250000 }] },
          ScheduleIT: { TaxPayment: [{ BSRCode: '0510002', DateDep: '2026-07-31', SrlNoOfChaln: 9, Amt: 46000 }] },
          'PartB-TI': { Salaries: 2325000, CapGain: { ShortTerm: { TotalShortTerm: 25000 }, LongTerm: { TotalLongTerm: 6000 } }, TotalIncome: 2325000, GrossTotalIncome: 2325000 },
          PartB_TTI: {
            ComputationOfTaxLiability: { TaxPayableOnTI: { TaxPayableOnRebate: 280000, Rebate87A: 0, EducationCess: 11200, GrossTaxLiability: 291200 }, NetTaxLiability: 291200, IntrstPay: { IntrstPayUs234B: 1700, IntrstPayUs234C: 2100 } },
            TaxPaid: { TaxesPaid: { TDS: 250000, SelfAssessmentTax: 46000, TotalTaxesPaid: 296000 }, BalTaxPayable: 0 },
            Refund: { RefundDue: 0 },
            AssetOutIndiaFlag: 'YES',
          },
        },
      },
    })!
    expect(r).toMatchObject({ ay: '2026', form: 'ITR-3', regime: 'new', lossCarriedForward: 23000, foreignAssets: true })
    expect(r.income).toMatchObject({ grossSalary: 2400000, salary: 2325000, business: -60000, shortTermGains: 25000, longTermGains: 6000 })
    expect(r.trading).toEqual({ turnover: 90000, profitLoss: -60000 })
    expect(r.tax).toMatchObject({ liability: 291200, total: 295000 })
    expect(r.employers[0]).toMatchObject({ tds: 250000, income: 2400000 })
    expect(r.challans[0].amount).toBe(46000)
  })

  it('returns null for anything that is not a return', () => {
    expect(parseReturn({})).toBeNull()
    expect(parseReturn({ ITR: { ITR9: {} } })).toBeNull()
    expect(parseReturn({ ITR: { ITR1: { Form_ITR1: { AssessmentYear: 'x' } } } })).toBeNull()
  })
})

describe('years and totals', () => {
  const a = parseReturn(itr1())!
  const b = { ...a, ay: '2023', filedOn: '2023-07-01', refund: 500, tax: { ...a.tax, liability: 0, total: 0 }, paid: { ...a.paid, total: 500, tds: 500, selfAssessment: 0, advance: 0 } }

  it('keeps the later filing per year and sorts by year', () => {
    const revised = { ...a, filedOn: '2025-10-01', paid: { ...a.paid, total: 1 } }
    expect(latestPerYear([revised, a, b]).map((r) => [r.ay, r.paid.total])).toEqual([['2023', 500], ['2025', 1]])
  })

  it('sums cost, cash paid, refunds and interest, and finds missing years', () => {
    const list = latestPerYear([a, b])
    expect(totals(list)).toMatchObject({ cost: 106000, paid: 106500, refunds: 500, interest: 2000, selfPaid: 36000 })
    expect(missingYears(list)).toEqual(['2024'])
  })

  it('puts April to March in one financial year', () => {
    expect(fyOf('2026-03-31')).toBe('2025-26')
    expect(fyOf('2026-04-01')).toBe('2026-27')
  })
})

const txn = (over: Partial<Txn>): Txn => ({ id: Math.random().toString(), statementId: 's', accountKey: 'a', date: '2025-09-05', description: '', merchant: '', debit: 0, credit: 0, category: 'Other', ...over })

describe('classifyTax', () => {
  it.each([
    [{ description: 'UPI/INCOME TAX DEPT/ADVANCE TAX', debit: 36000 }, 'taxPaid'],
    [{ description: 'TAXES', category: 'Taxes', debit: 500 }, 'taxPaid'],
    [{ description: 'ITD REFUND INCOME TAX', credit: 35980 }, 'refund'],
    [{ description: 'PROFESSIONAL TAX', category: 'Taxes', debit: 200 }, 'otherTax'],
    [{ description: 'NEFT ACME LTD SALARY', category: 'Salary', credit: 150000 }, 'salary'],
    [{ description: 'CREDIT INTEREST', category: 'Interest', credit: 431 }, 'interest'],
    [{ description: 'ACH DIVIDEND INFY', credit: 90 }, 'dividend'],
    [{ description: 'HDFC LIFE PREMIUM', category: 'Insurance', debit: 20000 }, 'ded80C'],
    [{ description: 'STAR HEALTH INSURANCE', category: 'Insurance', debit: 8000 }, 'ded80D'],
    [{ description: 'UPI/ZERODHA BROKING/FUNDS', debit: 50000 }, 'trading'],
    [{ description: 'UPI/Zomato/order', category: 'Food & Dining', debit: 450 }, null],
  ])('%j → %s', (over, kind) => {
    expect(classifyTax(txn(over as Partial<Txn>), 'bank')).toBe(kind)
  })

  it('ignores card bill payments', () => {
    expect(classifyTax(txn({ description: 'CREDIT CARD PAYMENT', category: 'Card Payment', debit: 20000 }), 'card')).toBeNull()
  })
})

describe('taxTxns and challans', () => {
  it('collects rent as an HRA candidate and matches a challan to the bank debit', () => {
    const bank = [
      txn({ id: 't1', date: '2025-09-06', description: 'UPI/INCOME TAX DEPT/CHALLAN', debit: 36000 }),
      txn({ id: 'r1', date: '2025-08-05', description: 'UPI/Appu Samy/XXXX8921@IDIB', merchant: 'Appu Samy', debit: 10000, category: 'Rent' }),
    ]
    const list = taxTxns(bank, [])
    expect(list.map((t) => [t.kind, t.fy])).toEqual([['rent', '2025-26'], ['taxPaid', '2025-26']])
    const [check] = verifyChallans(parseReturn(itr1())!, list)
    expect(check.match?.id).toBe('t1')
  })
})
