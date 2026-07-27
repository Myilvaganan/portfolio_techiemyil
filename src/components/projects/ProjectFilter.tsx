import { cn } from '@/lib/utils'

interface ProjectFilterProps {
  categories: string[]
  active: string
  onChange: (category: string) => void
}

export function ProjectFilter({ categories, active, onChange }: ProjectFilterProps) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {categories.map((category) => (
        <button
          key={category}
          onClick={() => onChange(category)}
          data-cursor="hover"
          className={cn(
            'rounded-full border px-5 py-2 text-sm font-medium transition-all duration-300',
            active === category
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border text-text-secondary hover:border-accent/30 hover:text-text',
          )}
        >
          {category}
        </button>
      ))}
    </div>
  )
}
