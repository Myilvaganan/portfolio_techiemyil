import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, type LucideIcon } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'

interface ComingSoonPageProps {
  icon: LucideIcon
  title: string
  description: string
}

export function ComingSoonPage({ icon: Icon, title, description }: ComingSoonPageProps) {
  return (
    <section className="relative flex min-h-screen items-center py-32">
      <Container className="flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent"
        >
          <Icon className="h-7 w-7" />
        </motion.div>
        <div className="mt-6">
          <Badge>Coming Soon</Badge>
        </div>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-6 font-display text-4xl font-semibold text-text sm:text-section"
        >
          {title}
        </motion.h1>
        <p className="mt-4 max-w-md text-body-lg text-text-secondary">{description}</p>
        <Link to="/" className="mt-9">
          <Button variant="secondary">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>
        </Link>
      </Container>
    </section>
  )
}
