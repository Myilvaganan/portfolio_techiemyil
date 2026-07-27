import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Chip } from '@/components/ui/Chip'
import { Watermark } from '@/components/ui/Watermark'
import { projects } from '@/data/projects'

export function ProjectsPanel() {
  return (
    <GlassCard hover={false} className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-text">
          Featured <span className="text-accent">Projects</span>
        </h2>
        <Link
          to="/#projects"
          className="flex items-center gap-1 text-xs font-medium text-text-secondary transition-colors hover:text-accent"
        >
          View All Projects
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {projects.map((project) => (
          <a
            key={project.id}
            href={project.demo || project.github}
            target="_blank"
            rel="noreferrer"
            data-cursor="hover"
            className="group block overflow-hidden rounded-xl border border-surface-5"
          >
            <div className="relative aspect-video overflow-hidden">
              <img
                src={project.image}
                alt={`${project.title} preview`}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <Watermark />
            </div>
            <div className="p-2.5">
              <p className="truncate text-xs font-semibold text-text">{project.title}</p>
              <p className="mt-0.5 truncate text-[11px] text-text-secondary">{project.tagline}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {project.stack.slice(0, 2).map((tech) => (
                  <Chip key={tech} className="px-1.5 py-0.5 text-[10px]">
                    {tech}
                  </Chip>
                ))}
              </div>
            </div>
          </a>
        ))}
      </div>
    </GlassCard>
  )
}
