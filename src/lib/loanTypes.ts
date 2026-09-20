export interface ScheduleRow {
  no: number
  date: string
  opening: number
  principal: number
  installment: number
  ratePct: number
  interest: number
  charges: number
  closing: number
}

export type LoanEventType =
  | 'processing_fee'
  | 'disbursement'
  | 'payout'
  | 'emi_due'
  | 'receipt'
  | 'bounce'
  | 'bounce_charge'
  | 'overdue_interest'
  | 'penal'
  | 'other_charge'

export interface LoanEvent {
  date: string
  type: LoanEventType
  amount: number
  instNo?: number
  note?: string
}

export interface StatementDetails {
  asOf: string | null
  sanctionDate: string
  amount: number
  advEmi: number
  ratePct: number
  penalPct: number
  paidCount: number
  paidAmount: number
  pendingCount: number
  pendingAmount: number
  futureCount: number
  futureAmount: number
  tenure: number | null
  emi: number | null
  product: string | null
  rateType: string | null
  status: string | null
  repayment: string | null
}

export interface LoanSummary {
  debitPrincipal: number
  debitInterest: number
  debitOverdueInterest: number
  debitBounce: number
  debitOther: number
  debitTotal: number
  currentOs: number
  accruedInterest: number
  accruedOverdue: number
  accruedPenal: number
  futurePrincipal: number
  totalReceivable: number
}

export interface ParsedSchedule {
  docType: 'schedule'
  accountNo: string
  rows: ScheduleRow[]
}

export interface ParsedStatement {
  docType: 'statement'
  accountNo: string
  details: StatementDetails
  summary: LoanSummary | null
  events: LoanEvent[]
}

export type ParsedLoanDoc = ParsedSchedule | ParsedStatement
