import type { Txn } from './statements'
import { GROUP, householdTxns, type HouseGroup } from './household'

// Income-tax returns (the ITR JSON filed on the e-filing portal) reduced to the numbers a dashboard needs, plus the
// bank / card transactions that matter for tax. Aadhaar, address, phone and bank details are never kept.

export interface Line {
  label: string
  amount: number
}

export interface TdsLine {
  name: string
  tan: string
  income: number
  tds: number
}

export interface Challan {
  date: string
  bsr: string
  serial: number
  amount: number
}

export interface TaxReturn {
  /** Assessment year as filed: '2026' is AY 2026-27, i.e. the income of FY 2025-26. */
  ay: string
  form: string
  filedOn: string
  dueDate: string | null
  regime: 'old' | 'new' | 'unknown'
  /** Source file name (the portal names it after the acknowledgement number). */
  source: string
  income: {
    grossSalary: number
    exemptAllowances: number
    standardDeduction: number
    salary: number
    houseProperty: number
    business: number
    shortTermGains: number
    longTermGains: number
    otherSources: number
    grossTotal: number
    deductions: number
    taxable: number
  }
  allowances: Line[]
  deductions: Line[]
  tax: {
    beforeRebate: number
    rebate87A: number
    surcharge: number
    cess: number
    relief: number
    liability: number
    interest234A: number
    interest234B: number
    interest234C: number
    fee234F: number
    /** Liability plus interest and fee: what the year actually cost. */
    total: number
  }
  paid: { tds: number; tcs: number; advance: number; selfAssessment: number; total: number }
  refund: number
  payable: number
  employers: TdsLine[]
  otherTds: TdsLine[]
  challans: Challan[]
  trading: { turnover: number; profitLoss: number } | null
  lossCarriedForward: number
  foreignAssets: boolean
}

// ---------- Reading the portal JSON ----------

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj) : [])
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const first = (...vs: unknown[]) => vs.find((v) => v !== undefined && v !== null)

const SECTION_LABELS: Record<string, string> = {
  Section80C: '80C',
  Section80CCC: '80CCC',
  Section80CCDEmployeeOrSE: '80CCD(1)',
  Section80CCD1B: '80CCD(1B) NPS',
  Section80CCDEmployer: '80CCD(2) employer NPS',
  Section80D: '80D health insurance',
  Section80DD: '80DD',
  Section80DDB: '80DDB',
  Section80E: '80E education loan',
  Section80EE: '80EE',
  Section80EEA: '80EEA',
  Section80EEB: '80EEB',
  Section80G: '80G donations',
  Section80GG: '80GG',
  Section80GGA: '80GGA',
  Section80GGC: '80GGC',
  Section80TTA: '80TTA savings interest',
  Section80TTB: '80TTB',
  Section80U: '80U',
  AnyOthSec80CCH: '80CCH',
}

function deductionLines(via: Obj): Line[] {
  return Object.entries(SECTION_LABELS)
    .map(([key, label]) => ({ label, amount: num(via[key]) }))
    .filter((l) => l.amount > 0)
}

