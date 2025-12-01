import { Images, Layers } from 'lucide-react'
import type { ModeNavigationTab } from '../types/navigation'

export const MODE_NAVIGATION_TABS: ModeNavigationTab[] = [
  {
    key: 'multi',
    label: '多图模式',
    route: '/editor/multi',
    description: '多画布矩阵创作',
    icon: Images,
    accentGradient: 'from-[#57b6ff] via-[#6b7dff] to-[#c084fc]'
  },
  {
    key: 'puzzle',
    label: '拼图模式',
    route: '/editor/puzzle',
    description: '智能拼块布局',
    icon: Layers,
    accentGradient: 'from-[#2dd4bf] via-[#22d3ee] to-[#6366f1]'
  }
]
