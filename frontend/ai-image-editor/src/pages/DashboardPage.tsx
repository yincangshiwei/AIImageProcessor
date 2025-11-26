import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useApi } from '../contexts/ApiContext'
import { maskAuthCode } from '../utils/authUtils'
import NavBar from '../components/NavBar'
import {
  Edit,
  History,
  Image,
  Sparkles,
  Clock,
  ArrowRight,
  RefreshCw,
  Video,
  Wand2
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

    const now = Date.now()
    const CACHE_DURATION = 5 * 60 * 1000

    if (!forceRefresh && dataCache && now - dataCache.lastRefresh < CACHE_DURATION) {
      const history = dataCache.history
      setRecentHistory(history.slice(0, 3))

      const totalCreditsUsed = history.reduce((sum, record) => sum + record.credits_used, 0)
      const modeCount = history.reduce((acc, record) => {
        acc[record.mode_type] = (acc[record.mode_type] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      const favoriteMode = Object.keys(modeCount).reduce((a, b) => (modeCount[a] > modeCount[b] ? a : b), 'multi')

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
      const history = await api.getHistory(user.code)
      setRecentHistory(history.slice(0, 3))

      const totalCreditsUsed = history.reduce((sum, record) => sum + record.credits_used, 0)
      const modeCount = history.reduce((acc, record) => {
        acc[record.mode_type] = (acc[record.mode_type] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      const favoriteMode = Object.keys(modeCount).reduce((a, b) => (modeCount[a] > modeCount[b] ? a : b), 'multi')

      setStats({
        totalGenerations: history.length,
        creditsUsed: totalCreditsUsed,
        favoriteMode
      })

      setDataCache({
        history,
        lastRefresh: now
      })

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

  const creditsLeft = user?.credits ?? 0
  const favoriteModeLabel = useMemo(
    () => (stats.favoriteMode === 'multi' ? '多图模式' : '拼图模式'),
    [stats.favoriteMode]
  )
  const averageCredits = useMemo(() => {
    if (!stats.totalGenerations) return '0'
    return (stats.creditsUsed / stats.totalGenerations).toFixed(1)
  }, [stats.creditsUsed, stats.totalGenerations])

  const statCards = useMemo(
    () => [
      {
        key: 'credits',
        label: '剩余积分',
        value: creditsLeft,
        accent: 'text-neon-green',
        hint: '实时可用'
      },
      {
        key: 'total',
        label: '总生成数',
        value: stats.totalGenerations,
        accent: 'text-neon-blue',
        hint: '累积创作'
      },
      {
        key: 'used',
        label: '已用积分',
        value: stats.creditsUsed,
        accent: 'text-neon-purple',
        hint: '累计消耗'
      }
    ],
    [creditsLeft, stats.totalGenerations, stats.creditsUsed]
  )

  const creationSpaces = useMemo(
    () => [
      {
        key: 'image',
        title: '图像创作',
        description: '画布 / 拼图双模式，快速完成视觉稿',
        icon: Edit,
        badge: 'IMAGE',
        status: 'ready' as const,
        path: '/editor',
        gradient: 'from-neon-blue/70 via-neon-purple/60 to-transparent',
        highlight: 'text-neon-blue'
      },
      {
        key: 'video',
        title: '视频创作',
        description: '高清 AI 视频生成，支持剧情分镜与关键帧',
        icon: Video,
        badge: 'VIDEO',
        status: 'building' as const,
        path: null,
        gradient: 'from-neon-green/50 via-neon-blue/40 to-transparent',
        highlight: 'text-neon-green'
      },
      {
        key: 'lab',
        title: '多模态实验室',
        description: '图像 / 视频 / 文本联合生成实验特性',
        icon: Wand2,
        badge: 'LAB',
        status: 'building' as const,
        path: null,
        gradient: 'from-neon-purple/50 via-neon-pink/40 to-transparent',
        highlight: 'text-neon-purple'
      }
    ],
    []
  )

  const handleManualRefresh = () => loadDashboardData(true)
  const hasHistory = recentHistory.length > 0

  if (loading) {
    return (
      <div className="min-h-screen">
        <NavBar />
        <main className="relative pl-[130px] md:pl-[150px] px-4 md:px-8 lg:px-12 py-10">
          <div className="dashboard-gradient pointer-events-none -z-10" />
          <div className="mx-auto max-w-7xl grid grid-cols-1 md:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="glass-panel p-6 space-y-4">
                <div className="skeleton h-6 w-32" />
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-2/3" />
              </div>
            ))}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <NavBar />

      <main className="relative pl-[130px] md:pl-[150px] px-4 md:px-8 lg:px-12 py-10">
        <div className="dashboard-gradient pointer-events-none -z-10" />

        <div className="mx-auto max-w-7xl space-y-8 relative z-10">
          <section className="glass-panel p-6 md:p-8 overflow-hidden">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-center">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4 text-xs text-white/70">
                  <span className="glass-chip">WELCOME</span>
                  <span className="hidden sm:flex items-center gap-2 text-white/50">
                    <span className="glow-dot" />
                    即刻开始创作
                  </span>
                </div>
                <h1 className="text-3xl md:text-4xl font-semibold mb-3 leading-tight">
                  欢迎回来，
                  <span className="text-neon-blue" title="授权码已隐藏保护">
                    {user?.code ? maskAuthCode(user.code) : ''}
                  </span>
                </h1>
                <p className="text-base md:text-lg text-white/70 max-w-2xl">
                  为您准备好了更清爽的创作面板，让每一次灵感都被好好珍藏。
                </p>
              </div>

              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {statCards.map((stat) => (
                  <div key={stat.key} className="glass-panel p-4 text-center">
                    <p className="text-[10px] uppercase tracking-[0.4em] text-white/60">{stat.label}</p>
                    <p className={`mt-3 text-3xl font-semibold ${stat.accent}`}>{stat.value}</p>
                    <p className="text-xs text-white/50 mt-1">{stat.hint}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="glass-panel p-6 md:p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3 text-lg font-semibold">
                <Wand2 className="w-5 h-5 text-neon-purple" />
                创作中心
              </div>
              <span className="text-xs uppercase tracking-[0.4em] text-white/40">Studios</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {creationSpaces.map((entry) => {
                const Icon = entry.icon
                const card = (
                  <div
                    className={`creation-card ${entry.status === 'ready' ? 'ready' : 'building'}`}
                  >
                    <div className={`card-gradient bg-gradient-to-br ${entry.gradient}`} />
                    <div className="relative z-10 flex items-center justify-between gap-3">
                      <span className="glass-chip text-[10px] tracking-[0.35em]">{entry.badge}</span>
                      <span
                        className={`status-pill ${entry.status === 'ready' ? 'live' : 'soon'}`}
                      >
                        {entry.status === 'ready' ? '开放中' : '建设中'}
                      </span>
                    </div>

                    <div className="relative z-10 flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-white">
                        <Icon className="w-7 h-7" />
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold">{entry.title}</h3>
                        <p className="text-sm text-white/70 mt-1">{entry.description}</p>
                        {entry.status === 'building' && (
                          <p className="text-xs text-white/50 mt-2">建设中 · 即将开放</p>
                        )}
                      </div>
                    </div>

                    <div className="relative z-10 flex items-center gap-2 text-sm font-medium">
                      <span className={entry.status === 'ready' ? entry.highlight : 'text-white/50'}>
                        {entry.status === 'ready' ? '进入工作台' : '敬请期待'}
                      </span>
                      <ArrowRight
                        className={`w-4 h-4 ${
                          entry.status === 'ready' ? entry.highlight : 'text-white/40'
                        }`}
                      />
                    </div>
                  </div>
                )

                return entry.path ? (
                  <Link key={entry.key} to={entry.path} className="group">
                    {card}
                  </Link>
                ) : (
                  <div key={entry.key} className="group cursor-not-allowed">
                    {card}
                  </div>
                )
              })}
            </div>
          </section>


          <section className="glass-panel p-6 md:p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3 text-lg font-semibold">
                <Clock className="w-5 h-5 text-neon-green" />
                最近记录
              </div>
              <Link
                to="/history"
                className="text-sm text-neon-blue hover:text-neon-purple transition-colors flex items-center gap-1"
              >
                查看全部历史 <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="space-y-4">
              {hasHistory ? (
                recentHistory.map((record) => (
                  <div key={record.id} className="history-entry">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 flex-wrap text-xs text-white/60">
                          <span className="glass-chip text-[10px] tracking-[0.4em]">
                            {record.mode_type === 'multi' ? '多图模式' : '拼图模式'}
                          </span>
                          <span>{new Date(record.created_at).toLocaleString()}</span>
                        </div>
                        <p className="text-white mt-3 text-sm leading-relaxed line-clamp-2">
                          {record.prompt_text || '（无描述）'}
                        </p>
                        <div className="mt-3 flex items-center gap-4 text-xs text-white/60">
                          <div className="flex items-center gap-1">
                            <Sparkles className="w-4 h-4 text-neon-blue" />
                            {record.credits_used} 积分
                          </div>
                          <div className="flex items-center gap-1">
                            <History className="w-4 h-4 text-neon-purple" />
                            ID: {record.id}
                          </div>
                        </div>
                      </div>
                      {record.output_images && record.output_images.length > 0 && (
                        <div className="min-w-[64px]">
                          <div className="h-16 w-16 rounded-xl bg-white/10 flex items-center justify-center text-white/60 border border-white/10">
                            <Image className="w-7 h-7" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-12">
                  <History className="w-12 h-12 text-white/40 mb-4" />
                  <p className="text-white/60 mb-6">还没有生成记录，先去体验一下吧。</p>
                  <Link to="/editor" className="neon-button inline-flex items-center gap-2">
                    开始创作 <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
