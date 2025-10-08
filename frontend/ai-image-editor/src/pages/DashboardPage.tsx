import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useApi } from '../contexts/ApiContext'
import { maskAuthCode } from '../utils/authUtils'
import NavBar from '../components/NavBar'
import {
  Edit,
  History,
  Bookmark,
  Zap,
  TrendingUp,
  Image,
  Sparkles,
  Clock,
  ArrowRight
} from 'lucide-react'
import { GenerationRecord } from '../types'

export default function DashboardPage() {
  const { user, refreshUserInfo } = useAuth()
  const { api } = useApi()
  const [recentHistory, setRecentHistory] = useState<GenerationRecord[]>([])
  const [stats, setStats] = useState({
    totalGenerations: 0,
    creditsUsed: 0,
    favoriteMode: 'multi'
  })
  const [loading, setLoading] = useState(true)
  const [dataCache, setDataCache] = useState<{
    history: GenerationRecord[]
    lastRefresh: number
  } | null>(null)

  const loadDashboardData = useCallback(async (forceRefresh = false) => {
    if (!user) return
    
    // 检查缓存（5分钟有效期）
    const now = Date.now()
    const CACHE_DURATION = 5 * 60 * 1000 // 5分钟
    
    if (!forceRefresh && dataCache && (now - dataCache.lastRefresh) < CACHE_DURATION) {
      // 使用缓存数据
      setRecentHistory(dataCache.history.slice(0, 3))
      
      // 计算统计数据
      const history = dataCache.history
      const totalCreditsUsed = history.reduce((sum, record) => sum + record.credits_used, 0)
      const modeCount = history.reduce((acc, record) => {
        acc[record.mode_type] = (acc[record.mode_type] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      const favoriteMode = Object.keys(modeCount).reduce((a, b) => modeCount[a] > modeCount[b] ? a : b, 'multi')
      
      setStats({
        totalGenerations: history.length,
        creditsUsed: totalCreditsUsed,
        favoriteMode
      })
      
      setLoading(false)
      return
    }
    
    try {
      setLoading(true)
      
      // 加载最近历史记录
      const history = await api.getHistory(user.code)
      setRecentHistory(history.slice(0, 3))
      
      // 计算统计数据
      const totalCreditsUsed = history.reduce((sum, record) => sum + record.credits_used, 0)
      const modeCount = history.reduce((acc, record) => {
        acc[record.mode_type] = (acc[record.mode_type] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      const favoriteMode = Object.keys(modeCount).reduce((a, b) => modeCount[a] > modeCount[b] ? a : b, 'multi')
      
      setStats({
        totalGenerations: history.length,
        creditsUsed: totalCreditsUsed,
        favoriteMode
      })
      
      // 缓存数据
      setDataCache({
        history,
        lastRefresh: now
      })
      
      // 刷新用户信息
      await refreshUserInfo()
      
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }, [user, api, refreshUserInfo, dataCache])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

  const quickActions = [
    {
      title: '快速编辑',
      description: '开始创建您的AI图像',
      icon: Edit,
      path: '/editor',
      color: 'neon-blue',
      gradient: 'from-neon-blue to-neon-purple'
    },
    {
      title: '历史记录',
      description: '查看过往的编辑记录',
      icon: History,
      path: '/history',
      color: 'neon-green',
      gradient: 'from-neon-green to-neon-blue'
    }
  ]

  if (loading) {
    return (
      <div className="min-h-screen">
        <NavBar className="mb-6" />
        <div className="container mx-auto max-w-7xl px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="cyber-card p-6">
                <div className="skeleton h-6 w-32 mb-4"></div>
                <div className="skeleton h-4 w-full mb-2"></div>
                <div className="skeleton h-4 w-2/3"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <NavBar className="mb-6" />
      
      <div className="container mx-auto max-w-7xl px-4">
        {/* Welcome Section */}
        <div className="cyber-card p-8 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">
                欢迎回来，<span className="text-neon-blue" title="授权码已隐藏保护">{user?.code ? maskAuthCode(user.code) : ''}</span>
              </h1>
              <p className="text-gray-400 text-lg">
                准备好创造令人惊叹的AI图像了吗？
              </p>
            </div>
            
            <div className="mt-6 lg:mt-0 flex items-center space-x-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-neon-green">{user?.credits}</div>
                <div className="text-sm text-gray-400">剩余积分</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-neon-blue">{stats.totalGenerations}</div>
                <div className="text-sm text-gray-400">总生成数</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-neon-purple">{stats.creditsUsed}</div>
                <div className="text-sm text-gray-400">已用积分</div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-6 flex items-center">
            <Sparkles className="w-6 h-6 text-neon-blue mr-2" />
            快速操作
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {quickActions.map((action) => {
              const Icon = action.icon
              return (
                <Link key={action.path} to={action.path}>
                  <div className="cyber-card p-6 hover:scale-105 transition-all duration-300 group cursor-pointer">
                    <div className={`w-12 h-12 bg-gradient-to-br ${action.gradient} rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    
                    <h3 className="text-xl font-semibold mb-2 group-hover:text-neon-blue transition-colors">
                      {action.title}
                    </h3>
                    
                    <p className="text-gray-400 mb-4">{action.description}</p>
                    
                    <div className="flex items-center text-sm text-neon-blue opacity-0 group-hover:opacity-100 transition-opacity">
                      立即开始 <ArrowRight className="w-4 h-4 ml-1" />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Recent History */}
          <div>
            <h3 className="text-xl font-bold mb-4 flex items-center">
              <Clock className="w-5 h-5 text-neon-green mr-2" />
              最近记录
            </h3>
            
            <div className="space-y-4">
              {recentHistory.length > 0 ? (
                recentHistory.map((record) => (
                  <div key={record.id} className="cyber-card p-4 hover:bg-cyber-gray/30 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-sm mb-1">
                          {record.mode_type === 'multi' ? '多图模式' : '拼图模式'}
                        </p>
                        <p className="text-gray-400 text-sm mb-2 line-clamp-2">
                          {record.prompt_text}
                        </p>
                        <div className="flex items-center text-xs text-gray-500">
                          <span>{new Date(record.created_at).toLocaleDateString()}</span>
                          <span className="mx-2">•</span>
                          <span>{record.credits_used} 积分</span>
                        </div>
                      </div>
                      
                      {record.output_images && record.output_images.length > 0 && (
                        <div className="ml-4">
                          <div className="w-12 h-12 bg-gray-700 rounded-lg flex items-center justify-center">
                            <Image className="w-6 h-6 text-gray-400" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="cyber-card p-8 text-center">
                  <History className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                  <p className="text-gray-400">还没有生成记录</p>
                  <Link to="/editor" className="neon-button-pink mt-4 inline-flex items-center px-4 py-2">
                    开始创作
                  </Link>
                </div>
              )}
              
              {recentHistory.length > 0 && (
                <Link to="/history" className="block text-center text-neon-blue hover:text-neon-purple transition-colors">
                  查看全部记录 <ArrowRight className="w-4 h-4 inline ml-1" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}