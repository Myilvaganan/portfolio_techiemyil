import { Briefcase, Code2, FileCode, Building2 } from 'lucide-react'
import type { Stat } from '@/types'
import { getExperienceDuration } from '@/lib/experience'

const experience = getExperienceDuration()

export const stats: Stat[] = [
  {
    value: experience.years,
    suffix: experience.months > 0 ? `y ${experience.months}m` : '+ yrs',
    label: 'Experience',
    icon: Briefcase,
  },
  { value: 20, suffix: '+', label: 'Projects Delivered', icon: Code2 },
  {
    value: 4256,
    suffix: '+',
    label: 'Lines of Code Written',
    icon: FileCode,
    tooltip: 'This site was built with Claude Code — AI pair-programming across code, design, QA, and deployment.',
  },
  { value: 3, suffix: '+', label: 'Enterprise Clients Served', icon: Building2 },
]
