import s1 from '@/lib/fixtures/loans/schedule1.txt?raw'
import s2 from '@/lib/fixtures/loans/schedule2.txt?raw'
import st1 from '@/lib/fixtures/loans/statement1.txt?raw'
import st2 from '@/lib/fixtures/loans/statement2.txt?raw'
import { parseLoanDocument } from '@/lib/loanParser'
import type { LoanDoc } from '@/lib/loans'

let n = 0
export function loanDoc(text: string, filename: string): LoanDoc {
  const r = parseLoanDocument(text.split('\n'))
  if (!r.ok) throw new Error(r.error)
  n++
  return { id: `doc${n}abcdef`, kind: 'loan', docType: r.doc.docType, accountNo: r.doc.accountNo, filename, uploadedAt: `2026-09-20T10:0${n}:00Z`, pages: 2, fileKey: 'k', parsed: r.doc }
}

export const allLoanDocs = () => [loanDoc(s1, 'LnAmortSchedule1.pdf'), loanDoc(st1, 'LoanStatement.pdf'), loanDoc(s2, 'LnAmortSchedule2.pdf'), loanDoc(st2, 'LoanStatement2.pdf')]
