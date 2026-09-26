import { Component, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'

/** The last line of defence: a visible message and a Reload button instead of a black screen. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('The app hit an error', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-6 text-center text-text">
        <h1 className="font-display text-xl font-semibold">Something went wrong</h1>
        <p className="max-w-sm text-sm text-text-secondary">The app may have just been updated. Reloading usually fixes it.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-[#05130a]"
        >
          <RefreshCw className="h-4 w-4" /> Reload
        </button>
      </div>
    )
  }
}
