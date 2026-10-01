import { Suspense, lazy, useState, type ComponentType } from 'react'
import { Helmet } from 'react-helmet-async'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { PageSkeleton } from '@/components/ui/Skeleton'
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
const Guardrails = page(() => import('@/pages/admin/Guardrails'), 'Guardrails')
const TradingLedger = page(() => import('@/pages/admin/TradingLedger'), 'TradingLedger')
const MindMoney = page(() => import('@/pages/admin/MindMoney'), 'MindMoney')
const Subscriptions = page(() => import('@/pages/admin/Subscriptions'), 'Subscriptions')
const MonthlyReview = page(() => import('@/pages/admin/MonthlyReview'), 'MonthlyReview')
const DebtFree = page(() => import('@/pages/admin/DebtFree'), 'DebtFree')
const Runway = page(() => import('@/pages/admin/Runway'), 'Runway')
const LifeAdmin = page(() => import('@/pages/admin/LifeAdmin'), 'LifeAdmin')
const Habits = page(() => import('@/pages/admin/Habits'), 'Habits')
const Water = page(() => import('@/pages/admin/Water'), 'Water')
const Calories = page(() => import('@/pages/admin/Calories'), 'Calories')
const Reminders = page(() => import('@/pages/admin/Reminders'), 'Reminders')
const GoalTimeline = page(() => import('@/pages/admin/GoalTimeline'), 'GoalTimeline')
const Receipts = page(() => import('@/pages/admin/Receipts'), 'Receipts')
const Family = page(() => import('@/pages/admin/Family'), 'Family')
const Medicines = page(() => import('@/pages/admin/Medicines'), 'Medicines')
const SleepMood = page(() => import('@/pages/admin/SleepMood'), 'SleepMood')
const Focus = page(() => import('@/pages/admin/Focus'), 'Focus')
const Today = page(() => import('@/pages/admin/Today'), 'Today')
const Diary = page(() => import('@/pages/admin/Diary'), 'Diary')
const TamilCalendar = page(() => import('@/pages/admin/TamilCalendar'), 'TamilCalendar')
const Profile = page(() => import('@/pages/admin/Profile'), 'Profile')
const Chat = page(() => import('@/pages/admin/Chat'), 'Chat')
const Security = page(() => import('@/pages/admin/Security'), 'Security')
const SiteInsights = page(() => import('@/pages/admin/SiteInsights'), 'SiteInsights')

function PageLoading() {
  return <PageSkeleton />
}

export function Admin() {
  const [authed, setAuthed] = useState(() => Boolean(getStoredToken()))
  const navigate = useNavigate()

  return (
    <>
      <Helmet>
        <title>techiemyil.com</title>
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
                <Route path="guardrails" element={<Guardrails />} />
                <Route path="trading-vs-life" element={<TradingLedger />} />
                <Route path="mind-money" element={<MindMoney />} />
                <Route path="subscriptions" element={<Subscriptions />} />
                <Route path="monthly-review" element={<MonthlyReview />} />
                <Route path="debt-free" element={<DebtFree />} />
                <Route path="runway" element={<Runway />} />
                <Route path="life-admin" element={<LifeAdmin />} />
                <Route path="habits" element={<Habits />} />
                <Route path="water" element={<Water />} />
                <Route path="calories" element={<Calories />} />
                <Route path="reminders" element={<Reminders />} />
                <Route path="goal-timeline" element={<GoalTimeline />} />
                <Route path="receipts" element={<Receipts />} />
                <Route path="family" element={<Family />} />
                <Route path="medicines" element={<Medicines />} />
                <Route path="sleep-mood" element={<SleepMood />} />
                <Route path="focus" element={<Focus />} />
                <Route path="today" element={<Today />} />
                <Route path="diary" element={<Diary />} />
                <Route path="tamil-calendar" element={<TamilCalendar />} />
                <Route path="profile" element={<Profile />} />
                <Route path="security" element={<Security />} />
                <Route path="site" element={<SiteInsights />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </AdminShell>
        ) : (
          <AdminLogin
            onSuccess={() => {
              setAuthed(true)
              navigate('', { replace: true })
            }}
          />
        )}
      </div>
    </>
  )
}
