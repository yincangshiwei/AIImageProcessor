import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { maskAuthCode } from '../utils/authUtils'
import {
  Home,
  Image,
  History,
  User,
  LogOut,
  Coins,
  Shield
} from 'lucide-react'

interface NavBarProps {
  className?: string
}

export default function NavBar({ className = '' }: NavBarProps) {
  const { user, logout } = useAuth()
  const location = useLocation()

  const navigation = [
    { name: '主页', path: '/dashboard', icon: Home },
    { name: '图像', path: '/editor/multi', icon: Image },
    { name: '历史', path: '/history', icon: History }
  ]

  const isActive = (path: string) => {
    if (path.startsWith('/editor')) {
      return location.pathname.startsWith('/editor')
    }
    return location.pathname === path
  }

  if (!user) return null

  return (
    <nav
      className={`fixed left-0 top-0 z-30 h-screen w-[100px] border-r border-white/5 bg-slate-950/70 px-3 py-6 backdrop-blur-2xl ${className}`}
    >
      <div className="flex h-full flex-col items-center">
        <div className="text-center text-white">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-neon-blue via-neon-purple to-neon-pink text-lg font-semibold">
            AI
          </div>
          <p className="mt-3 text-[10px] uppercase tracking-[0.45em] text-gray-400">AI</p>
          <p className="text-xs font-semibold text-white">创作平台</p>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          {navigation.map((item) => {
            const Icon = item.icon
            const active = isActive(item.path)
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center text-[11px] font-medium transition-colors duration-200 ${
                  active ? 'text-white' : 'text-gray-500 hover:text-white'
                }`}
              >
                <Icon
                  className={`h-5 w-5 transition-colors ${
                    active ? 'text-neon-blue drop-shadow-[0_0_8px_rgba(14,165,233,0.6)]' : 'text-gray-500'
                  }`}
                />
                <span className="mt-1">{item.name}</span>
              </Link>
            )
          })}
        </div>

        <div className="mb-6 flex flex-col items-center gap-4 text-white">
          <div className="flex flex-col items-center gap-1">
            <Coins className="h-5 w-5 text-neon-green" />
            <span className="text-sm font-semibold text-neon-green">{user.credits}</span>
          </div>
          <div className="flex flex-col items-center gap-1" title="授权码已隐藏保护">
            <Shield className="h-5 w-5 text-neon-blue" />
            <span className="break-all text-[11px] text-gray-200">{maskAuthCode(user.code)}</span>
          </div>
          <button
            onClick={logout}
            className="flex flex-col items-center text-[11px] text-gray-500 transition-colors duration-200 hover:text-red-400"
            title="退出登录"
          >
            <LogOut className="h-5 w-5" />
            <span className="mt-1">退出</span>
          </button>
        </div>
      </div>
    </nav>
  )
}
