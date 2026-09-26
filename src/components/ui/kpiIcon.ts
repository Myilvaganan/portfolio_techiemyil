import { ArrowDownLeft, ArrowUpRight, BadgePercent, CalendarClock, CreditCard, HandCoins, HeartPulse, Landmark, LineChart, PiggyBank, ReceiptText, Scale, Sparkles, Target, Wallet, type LucideIcon } from 'lucide-react'

// First match wins. Lets every stat card get a fitting icon from its label without touching each page.
const RULES: [RegExp, LucideIcon][] = [
  [/tax|tds|itr|refund/i, ReceiptText],
  [/emi|loan|owe|lend|borrow|overdue/i, HandCoins],
  [/card|utili[sz]ation|limit/i, CreditCard],
  [/income|salary|credit|deposit|receiv|inflow|\bin\b/i, ArrowDownLeft],
  [/spend|expense|debit|outflow|paid|bills?|\bout\b/i, ArrowUpRight],
  [/save|saving|surplus|runway|emergency/i, PiggyBank],
  [/goal|target/i, Target],
  [/net worth|assets?|liabilit|balance/i, Scale],
  [/bank|account/i, Landmark],
  [/return|p&l|pnl|profit|gain|holding|portfolio|invest|value|xirr|cagr/i, LineChart],
  [/rate|interest|percent|%/i, BadgePercent],
  [/due|date|next|month|days?/i, CalendarClock],
  [/weight|fat|bmi|health|muscle|score/i, HeartPulse],
]

export function kpiIcon(label: string): LucideIcon {
  return RULES.find(([re]) => re.test(label))?.[1] ?? (/total|amount|cash/i.test(label) ? Wallet : Sparkles)
}
