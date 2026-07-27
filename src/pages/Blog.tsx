import { Newspaper } from 'lucide-react'
import { ComingSoonPage } from '@/components/common/ComingSoonPage'

export function Blog() {
  return (
    <ComingSoonPage
      icon={Newspaper}
      title="The Blog"
      description="Long-form notes on system design, AI-integrated engineering, and lessons from leading production teams — launching soon."
    />
  )
}
