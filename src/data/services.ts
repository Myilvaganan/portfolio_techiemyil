import { Layers, BrainCircuit, Cloud, Network, Bot, Users } from 'lucide-react'
import type { Service } from '@/types'

export const services: Service[] = [
  {
    id: 'full-stack',
    title: 'Full Stack Development',
    description:
      'End-to-end product builds on the MERN stack and Python — from data models and REST APIs to polished, performant React interfaces.',
    icon: Layers,
  },
  {
    id: 'ai-applications',
    title: 'AI Applications',
    description:
      'LLM-powered agentic workflows, RAG pipelines, and prompt-engineered automation that replace manual processes with intelligent systems.',
    icon: BrainCircuit,
  },
  {
    id: 'cloud-architecture',
    title: 'Cloud Architecture',
    description:
      'Event-driven, cloud-native architecture on AWS and Azure — serverless microservices, IoT ingestion pipelines, and scalable infrastructure.',
    icon: Cloud,
  },
  {
    id: 'rest-apis',
    title: 'REST APIs',
    description:
      'High-throughput, well-documented APIs with streaming, pagination, and sub-200ms response times built for real production load.',
    icon: Network,
  },
  {
    id: 'automation',
    title: 'Automation',
    description:
      'Deployment pipelines, rule engines, and operational tooling that eliminate manual tracking and reduce human error at scale.',
    icon: Bot,
  },
  {
    id: 'consulting',
    title: 'Technical Consulting',
    description:
      'Architecture reviews, team mentoring, and hands-on technical leadership to help engineering teams ship with confidence.',
    icon: Users,
  },
]
