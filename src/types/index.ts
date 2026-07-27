import type { ComponentType } from 'react'

export type IconComponent = ComponentType<{ className?: string }>

export interface NavLink {
  label: string
  href: string
}

export interface SocialLink {
  label: string
  href: string
  icon: IconComponent
}

export interface Stat {
  value: number
  suffix: string
  label: string
  icon: IconComponent
  tooltip?: string
}

export interface ExperienceEntry {
  id: string
  company: string
  companyShort: string
  role: string
  duration: string
  location: string
  client?: string
  current?: boolean
  logo?: string
  achievements: string[]
}

export interface EducationEntry {
  id: string
  degree: string
  institution: string
  location: string
  duration: string
  detail: string
}

export interface SkillItem {
  name: string
  level: number
}

export interface SkillCategory {
  id: string
  title: string
  icon: IconComponent
  skills: SkillItem[]
}

export interface Project {
  id: string
  title: string
  tagline: string
  description: string
  stack: string[]
  github?: string
  demo?: string
  image: string
  featured: boolean
  category: 'Full Stack' | 'Frontend' | 'AI' | 'E-commerce'
}

export interface Service {
  id: string
  title: string
  description: string
  icon: IconComponent
}

export interface Certification {
  id: string
  title: string
  issuer: string
  year?: string
  type: 'certification' | 'award'
}

export interface AboutHighlight {
  id: string
  title: string
  description: string
  icon: IconComponent
}

export interface TechStackItem {
  name: string
  icon: string
}
