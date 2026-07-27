import { Mail } from 'lucide-react'
import { FaGithub, FaLinkedin, FaWhatsapp } from 'react-icons/fa'
import type { SocialLink } from '@/types'
import { personal } from './personal'

export const socials: SocialLink[] = [
  { label: 'LinkedIn', href: personal.links.linkedin, icon: FaLinkedin },
  { label: 'GitHub', href: personal.links.github, icon: FaGithub },
  { label: 'WhatsApp', href: personal.links.whatsapp, icon: FaWhatsapp },
  { label: 'Email', href: `mailto:${personal.email}`, icon: Mail },
]
