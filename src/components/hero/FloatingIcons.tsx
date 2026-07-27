import { motion } from 'framer-motion'
import { FaAws, FaDocker, FaNodeJs, FaPython, FaReact } from 'react-icons/fa'
import { SiTypescript } from 'react-icons/si'
import type { IconType } from 'react-icons'

interface FloatingIcon {
  Icon: IconType
  label: string
  color: string
  top: string
  left: string
  size: number
  duration: number
  delay: number
}

const icons: FloatingIcon[] = [
  { Icon: FaReact, label: 'React', color: '#61DAFB', top: '2%', left: '8%', size: 22, duration: 5.5, delay: 0 },
  { Icon: FaNodeJs, label: 'Node.js', color: '#3C873A', top: '12%', left: '92%', size: 20, duration: 6.5, delay: 0.6 },
  { Icon: SiTypescript, label: 'TypeScript', color: '#3178C6', top: '48%', left: '2%', size: 20, duration: 6, delay: 1.2 },
  { Icon: FaPython, label: 'Python', color: '#FFD43B', top: '52%', left: '96%', size: 22, duration: 7, delay: 0.3 },
  { Icon: FaAws, label: 'AWS', color: '#FF9900', top: '88%', left: '10%', size: 24, duration: 6.2, delay: 0.9 },
  { Icon: FaDocker, label: 'Docker', color: '#2496ED', top: '90%', left: '88%', size: 22, duration: 5.8, delay: 1.5 },
]

export function FloatingIcons() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden="true">
      {icons.map((item, i) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.8 + i * 0.12, ease: 'easeOut' }}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ top: item.top, left: item.left }}
        >
          <motion.div
            animate={{ y: [0, -12, 0] }}
            transition={{ duration: item.duration, delay: item.delay, repeat: Infinity, ease: 'easeInOut' }}
            className="flex items-center justify-center rounded-2xl border border-border bg-card/80 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)] backdrop-blur-md"
            style={{ width: item.size + 20, height: item.size + 20 }}
          >
            <item.Icon style={{ width: item.size, height: item.size, color: item.color }} aria-label={item.label} />
          </motion.div>
        </motion.div>
      ))}
    </div>
  )
}
