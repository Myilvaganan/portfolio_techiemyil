import { Mail } from 'lucide-react'
import { FaGithub, FaInstagram, FaLinkedin, FaTelegram, FaWhatsapp } from 'react-icons/fa'
import { SiTradingview } from 'react-icons/si'
import type { SocialLink } from '@/types'
import { personal } from './personal'

export const socials: SocialLink[] = [
  { label: 'LinkedIn', href: personal.links.linkedin, icon: FaLinkedin },
  { label: 'GitHub', href: personal.links.github, icon: FaGithub },
  { label: 'WhatsApp', href: personal.links.whatsapp, icon: FaWhatsapp },
  { label: 'Telegram', href: personal.links.telegram, icon: FaTelegram },
  { label: 'Instagram', href: personal.links.instagram, icon: FaInstagram },
  { label: 'TradingView', href: personal.links.tradingview, icon: SiTradingview },
  { label: 'Email', href: `mailto:${personal.email}`, icon: Mail },
]
