import { Compass, Network, BrainCircuit, CloudCog, Users2 } from 'lucide-react'
import type { AboutHighlight } from '@/types'

export const aboutHighlights: AboutHighlight[] = [
  {
    id: 'leadership',
    title: 'Technical Leadership',
    description: 'Leading cross-functional teams of 5–7 engineers from requirements through production delivery.',
    icon: Compass,
  },
  {
    id: 'system-design',
    title: 'System Design',
    description: 'Architecting event-driven, microservice-based systems built to scale under real production load.',
    icon: Network,
  },
  {
    id: 'ai-integration',
    title: 'AI Integration',
    description: 'Building LLM-powered agentic workflows and RAG pipelines that automate real operational work.',
    icon: BrainCircuit,
  },
  {
    id: 'cloud-architecture',
    title: 'Cloud Architecture',
    description: 'Designing cloud-native infrastructure across AWS and Azure for high-throughput, resilient platforms.',
    icon: CloudCog,
  },
  {
    id: 'mentoring',
    title: 'Mentoring',
    description: 'Coaching engineers on SOLID principles, clean architecture, and design patterns via code reviews.',
    icon: Users2,
  },
]
