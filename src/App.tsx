import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { LuxuryBackground } from '@/components/layout/LuxuryBackground'
import { CustomCursor } from '@/components/common/CustomCursor'
import { ScrollProgressBar } from '@/components/common/ScrollProgressBar'
import { BackToTop } from '@/components/common/BackToTop'
import { ConnectFab } from '@/components/common/ConnectFab'
import { MyvaChat } from '@/components/common/MyvaChat'
import { LoadingScreen } from '@/components/common/LoadingScreen'
import { CommandPalette } from '@/components/common/CommandPalette'
import { useLenis } from '@/hooks/useLenis'
import { useDisableContextMenu } from '@/hooks/useDisableContextMenu'
import { useDisableCopy } from '@/hooks/useDisableCopy'
import { useVisitNotify } from '@/hooks/useVisitNotify'
import { ThemeProvider } from '@/hooks/useTheme'
import { Home } from '@/pages/Home'

const AtAGlance = lazy(() => import('@/pages/AtAGlance').then((m) => ({ default: m.AtAGlance })))
const Blog = lazy(() => import('@/pages/Blog').then((m) => ({ default: m.Blog })))
const Pricing = lazy(() => import('@/pages/Pricing').then((m) => ({ default: m.Pricing })))
const Tools = lazy(() => import('@/pages/Tools').then((m) => ({ default: m.Tools })))
const NotFound = lazy(() => import('@/pages/NotFound').then((m) => ({ default: m.NotFound })))

function AppShell() {
  useLenis()
  useDisableContextMenu()
  useDisableCopy()
  useVisitNotify()

  return (
    <div className="relative min-h-screen">
      <LoadingScreen />
      <LuxuryBackground />
      <ScrollProgressBar />
      <CustomCursor />
      <CommandPalette />
      <Header />
      <main className="relative z-10">
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/at-a-glance" element={<AtAGlance />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/tools" element={<Tools />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
      <BackToTop />
      <ConnectFab />
      <MyvaChat />
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
      <HelmetProvider>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </HelmetProvider>
    </ThemeProvider>
  )
}

export default App
