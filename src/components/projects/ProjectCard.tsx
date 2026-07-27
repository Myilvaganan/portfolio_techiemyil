import { motion } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
import { FaGithub } from 'react-icons/fa'
import type { Project } from '@/types'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

export function ProjectCard({ project, index }: { project: Project; index: number }) {
  const reversed = index % 2 === 1

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'grid items-center gap-8 rounded-[24px] border border-border bg-card/40 p-4 sm:p-6 md:grid-cols-2 md:gap-10 md:p-8',
        reversed && 'md:[&>*:first-child]:order-2',
      )}
    >
      <div className="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-surface-5">
        <img
          src={project.image}
          alt={`${project.title} preview`}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        />
        <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/80 via-black/10 to-transparent p-6 opacity-0 transition-opacity duration-400 group-hover:opacity-100">
          <div className="flex gap-3">
            {project.github && (
              <a
                href={project.github}
                target="_blank"
                rel="noreferrer"
                data-cursor="hover"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-accent hover:text-[#05130a]"
                aria-label={`${project.title} GitHub repository`}
              >
                <FaGithub className="h-4 w-4" />
              </a>
            )}
            {project.demo && (
              <a
                href={project.demo}
                target="_blank"
                rel="noreferrer"
                data-cursor="hover"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-[#05130a] transition-colors hover:bg-accent-hover"
                aria-label={`${project.title} live demo`}
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{project.tagline}</p>
        <h3 className="mt-2 font-display text-card-title font-semibold text-text">{project.title}</h3>
        <p className="mt-4 text-sm leading-relaxed text-text-secondary">{project.description}</p>

        <div className="mt-5 flex flex-wrap gap-2">
          {project.stack.map((tech) => (
            <Chip key={tech}>{tech}</Chip>
          ))}
        </div>

        <div className="mt-7 flex flex-wrap gap-3">
          {project.github && (
            <Button variant="secondary" size="sm" onClick={() => window.open(project.github, '_blank')}>
              <FaGithub className="h-4 w-4" />
              GitHub
            </Button>
          )}
          {project.demo && (
            <Button size="sm" onClick={() => window.open(project.demo, '_blank')}>
              Live Demo
              <ExternalLink className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
