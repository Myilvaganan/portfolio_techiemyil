import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Navigate, Route, Routes } from 'react-router-dom'
import { getStoredToken } from '@/lib/adminAuth'
import { AdminLogin } from '@/components/admin/AdminLogin'
import { AdminShell } from '@/components/admin/AdminShell'
import { DocumentManager } from '@/components/admin/DocumentManager'
import { DashboardHome } from '@/pages/admin/DashboardHome'
import { MarginCalculator } from '@/pages/admin/MarginCalculator'
import { PortfolioRebalance } from '@/pages/admin/PortfolioRebalance'
import { ZerodhaDashboard } from '@/pages/admin/ZerodhaDashboard'
import { OptionsAnalytics } from '@/pages/admin/OptionsAnalytics'
import { BankStatements } from '@/pages/admin/BankStatements'
import { CreditCards } from '@/pages/admin/CreditCards'
import { Loans } from '@/pages/admin/Loans'

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
            <Routes>
              <Route index element={<DashboardHome />} />
              <Route path="documents" element={<DocumentManager />} />
              <Route path="margin-calculator" element={<MarginCalculator />} />
              <Route path="portfolio-rebalance" element={<PortfolioRebalance />} />
              <Route path="zerodha" element={<ZerodhaDashboard />} />
              <Route path="options-analytics" element={<OptionsAnalytics />} />
              <Route path="bank-statements" element={<BankStatements />} />
              <Route path="credit-cards" element={<CreditCards />} />
              <Route path="loans" element={<Loans />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </AdminShell>
        ) : (
          <AdminLogin onSuccess={() => setAuthed(true)} />
        )}
      </div>
    </>
  )
}
