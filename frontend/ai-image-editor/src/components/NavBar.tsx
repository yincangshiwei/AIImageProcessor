import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { maskAuthCode } from '../utils/authUtils'
import { 
  Home, 
  Edit, 
  History, 
  Bookmark, 
  User, 
  LogOut, 
  Coins 
} from 'lucide-react'

interface NavBarProps {
  className?: string
}

export default function NavBar({ className = '' }: NavBarProps) {
  const { user, logout } = useAuth()
  const location = useLocation()

  const navigation = [
    { name: '仪表盘', path: '/dashboard', icon: Home },
    { name: '编辑器', path: '/editor', icon: Edit },
    { name: '历史记录', path: '/history', icon: History },
    { name: '案例库', path: '/cases', icon: Bookmark },
  ]

  const isActive = (path: string) => location.pathname === path

  if (!user) return null

  return (
    <nav className={`cyber-card p-4 ${className}`}>
      <div className="flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center">
          <div className="w-8 h-8 bg-gradient-to-br from-neon-blue to-neon-purple rounded-lg flex items-center justify-center mr-3">
            <span className="text-white font-bold text-sm">AI</span>
          </div>
          <span className="font-bold text-lg text-neon-blue">
            图像编辑平台
          </span>
        </div>

        {/* Navigation Links */}
        <div className="flex items-center space-x-1">
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive(item.path)
                    ? 'bg-neon-blue/20 text-neon-blue border border-neon-blue/50'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
              >
                <Icon className="w-4 h-4 mr-2" />
                {item.name}
              </Link>
            )
          })}
        </div>

        {/* User Info & Actions */}
        <div className="flex items-center space-x-4">
          {/* Credits Display */}
          <div className="flex items-center px-3 py-1.5 bg-neon-green/20 border border-neon-green/50 rounded-lg">
            <Coins className="w-4 h-4 text-neon-green mr-2" />
            <span className="text-neon-green font-medium">{user.credits}</span>
            <span className="text-gray-400 text-sm ml-1">积分</span>
          </div>

          {/* User Menu */}
          <div className="flex items-center space-x-2">
            <div className="flex items-center px-3 py-1.5 bg-gray-700/50 rounded-lg">
              <User className="w-4 h-4 text-gray-400 mr-2" />
              <span className="text-sm text-gray-300" title="授权码已隐藏保护">
                {maskAuthCode(user.code)}
              </span>
            </div>
            
            <button
              onClick={logout}
              className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/20 rounded-lg transition-all duration-200"
              title="退出登录"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}