function challansOf(list: unknown): Challan[] {
  return arr(list)
    .map((c) => ({ date: str(c.DateDep), bsr: str(c.BSRCode), serial: num(c.SrlNoOfChaln), amount: num(c.Amt) }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
}

function tdsLines(list: unknown): TdsLine[] {
  return arr(list).map((r) => {
    const d = obj(r.EmployerOrDeductorOrCollectDetl)
    return { name: str(d.EmployerOrDeductorOrCollecterName), tan: str(d.TAN), income: num(first(r.IncChrgSal, r.AmtForTaxDeduct)), tds: num(first(r.TotalTDSSal, r.TotTDSOnAmtPaid)) }
  })
}

function regimeOf(filing: Obj, ay: number): TaxReturn['regime'] {
  if (filing.OptOutNewTaxRegime === 'Y') return 'old'
  if (filing.OptOutNewTaxRegime === 'N') return 'new'
  if (filing.NewTaxRegime === 'Y') return 'new'
  if (filing.NewTaxRegime === 'N') return 'old'
  if (filing.F10IEACurrAYOldRegime === 'Y') return 'old'
  // Business filers opt out of the new regime with Form 10-IEA; without it, from AY 2024-25 the new regime applies.
  if (filing.F10IEACurrAYOldRegime === 'N' && ay >= 2024) return 'new'
  return 'unknown'
}

/** Parses one ITR JSON (ITR-1 to ITR-4). Returns null when it isn't a return. */
export function parseReturn(json: unknown, source = ''): TaxReturn | null {
  const root = obj(obj(json).ITR)
  const form = Object.keys(root).find((k) => /^ITR[1-4]$/.test(k))
  if (!form) return null
  const r = obj(root[form])
  const formInfo = obj(r[`Form_${form}`])
  const ay = str(formInfo.AssessmentYear)
  if (!/^\d{4}$/.test(ay)) return null
  const created = obj(r.CreationInfo)
  const filing = obj(r.FilingStatus ?? obj(r.PartA_GEN1).FilingStatus)
  const ayNum = Number(ay)

  // ITR-1 / ITR-4 keep everything in a few flat blocks; ITR-2 / ITR-3 spread it over schedules and Part B.
  const inc = obj(r.ITR1_IncomeDeductions ?? r.IncomeDeductions)
  const comp = obj(r.ITR1_TaxComputation ?? r.TaxComputation)
  const ti = obj(r['PartB-TI'])
  const tti = obj(r.PartB_TTI)
  const compTax = obj(obj(tti.ComputationOfTaxLiability).TaxPayableOnTI)
  const interest = obj(obj(tti.ComputationOfTaxLiability).IntrstPay)
  const paidBlock = obj(obj(tti.TaxPaid).TaxesPaid ?? obj(r.TaxPaid).TaxesPaid)
  const flat = form === 'ITR1' || form === 'ITR4'

  const sched = obj(r.ScheduleS)
  const bp = obj(r.ITR3ScheduleBP)
  const cg = obj(ti.CapGain)
  const salaryRows = arr(sched.Salaries)

  const grossSalary = flat ? num(inc.GrossSalary) : num(sched.TotalGrossSalary) || num(ti.Salaries)
  const exempt = flat ? num(obj(inc.AllwncExemptUs10).TotalAllwncExemptUs10) : num(sched.AllwncExtentExemptUs10)
  const standard = flat ? num(inc.DeductionUs16) : num(sched.DeductionUS16)
  const salary = flat ? num(inc.IncomeFromSal) : num(first(sched.TotIncUnderHeadSalaries, ti.Salaries))
  const other = flat ? num(inc.IncomeOthSrc) : num(obj(obj(r.ScheduleOS).IncOthThanOwnRaceHorse).BalanceNoRaceHorse) || num(obj(ti.IncFromOS).TotIncFromOS)
  const hp = flat ? num(inc.TotalIncomeOfHP) : num(ti.IncomeFromHP)
  const business = flat ? 0 : num(bp.IncChrgUnHdProftGain)
  const stcg = num(obj(cg.ShortTerm).TotalShortTerm)
  const ltcg = num(obj(cg.LongTerm).TotalLongTerm)
  const grossTotal = flat ? num(inc.GrossTotIncome) : num(first(ti.GrossTotalIncome, ti.TotalTI))
  const taxable = flat ? num(inc.TotalIncome) : num(ti.TotalIncome)
  const via = obj(flat ? inc.DeductUndChapVIA : obj(r.ScheduleVIA).DeductUndChapVIA)
  const deductions = num(via.TotalChapVIADeductions)
  const exemptLines = flat
    ? arr(obj(inc.AllwncExemptUs10).AllwncExemptUs10Dtls).map((a) => ({ label: `Section ${str(a.SalNatureDesc)}`, amount: num(a.SalOthAmount) }))
    : []

  const t = flat ? comp : compTax
  const rebate = num(t.Rebate87A)
  const beforeRebate = num(t.TaxPayableOnRebate) + rebate
  const liability = num(first(t.GrossTaxLiability, comp.GrossTaxLiability))
  const netLiability = num(first(obj(tti.ComputationOfTaxLiability).NetTaxLiability, comp.NetTaxLiability, liability))
  const i = flat ? obj(comp.IntrstPay) : interest
  const interestTotal = num(i.IntrstPayUs234A) + num(i.IntrstPayUs234B) + num(i.IntrstPayUs234C) + num(i.LateFilingFee234F) + num(i.FeeFurnish234I)

  const taxPaid = flat ? obj(obj(r.TaxPaid).TaxesPaid) : paidBlock
  const refund = num(obj(flat ? r.Refund : tti.Refund).RefundDue)
  const payable = num(obj(flat ? r.TaxPaid : tti.TaxPaid).BalTaxPayable)

  const employers = flat
    ? tdsLines(obj(r.TDSonSalaries).TDSonSalary)
    : (() => {
        const tds = new Map(tdsLines(obj(r.ScheduleTDS1).TDSonSalary).map((l) => [l.tan, l.tds]))
        return salaryRows.map((s) => ({ name: str(s.NameOfEmployer), tan: str(s.TANofEmployer), income: num(obj(s.Salarys).GrossSalary), tds: tds.get(str(s.TANofEmployer)) ?? 0 }))
      })()
  const otherTds = tdsLines(obj(r.TDSonOthThanSals ?? r.ScheduleTDS2).TDSonOthThanSal)

  const account = obj(r.TradingAccount)
  const trading = num(account.TotRevenueFrmOperations) ? { turnover: num(account.TotRevenueFrmOperations), profitLoss: num(account.GrossProfitFrmBusProf) } : null
  const carried = num(obj(obj(obj(r.ScheduleCFL).TotalLossCFSummary).LossSummaryDetail).BusLossOthThanSpecLossCF)

  const paidTds = num(taxPaid.TDS)
  const paidTotal = num(taxPaid.TotalTaxesPaid)
  const challans = challansOf(obj(flat ? r.TaxPayments : obj(r.ScheduleIT)).TaxPayment)

  return {
    ay,
    form: str(formInfo.FormName) || form.replace('ITR', 'ITR-'),
    filedOn: str(created.JSONCreationDate),
    dueDate: str(filing.ItrFilingDueDate) || null,
    regime: regimeOf(filing, ayNum),
    source,
    income: { grossSalary, exemptAllowances: exempt, standardDeduction: standard, salary, houseProperty: hp, business, shortTermGains: stcg, longTermGains: ltcg, otherSources: other, grossTotal, deductions, taxable },
    allowances: exemptLines,
    deductions: deductionLines(via),
    tax: {
      beforeRebate,
      rebate87A: rebate,
      surcharge: num(t.TotalSurcharge),
      cess: num(t.EducationCess),
      relief: num(obj(obj(tti.ComputationOfTaxLiability).TaxRelief).TotTaxRelief) || num(comp.Section89),
      liability: netLiability,
      interest234A: num(i.IntrstPayUs234A),
      interest234B: num(i.IntrstPayUs234B),
      interest234C: num(i.IntrstPayUs234C),
      fee234F: num(i.LateFilingFee234F),
      total: netLiability + interestTotal,
    },
    paid: { tds: paidTds, tcs: num(taxPaid.TCS), advance: num(taxPaid.AdvanceTax), selfAssessment: num(taxPaid.SelfAssessmentTax), total: paidTotal },
    refund,
    payable,
    employers,
    otherTds,
    challans,
    trading,
    lossCarriedForward: carried,
    foreignAssets: str(obj(tti).AssetOutIndiaFlag).toUpperCase() === 'YES' || arr(obj(r.ScheduleFA).DtlsForeignEquityDebtInterest).length > 0,
  }
}

// ---------- Years ----------

export const fyOfAy = (ay: string) => `${Number(ay) - 1}-${String(Number(ay)).slice(2)}`
export const ayLabel = (ay: string) => `AY ${ay}-${String(Number(ay) + 1).slice(2)}`
export const fyLabel = (fy: string) => `FY ${fy}`

/** The financial year (April to March) a date falls in: '2025-26'. */
export function fyOf(date: string): string {
  const y = Number(date.slice(0, 4))
  const m = Number(date.slice(5, 7))
  const start = m >= 4 ? y : y - 1
  return `${start}-${String(start + 1).slice(2)}`
}

/** The AY that assesses a date's income (as filed on the portal: '2026'). */
export const ayOfDate = (date: string) => String(Number(fyOf(date).slice(0, 4)) + 1)

/** One return per year; if the same year was uploaded twice (a revised return) the later one wins. */
export function latestPerYear(list: TaxReturn[]): TaxReturn[] {
  const by = new Map<string, TaxReturn>()
  for (const r of list) {
    const old = by.get(r.ay)
    if (!old || r.filedOn >= old.filedOn) by.set(r.ay, r)
  }
  return [...by.values()].sort((a, b) => a.ay.localeCompare(b.ay))
}

export const effectiveRate = (r: TaxReturn) => (r.income.taxable > 0 ? (r.tax.liability / r.income.taxable) * 100 : 0)

export interface Totals {
  liability: number
  interest: number
  cost: number
  paid: number
  tds: number
  selfPaid: number
  refunds: number
  payable: number
  income: number
}

export function totals(list: TaxReturn[]): Totals {
  const t: Totals = { liability: 0, interest: 0, cost: 0, paid: 0, tds: 0, selfPaid: 0, refunds: 0, payable: 0, income: 0 }
  for (const r of list) {
    t.liability += r.tax.liability
    t.interest += r.tax.total - r.tax.liability
    t.cost += r.tax.total
    t.paid += r.paid.total
    t.tds += r.paid.tds
    t.selfPaid += r.paid.advance + r.paid.selfAssessment
    t.refunds += r.refund
    t.payable += r.payable
    t.income += r.income.grossSalary + r.income.otherSources + r.income.shortTermGains + r.income.longTermGains
  }
  return t
}

/** Assessment years between the first and last return that have no return uploaded. */
export function missingYears(list: TaxReturn[]): string[] {
  if (list.length < 2) return []
  const have = new Set(list.map((r) => r.ay))
  const out: string[] = []
  for (let y = Number(list[0].ay); y <= Number(list[list.length - 1].ay); y++) if (!have.has(String(y))) out.push(String(y))
  return out
}

// ---------- Transactions that matter for tax ----------

export type TaxKind = 'taxPaid' | 'refund' | 'otherTax' | 'salary' | 'interest' | 'dividend' | 'ded80C' | 'ded80D' | 'ded80E' | 'ded80G' | 'rent' | 'trading'
export type TaxRole = 'Tax paid' | 'Tax back' | 'Income' | 'Deduction' | 'Trading'

export interface KindDef {
  id: TaxKind
  label: string
  role: TaxRole
  /** Why the transaction counts, shown next to it and in the rules panel. */
  why: string
  color: string
}

export const KINDS: KindDef[] = [
  { id: 'taxPaid', label: 'Income tax paid', role: 'Tax paid', why: 'Advance tax, self-assessment tax or a challan paid to the Income Tax Department. Matched against the challans in your return.', color: 'var(--viz-2)' },
  { id: 'refund', label: 'Income tax refund', role: 'Tax back', why: 'Money credited by the Income Tax Department after a return was processed.', color: 'var(--viz-3)' },
  { id: 'otherTax', label: 'Other taxes', role: 'Tax paid', why: 'Professional tax, property tax, road tax or GST payments. Not part of the income-tax return.', color: 'var(--viz-4)' },
  { id: 'salary', label: 'Salary', role: 'Income', why: 'Salary credited to your bank. It is the take-home; the return shows the gross salary before TDS and PF.', color: 'var(--viz-1)' },
  { id: 'interest', label: 'Bank interest', role: 'Income', why: 'Interest credited on savings and deposits is taxable under Other Sources (80TTA allows up to ₹10,000 on savings interest in the old regime).', color: 'var(--viz-6)' },
  { id: 'dividend', label: 'Dividends', role: 'Income', why: 'Dividends are taxable at your slab rate under Other Sources.', color: 'var(--viz-7)' },
  { id: 'ded80C', label: '80C investments & premiums', role: 'Deduction', why: 'Life insurance, PPF, ELSS, NPS, tax-saver FDs and tuition can be claimed under 80C (up to ₹1.5 lakh, old regime only). A candidate, not proof.', color: 'var(--viz-5)' },
  { id: 'ded80D', label: '80D health insurance', role: 'Deduction', why: 'Health insurance premiums are deductible under 80D (old regime only). A candidate, not proof.', color: 'var(--viz-8)' },
  { id: 'ded80E', label: '80E education loan', role: 'Deduction', why: 'Education-loan payments; only the interest part is deductible under 80E.', color: 'var(--viz-4)' },
  { id: 'ded80G', label: '80G donations', role: 'Deduction', why: 'Donations to approved funds and trusts can be deducted under 80G, with a receipt.', color: 'var(--viz-5)' },
  { id: 'rent', label: 'Rent paid (HRA)', role: 'Deduction', why: 'Rent paid supports the HRA exemption under 10(13A). Taken from the Household module.', color: 'var(--viz-1)' },
  { id: 'trading', label: 'Broker transfers', role: 'Trading', why: 'Money moved to and from a broker. Trading profit and loss is taxed from the contract notes and the broker’s tax report, not from these transfers.', color: 'var(--viz-other)' },
]
export const KIND: Record<TaxKind, KindDef> = Object.fromEntries(KINDS.map((k) => [k.id, k])) as Record<TaxKind, KindDef>

export interface TaxTxn {
  id: string
  date: string
  kind: TaxKind
  description: string
  merchant: string
  /** Always positive; `credit` says which way the money went. */
  amount: number
  credit: boolean
  source: 'bank' | 'card'
  fy: string
}

const INCOME_TAX = /income ?tax|incometax|cbdt|\bitd\b|\bcpc\b.*refund|advance tax|self ?assess|traces|oltas|tin[- ]?nsdl|e-?tax|taxes? ?pay/
const OTHER_TAX = /professional tax|prof\.? ?tax|property tax|road tax|municipal tax|gst (payment|pay)|\bgstn?\b.*pay|\bptax\b/
const D80D = /star health|care health|niva bupa|max bupa|hdfc ergo|health insur|medical insur|mediclaim|manipal ?cigna|aditya birla health/
const D80C = /\blic\b|life insur|hdfc life|sbi life|max life|icici pru|bajaj allianz life|tata aia|\bppf\b|\belss\b|\bnps\b|tax saver|sukanya|\bnsc\b|\bepf\b|\bvpf\b|tuition|term plan/
const D80E = /education loan|edu(cation)? ?loan|vidya ?lakshmi/
const D80G = /donation|donat|pm ?cares|relief fund|charit|foundation|ngo/
const BROKER = /zerodha|\bkite\b|dhan|icici ?direct|groww|upstox|angel ?(one|broking)|5paisa|fyers|\bnse clearing|\bnsccl\b/
const DIVIDEND = /dividend|\bdiv\b|\bidcw\b/
// Card bill payments and transfers between own accounts are not tax events.
const IGNORE = /credit card|card payment|cc payment|autopay/

export function classifyTax(t: Pick<Txn, 'description' | 'merchant' | 'category' | 'debit' | 'credit'>, source: 'bank' | 'card'): TaxKind | null {
  const text = `${t.merchant} ${t.description}`.toLowerCase()
  const debit = (t.debit || 0) > 0
  const credit = (t.credit || 0) > 0
  if (t.category === 'Card Payment') return null

  if (source === 'bank') {
    if (credit && INCOME_TAX.test(text) && /refund|reversal/.test(text)) return 'refund'
    if (debit && (INCOME_TAX.test(text) || (t.category === 'Taxes' && !OTHER_TAX.test(text)))) return 'taxPaid'
    if (debit && (OTHER_TAX.test(text) || t.category === 'Taxes')) return 'otherTax'
    if (credit && t.category === 'Salary') return 'salary'
    if (credit && (t.category === 'Interest' || /\bint\.?\s?pd|interest (paid|credit)|int\.pd|sb int|fd int/.test(text))) return 'interest'
    if (credit && DIVIDEND.test(text)) return 'dividend'
    if ((debit || credit) && BROKER.test(text) && !IGNORE.test(text)) return 'trading'
  }
  if (debit) {
    if (D80E.test(text)) return 'ded80E'
    if (D80D.test(text)) return 'ded80D'
    if (D80G.test(text) && t.category !== 'Shopping') return 'ded80G'
    if (D80C.test(text) || (source === 'bank' && (t.category === 'Insurance' || (t.category === 'Investments' && /pru|life|ppf|elss|nps|tax|pension/.test(text))))) return 'ded80C'
  }
  return null
}

const RENT_GROUPS: HouseGroup[] = ['rentSalem', 'rentBengaluru', 'rentOther']

export function taxTxns(bank: Txn[], card: Txn[]): TaxTxn[] {
  const out: TaxTxn[] = []
  const add = (list: Txn[], source: 'bank' | 'card') => {
    for (const t of list) {
      const kind = classifyTax(t, source)
      if (!kind) continue
      const credit = (t.credit || 0) > 0 && !(t.debit > 0)
      out.push({ id: t.id, date: t.date, kind, description: t.description, merchant: t.merchant, amount: credit ? t.credit : t.debit, credit, source, fy: fyOf(t.date) })
    }
  }
  add(bank, 'bank')
  add(card, 'card')
  for (const h of householdTxns(bank, card)) {
    if (!RENT_GROUPS.includes(h.group) || h.amount <= 0) continue
    out.push({ id: `rent-${h.id}`, date: h.date, kind: 'rent', description: h.description, merchant: `${GROUP[h.group].label} · ${h.brand}`, amount: h.amount, credit: false, source: h.source, fy: fyOf(h.date) })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export interface YearTxns {
  fy: string
  byKind: Record<TaxKind, number>
  count: number
}

export function byYear(txns: TaxTxn[]): YearTxns[] {
  const map = new Map<string, YearTxns>()
  for (const t of txns) {
    const y = map.get(t.fy) ?? { fy: t.fy, byKind: Object.fromEntries(KINDS.map((k) => [k.id, 0])) as Record<TaxKind, number>, count: 0 }
    y.byKind[t.kind] += t.amount
    y.count += 1
    map.set(t.fy, y)
  }
  return [...map.values()].sort((a, b) => a.fy.localeCompare(b.fy))
}

/** Which return challans can be found in the bank statements: same amount, within five days. */
export function verifyChallans(r: TaxReturn, txns: TaxTxn[]): { challan: Challan; match: TaxTxn | null }[] {
  const pool = txns.filter((t) => t.kind === 'taxPaid' && !t.credit)
  const used = new Set<string>()
  return r.challans.map((challan) => {
    const day = Date.parse(`${challan.date}T00:00:00Z`)
    const match = pool.find((t) => !used.has(t.id) && Math.round(t.amount) === Math.round(challan.amount) && Math.abs(Date.parse(`${t.date}T00:00:00Z`) - day) <= 5 * 86_400_000) ?? null
    if (match) used.add(match.id)
    return { challan, match }
  })
}

/** How many months of a financial year the bank statements cover (0 to 12). */
export function monthsCovered(bank: Txn[], fy: string): number {
  return new Set(bank.filter((t) => fyOf(t.date) === fy).map((t) => t.date.slice(0, 7))).size
}

/** The advance-tax instalments due in a financial year, as cumulative shares of the year's tax. */
export const ADVANCE_TAX_DUE = [
  { by: '15 Jun', share: 15 },
  { by: '15 Sep', share: 45 },
  { by: '15 Dec', share: 75 },
  { by: '15 Mar', share: 100 },
] as const
