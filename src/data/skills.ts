import { Code2, Layout, Server, Cloud, BrainCircuit, GitBranch, TestTube2, Activity, Wrench } from 'lucide-react'
import type { SkillCategory } from '@/types'

export const skillCategories: SkillCategory[] = [
  {
    id: 'languages',
    title: 'Languages',
    icon: Code2,
    skills: [
      { name: 'JavaScript (ES6+)', level: 95 },
      { name: 'TypeScript', level: 92 },
      { name: 'Python', level: 88 },
    ],
  },
  {
    id: 'frontend',
    title: 'Frontend',
    icon: Layout,
    skills: [
      { name: 'React.js', level: 96 },
      { name: 'Next.js', level: 85 },
      { name: 'Redux / Redux-Saga', level: 90 },
      { name: 'AG Grid', level: 82 },
      { name: 'HTML5 / CSS3', level: 94 },
    ],
  },
  {
    id: 'backend',
    title: 'Backend',
    icon: Server,
    skills: [
      { name: 'Node.js / Express.js', level: 93 },
      { name: 'NestJS', level: 80 },
      { name: 'Python (FastAPI, Flask)', level: 86 },
      { name: 'REST APIs & Microservices', level: 94 },
    ],
  },
  {
    id: 'cloud',
    title: 'Cloud',
    icon: Cloud,
    skills: [
      { name: 'AWS (Lambda, API Gateway, DynamoDB, CDK)', level: 90 },
      { name: 'Azure (IoT Hub, Service Bus, WebPubSub, Cosmos DB)', level: 88 },
      { name: 'S3 / CloudFront / AppConfig', level: 85 },
    ],
  },
  {
    id: 'ai',
    title: 'AI',
    icon: BrainCircuit,
    skills: [
      { name: 'LangChain', level: 80 },
      { name: 'OpenAI API', level: 82 },
      { name: 'Prompt Engineering', level: 85 },
      { name: 'RAG Pipelines & Agentic Workflows', level: 80 },
    ],
  },
  {
    id: 'devops',
    title: 'DevOps',
    icon: GitBranch,
    skills: [
      { name: 'GitLab CI/CD', level: 85 },
      { name: 'Jenkins / AWS CodePipeline', level: 80 },
      { name: 'Docker (concepts)', level: 75 },
      { name: 'Kubernetes (concepts)', level: 70 },
    ],
  },
  {
    id: 'testing',
    title: 'Testing',
    icon: TestTube2,
    skills: [
      { name: 'Jest', level: 88 },
      { name: 'Cypress', level: 80 },
      { name: 'Pytest', level: 75 },
      { name: 'Unit & Integration Testing', level: 90 },
    ],
  },
  {
    id: 'monitoring',
    title: 'Monitoring',
    icon: Activity,
    skills: [
      { name: 'Kibana', level: 82 },
      { name: 'QuickSight', level: 78 },
      { name: 'Application Insights / Azure Monitor', level: 80 },
    ],
  },
  {
    id: 'tools',
    title: 'Tools',
    icon: Wrench,
    skills: [
      { name: 'Git / GitHub', level: 95 },
      { name: 'Webpack / Babel', level: 85 },
      { name: 'Figma', level: 78 },
      { name: 'Jira / Confluence', level: 88 },
    ],
  },
]
