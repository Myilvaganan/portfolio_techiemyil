import { motion } from 'framer-motion'
import { CalendarClock, FolderGit2, Star, Users } from 'lucide-react'
import { FaGithub } from 'react-icons/fa'
import { Container } from '@/components/ui/Container'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'
import { useGithubStats } from '@/hooks/useGithubStats'
import { personal } from '@/data/personal'

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
}

export function GithubStats() {
  const { data, status } = useGithubStats()

  const tiles = data
    ? [
        { label: 'Public Repositories', value: data.publicRepos, suffix: '+', icon: FolderGit2 },
        { label: 'Stars Earned', value: data.totalStars, suffix: '', icon: Star },
        { label: 'Followers', value: data.followers, suffix: '+', icon: Users },
        { label: 'Years on GitHub', value: data.yearsActive, suffix: '+', icon: CalendarClock },
      ]
    : []

  return (
    <section id="github" className="relative py-section">
      <Container>
        <SectionHeading
          eyebrow="Open Source"
          title="Building in Public"
          accentWord="Public"
          description="A live snapshot of my GitHub activity, pulled straight from the API."
          align="center"
          className="mx-auto mb-14"
        />

        {status === 'loading' && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-[24px] border border-border bg-card/40" />
            ))}
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-4 rounded-[24px] border border-border bg-card/40 py-14 text-center">
            <FaGithub className="h-8 w-8 text-text-secondary" />
            <p className="max-w-sm text-sm text-text-secondary">
              Couldn't load live GitHub stats right now — you can still check out the profile directly.
            </p>
            <a href={personal.links.github} target="_blank" rel="noreferrer" data-cursor="hover">
              <Button size="sm" variant="secondary">
                <FaGithub className="h-4 w-4" />
                View GitHub Profile
              </Button>
            </a>
          </div>
        )}

        {status === 'success' && data && (
          <>
            <motion.div
              variants={container}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-80px' }}
              className="grid grid-cols-2 gap-4 sm:grid-cols-4"
            >
              {tiles.map((tile) => (
                <motion.div key={tile.label} variants={item}>
                  <GlassCard className="p-5 text-center">
                    <tile.icon className="mx-auto mb-3 h-5 w-5 text-accent" />
                    <div className="font-display text-3xl font-semibold text-text">
                      <AnimatedCounter value={tile.value} suffix={tile.suffix} />
                    </div>
                    <div className="mt-1 text-xs text-text-secondary">{tile.label}</div>
                  </GlassCard>
                </motion.div>
              ))}
            </motion.div>

            {data.topLanguages.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="mt-6 grid gap-6 rounded-[24px] border border-border bg-card/40 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center"
              >
                <div>
                  <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Top Languages
                  </p>
                  <div className="space-y-3">
                    {data.topLanguages.map((lang, i) => (
                      <div key={lang.name}>
                        <div className="mb-1.5 flex items-center justify-between text-xs">
                          <span className="font-medium text-text">{lang.name}</span>
                          <span className="text-text-secondary">{lang.percent}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-5">
                          <motion.div
                            initial={{ width: 0 }}
                            whileInView={{ width: `${lang.percent}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.8, delay: 0.1 + i * 0.08, ease: 'easeOut' }}
                            className="h-full rounded-full bg-accent"
                            style={{ opacity: 1 - i * 0.18 }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <a href={personal.links.github} target="_blank" rel="noreferrer" data-cursor="hover">
                  <Button size="sm">
                    <FaGithub className="h-4 w-4" />
                    View GitHub Profile
                  </Button>
                </a>
              </motion.div>
            )}
          </>
        )}
      </Container>
    </section>
  )
}
