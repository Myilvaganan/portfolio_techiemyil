import { Mail } from 'lucide-react'
import { FaGithub, FaLinkedin } from 'react-icons/fa'
import type { SocialLink } from '@/types'
import { personal } from './personal'

export const socials: SocialLink[] = [
  { label: 'LinkedIn', href: personal.links.linkedin, icon: FaLinkedin },
  { label: 'GitHub', href: personal.links.github, icon: FaGithub },
  { label: 'Email', href: `mailto:${personal.email}`, icon: Mail },
]
