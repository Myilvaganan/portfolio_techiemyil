import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'

// "App 1.148 · Web 3f2a9c1 · 2 Oct, 4:10 PM" — the installed Android app's version (from Android) and the web build
// that's loaded (commit and build time). The two update separately: the app from App Tester, the web on every push.
export function VersionLine({ className }: { className?: string }) {
  const [app, setApp] = useState<string | null>(null)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    import('@capacitor/app')
      .then(({ App }) => App.getInfo())
      .then((i) => setApp(`${i.version} (${i.build})`))
      .catch(() => setApp('installed'))
  }, [])
  const built = new Date(__BUILD_TIME__).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  return (
    <p className={className}>
      {app && <>App {app} · </>}Web {__BUILD_ID__} · {built}
    </p>
  )
}
