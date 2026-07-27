import { formatExperienceDuration, getExperienceDuration } from '@/lib/experience'

export const personal = {
  name: 'Myilvaganan Sakthivel',
  firstName: 'Myilvaganan',
  initials: 'MS',
  brand: 'Techie Myil',
  brandShort: 'TM',
  roles: ['Specialist Programmer', 'Senior Software Engineer', 'Technical Lead', 'Full Stack Engineer', 'AI Systems Engineer'],
  title: 'Senior Software Engineer · Full-Stack & AI-Integrated Systems · Team Lead',
  location: 'Bangalore, India',
  email: 'connect@techiemyil.com',
  phone: '+91 6374517254',
  availability: 'Available for Freelance',
  summary: `Results-driven Senior Software Engineer and Technical Lead with ${formatExperienceDuration(getExperienceDuration())} of experience architecting and delivering production-grade full-stack applications, leading cross-functional engineering teams, and integrating AI-powered systems into enterprise platforms.`,
  longSummary:
    'I architect and deliver production-grade full-stack applications using the MERN stack, Python, and TypeScript — with deep expertise in cloud-native, event-driven systems across AWS and Azure. I lead cross-functional engineering teams from requirements to production, mentor developers on clean architecture and SOLID principles, and build AI/LLM-powered agentic workflows that turn manual operations into intelligent automation. My work spans real-time IoT telemetry pipelines, scalable API design, and performance-critical systems processing over 100,000 events daily.',
  links: {
    linkedin: 'https://linkedin.com/in/Myilvaganan',
    github: 'https://github.com/Myilvaganan',
    portfolio: 'https://portfolio.techiemyil.com',
    studio: 'https://studio.techiemyil.com',
    whatsapp: 'https://wa.me/916374517254',
  },
} as const
