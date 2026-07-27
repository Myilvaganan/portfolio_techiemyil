import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { Button } from '@/components/ui/Button'

export function NotFound() {
  return (
    <section className="relative flex min-h-screen items-center py-32">
      <Container className="flex flex-col items-center text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
          <Compass className="h-7 w-7" />
        </span>
        <h1 className="mt-8 font-display text-6xl font-semibold text-text">404</h1>
        <p className="mt-4 max-w-sm text-body-lg text-text-secondary">
          This page took a wrong turn. Let's get you back on track.
        </p>
        <Link to="/" className="mt-9">
          <Button>Back to Home</Button>
        </Link>
      </Container>
    </section>
  )
}
