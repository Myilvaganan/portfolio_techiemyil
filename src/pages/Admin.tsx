import { Suspense, lazy, useState, type ComponentType } from 'react'
import { Helmet } from 'react-helmet-async'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { getStoredToken } from '@/lib/adminAuth'
import { retryImport } from '@/lib/lazyRetry'
import { AdminLogin } from '@/components/admin/AdminLogin'
import { AdminShell } from '@/components/admin/AdminShell'
import { DashboardHome } from '@/pages/admin/DashboardHome'

// Each page is its own chunk, so opening the admin only downloads the page you're on.
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) => lazy(async () => ({ default: (await retryImport(load))[name] }))

const DocumentManager = page(() => import('@/components/admin/DocumentManager'), 'DocumentManager')
const MarginCalculator = page(() => import('@/pages/admin/MarginCalculator'), 'MarginCalculator')
const PortfolioRebalance = page(() => import('@/pages/admin/PortfolioRebalance'), 'PortfolioRebalance')
const ZerodhaDashboard = page(() => import('@/pages/admin/ZerodhaDashboard'), 'ZerodhaDashboard')
const OptionsAnalytics = page(() => import('@/pages/admin/OptionsAnalytics'), 'OptionsAnalytics')
const TradingJournal = page(() => import('@/pages/admin/TradingJournal'), 'TradingJournal')
const BankStatements = page(() => import('@/pages/admin/BankStatements'), 'BankStatements')
const CreditCards = page(() => import('@/pages/admin/CreditCards'), 'CreditCards')
const Loans = page(() => import('@/pages/admin/Loans'), 'Loans')
const HealthReport = page(() => import('@/pages/admin/HealthReport'), 'HealthReport')
const Household = page(() => import('@/pages/admin/Household'), 'Household')
const TaxInformation = page(() => import('@/pages/admin/TaxInformation'), 'TaxInformation')
const NetWorth = page(() => import('@/pages/admin/NetWorth'), 'NetWorth')
const Budgets = page(() => import('@/pages/admin/Budgets'), 'Budgets')
const CashFlow = page(() => import('@/pages/admin/CashFlow'), 'CashFlow')
const Goals = page(() => import('@/pages/admin/Goals'), 'Goals')
const Investments = page(() => import('@/pages/admin/Investments'), 'Investments')
const Lending = page(() => import('@/pages/admin/Lending'), 'Lending')
const Chat = page(() => import('@/pages/admin/Chat'), 'Chat')
const Security = page(() => import('@/pages/admin/Security'), 'Security')
const SiteInsights = page(() => import('@/pages/admin/SiteInsights'), 'SiteInsights')

function PageLoading() {
  return (
    <div role="status" aria-busy="true" className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-text-secondary">
      <Loader2 className="h-5 w-5 animate-spin text-accent" /> Loading…
    </div>
  )
}

export function Admin() {
  const [authed, setAuthed] = useState(() => Boolean(getStoredToken()))

  return (
    <>
      <Helmet>
        <title>Admin — Techie Myil Studio</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="min-h-screen bg-bg text-text">
        {authed ? (
          <AdminShell onLogout={() => setAuthed(false)}>
            <Suspense fallback={<PageLoading />}>
              <Routes>
                <Route index element={<DashboardHome />} />
                <Route path="documents" element={<DocumentManager />} />
                <Route path="margin-calculator" element={<MarginCalculator />} />
                <Route path="portfolio-rebalance" element={<PortfolioRebalance />} />
                <Route path="zerodha" element={<ZerodhaDashboard />} />
                <Route path="options-analytics" element={<OptionsAnalytics />} />
                <Route path="trading-journal" element={<TradingJournal />} />
                <Route path="bank-statements" element={<BankStatements />} />
                <Route path="credit-cards" element={<CreditCards />} />
                <Route path="loans" element={<Loans />} />
                <Route path="health-report" element={<HealthReport />} />
                <Route path="household" element={<Household />} />
                <Route path="tax" element={<TaxInformation />} />
                <Route path="net-worth" element={<NetWorth />} />
                <Route path="budgets" element={<Budgets />} />
                <Route path="cash-flow" element={<CashFlow />} />
                <Route path="goals" element={<Goals />} />
                <Route path="investments" element={<Investments />} />
                <Route path="lending" element={<Lending />} />
                <Route path="chat" element={<Chat />} />
                <Route path="security" element={<Security />} />
                <Route path="site" element={<SiteInsights />} />
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </Routes>
            </Suspense>
          </AdminShell>
        ) : (
          <AdminLogin onSuccess={() => setAuthed(true)} />
        )}
      </div>
    </>
  )
}
