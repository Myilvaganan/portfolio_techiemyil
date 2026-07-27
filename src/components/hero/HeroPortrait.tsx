import { Suspense, lazy } from 'react'
import { motion } from 'framer-motion'
import profileImgDark from '@/assets/images/profile.jpg'
import profileImgLight from '@/assets/images/profile_light.png'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { useTheme } from '@/hooks/useTheme'
import { FloatingIcons } from './FloatingIcons'

const HeroCanvas = lazy(() => import('./HeroCanvas').then((m) => ({ default: m.HeroCanvas })))

export function HeroPortrait() {
  const { theme } = useTheme()
  const profileImg = theme === 'light' ? profileImgLight : profileImgDark

  return (
    <div className="relative mx-auto flex h-[380px] w-[300px] items-center justify-center sm:h-[440px] sm:w-[340px]">
      <ErrorBoundary>
        <Suspense fallback={null}>
          <HeroCanvas />
        </Suspense>
      </ErrorBoundary>

      <motion.div
        className="absolute inset-0 rounded-full border border-accent/20"
        animate={{ rotate: 360 }}
        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
        style={{ scale: 1.15 }}
      />
      <motion.div
        className="absolute inset-0 rounded-full border border-dashed border-accent/15"
        animate={{ rotate: -360 }}
        transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
        style={{ scale: 1.3 }}
      />

      <div
        className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(34,197,94,0.25),transparent_70%)] blur-2xl"
        style={{ transform: 'scale(1.05)' }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
        className="relative h-full w-full overflow-hidden rounded-[32px] border border-surface-10 bg-card/60 p-2 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] backdrop-blur-sm"
      >
        <div className="h-full w-full overflow-hidden rounded-[24px]">
          <img
            src={profileImg}
            alt="Portrait of Myilvaganan Sakthivel"
            className="h-full w-full object-cover"
            loading="eager"
            width={340}
            height={440}
          />
        </div>
        <div className="pointer-events-none absolute inset-0 rounded-[32px] ring-1 ring-inset ring-surface-5" />
      </motion.div>

      <FloatingIcons />
    </div>
  )
}
