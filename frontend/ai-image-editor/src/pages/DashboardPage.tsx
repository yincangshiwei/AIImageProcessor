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

function BackgroundAura() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-36 -left-40 h-[420px] w-[420px] rounded-full bg-gradient-to-br from-[#6c8bff]/40 via-[#ff9ee2]/30 to-transparent blur-[140px]" />
      <div className="absolute top-1/3 right-[-160px] h-[540px] w-[540px] rounded-full bg-gradient-to-br from-[#36f0ff]/25 via-[#8a63ff]/25 to-transparent blur-[160px]" />
      <div className="absolute bottom-[-120px] left-1/4 h-[360px] w-[360px] rounded-full bg-gradient-to-tr from-[#ffcc70]/10 via-transparent to-transparent blur-[120px]" />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.08), transparent 55%)'
        }}
      />
      <div className="absolute inset-y-0 left-1/2 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent opacity-60" />
    </div>
  )
}

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
        label: '灵感余量',
        value: creditsLeft,
        hint: '可立即用于生成',
        detail: `偏好 · ${favoriteModeLabel}`,
        icon: Sparkles,
        gradient: 'from-[#4dd4ff]/45 via-[#947bff]/30 to-transparent',
        border: 'ring-[#8ecbff]/40'
      },
      {
        key: 'total',
        label: '累计作品',
        value: stats.totalGenerations,
        hint: '历史创作次数',
        detail: `平均 ${averageCredits} 积分/次`,
        icon: Clock,
        gradient: 'from-[#ffb3c1]/40 via-[#c987ff]/30 to-transparent',
        border: 'ring-[#f1bfff]/30'
      },
      {
        key: 'used',
        label: '已投入灵感',
        value: stats.creditsUsed,
        hint: '消耗积分总量',
        detail: `曾完成 ${stats.totalGenerations} 次`,
        icon: History,
        gradient: 'from-[#6fffd2]/35 via-[#57b9ff]/30 to-transparent',
        border: 'ring-[#9efff1]/30'
      }
    ],
    [creditsLeft, stats.totalGenerations, stats.creditsUsed, favoriteModeLabel, averageCredits]
  )

  const creationSpaces = useMemo(
    () => [
      {
        key: 'image',
        title: '图像创作工作台',
        description: '画布 / 拼图双引擎，适合艺术分镜与商业海报',
        icon: Edit,
        badge: 'IMAGE STUDIO',
        status: 'ready' as const,
        path: '/editor',
        gradient: 'from-[#6b7bff]/60 via-[#ff86d6]/35 to-transparent',
        texture:
          'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.4), transparent 55%)',
        features: ['画布模式', '拼图模式', '风格图层'],
        tagline: '即时渲染 · 自定义光影',
        cta: '进入工作台',
        border: 'ring-[#c5d2ff]/30'
      },
      {
        key: 'video',
        title: '视频创作工作室',
        description: '高清 AI 视频生成，支持剧情分镜与关键帧',
        icon: Video,
        badge: 'VIDEO STUDIO',
        status: 'building' as const,
        path: null,
        gradient: 'from-[#4be4c9]/45 via-[#57b9ff]/35 to-transparent',
        texture:
          'radial-gradient(circle at 70% 30%, rgba(255,255,255,0.25), transparent 55%)',
        features: ['剧情分镜', '关键帧', '光影调校'],
        tagline: '概念研发中 · 招募创作伙伴',
        cta: '敬请期待',
        border: 'ring-[#7ee0ff]/25'
      },
      {
        key: 'lab',
        title: '多模态实验室',
        description: '图像 / 视频 / 文本联合生成实验特性',
        icon: Wand2,
        badge: 'LAB',
        status: 'building' as const,
        path: null,
        gradient: 'from-[#c5a5ff]/45 via-[#ff96c5]/35 to-transparent',
        texture:
          'radial-gradient(circle at 50% 80%, rgba(255,255,255,0.32), transparent 60%)',
        features: ['跨模态提示', '智能拼贴', '质感混合'],
        tagline: '体验先锋 · 提前感受未来工具',
        cta: '敬请期待',
        border: 'ring-[#f6c8ff]/25'
      }
    ],
    []
  )

  const formatHistoryTimestamp = useCallback((timestamp: string) => {
    const date = new Date(timestamp)
    if (Number.isNaN(date.getTime())) {
      return timestamp
    }

    return date.toLocaleString('zh-CN', {
      hour12: false
    })
  }, [])

  const getHistoryVisual = useCallback((modeType: string) => {
    if (modeType === 'multi') {
      return {
        label: '多图模式',
        gradient: 'from-[#6c8bff]/25 via-[#c58dff]/15 to-transparent',
        particle:
          'radial-gradient(circle at 18% 20%, rgba(255,255,255,0.35), transparent 60%)',
        accent: 'text-[#9bb7ff]'
      }
    }

    return {
      label: '拼图模式',
      gradient: 'from-[#ffb57f]/20 via-[#ff8fb2]/15 to-transparent',
      particle:
        'radial-gradient(circle at 80% 35%, rgba(255,255,255,0.3), transparent 60%)',
      accent: 'text-[#ffdcca]'
    }
  }, [])

  const handleManualRefresh = () => loadDashboardData(true)
  const hasHistory = recentHistory.length > 0

  if (loading) {
    return (
      <div className="min-h-screen">
        <NavBar />
        <main className="relative pl-[130px] md:pl-[150px] px-4 md:px-8 lg:px-12 py-10">
          <BackgroundAura />
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
        <BackgroundAura />
        <div className="dashboard-gradient pointer-events-none -z-10" />

        <div className="mx-auto max-w-7xl space-y-8 relative z-10">
          <section className="glass-panel p-6 md:p-8 overflow-hidden">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-stretch">
              <div className="flex-1 space-y-5">
                <div className="flex flex-wrap items-center gap-3 text-xs text-white/70">
                  <span className="glass-chip">WELCOME</span>
                  <span className="hidden sm:flex items-center gap-2 text-white/50">
                    <span className="glow-dot" />
                    即刻开始创作
                  </span>
                  <button
                    type="button"
                    onClick={handleManualRefresh}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-white/70 transition-colors hover:bg-white/10"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> 刷新
                  </button>
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-semibold mb-3 leading-tight text-white">
                    欢迎回来，
                    <span className="text-neon-blue" title="授权码已隐藏保护">
                      {user?.code ? maskAuthCode(user.code) : ''}
                    </span>
                  </h1>
                  <p className="text-base md:text-lg text-white/70 max-w-2xl">
                    为您准备好了更清爽的创作面板，让每一次灵感都被好好珍藏。
                  </p>
                </div>
              </div>

              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {statCards.map((stat) => {
                  const Icon = stat.icon
                  return (
                    <div
                      key={stat.key}
                      className={`relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 ring-1 ${stat.border} backdrop-blur-2xl`}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient}`} />
                      <div className="relative z-10 flex flex-col gap-2 p-5">
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.4em] text-white/70">
                          <span>{stat.label}</span>
                          <Icon className="w-4 h-4 text-white/70" />
                        </div>
                        <p className="text-3xl font-semibold text-white">{stat.value}</p>
                        <p className="text-xs text-white/70">{stat.hint}</p>
                        <p className="text-sm text-white/80">{stat.detail}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          <section className="glass-panel p-6 md:p-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3 text-lg font-semibold">
                <Wand2 className="w-5 h-5 text-neon-purple" />
                创作中心
              </div>
              <span className="text-xs uppercase tracking-[0.4em] text-white/40">
                Studios · Art & Tech
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {creationSpaces.map((entry) => {
                const Icon = entry.icon
                const statusLabel = entry.status === 'ready' ? '开放中' : '建设中'
                const card = (
                  <div
                    className={`relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.05] ring-1 ${entry.border} backdrop-blur-2xl transition-transform duration-300 group-hover:-translate-y-1`}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${entry.gradient}`} />
                    <div
                      className="absolute inset-0 opacity-30"
                      style={{ backgroundImage: entry.texture }}
                    />
                    <div className="relative z-10 flex flex-col gap-4 p-6 min-h-[260px]">
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.35em] text-white/70">
                        <span>{entry.badge}</span>
                        <span className={`status-pill ${entry.status === 'ready' ? 'live' : 'soon'}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="flex items-start gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center text-white shadow-inner shadow-white/20">
                          <Icon className="w-7 h-7" />
                        </div>
                        <div>
                          <h3 className="text-xl font-semibold text-white">{entry.title}</h3>
                          <p className="text-sm text-white/70 mt-1">{entry.description}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.3em] text-white/60">
                        {entry.features.map((feature) => (
                          <span key={feature} className="glass-chip bg-white/10">
                            {feature}
                          </span>
                        ))}
                      </div>
                      <div className="mt-auto flex items-center justify-between text-sm text-white/80">
                        <p>{entry.tagline}</p>
                        <span
                          className={`inline-flex items-center gap-2 ${
                            entry.status === 'ready' ? 'text-neon-blue' : 'text-white/60'
                          }`}
                        >
                          {entry.cta}
                          <ArrowRight className="w-4 h-4" />
                        </span>
                      </div>
                    </div>
                  </div>
                )

                return entry.path ? (
                  <Link key={entry.key} to={entry.path} className="group">
                    {card}
                  </Link>
                ) : (
                  <div key={entry.key} className="group cursor-not-allowed opacity-85">
                    {card}
                  </div>
                )
              })}
            </div>
          </section>


          <section className="glass-panel p-6 md:p-8">
            <div className="flex items-center justify-between mb-6 md:mb-8">
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

            <div className="space-y-5">
              {hasHistory ? (
                recentHistory.map((record) => {
                  const visual = getHistoryVisual(record.mode_type)
                  const previewSource =
                    Array.isArray(record.output_images) && record.output_images.length > 0
                      ? record.output_images[0]
                      : null
                  const previewImageUrl =
                    typeof previewSource === 'string' && previewSource.length > 0 ? previewSource : null
                  const timestampLabel = formatHistoryTimestamp(record.created_at)
                  const promptDescription =
                    record.prompt_text && record.prompt_text.trim().length > 0
                      ? record.prompt_text
                      : '（无描述）'
                  const preciseDate = new Date(record.created_at)
                  const timeLabel = Number.isNaN(preciseDate.getTime())
                    ? ''
                    : preciseDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

                  return (
                    <div
                      key={record.id}
                      className="relative group rounded-3xl border border-white/10 bg-white/[0.05] ring-1 ring-white/10 overflow-hidden backdrop-blur-2xl"
                    >
                      <div className={`absolute inset-0 bg-gradient-to-r ${visual.gradient}`} />
                      <div
                        className="absolute inset-0 opacity-35"
                        style={{ backgroundImage: visual.particle }}
                      />
                      <div className="relative z-10 grid gap-6 md:grid-cols-[minmax(0,1fr)_180px] p-5 md:p-6">
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center gap-3 text-xs text-white/70">
                            <span className={`glass-chip text-[10px] tracking-[0.4em] ${visual.accent}`}>
                              {visual.label}
                            </span>
                            <span className="text-white/60">{timestampLabel}</span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.3em]">
                              <Sparkles className="w-3.5 h-3.5 text-white/80" />
                              {record.credits_used} 积分
                            </span>
                          </div>
                          <p className="text-white text-sm md:text-base leading-relaxed">
                            {promptDescription}
                          </p>
                          <div className="flex flex-wrap items-center gap-4 text-xs text-white/70">
                            <div className="flex items-center gap-1">
                              <History className="w-4 h-4 text-white/70" />
                              ID: {record.id}
                            </div>
                            {timeLabel && (
                              <div className="flex items-center gap-1">
                                <Clock className="w-4 h-4 text-white/70" />
                                {timeLabel}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col justify-between gap-4">
                          {previewImageUrl ? (
                            <div className="relative h-32 rounded-2xl overflow-hidden border border-white/15 bg-white/10 shadow-[0_20px_35px_rgba(0,0,0,0.35)]">
                              <img
                                src={previewImageUrl}
                                alt="历史生成预览"
                                className="h-full w-full object-cover"
                              />
                              <div className="absolute inset-0 bg-gradient-to-tr from-black/30 via-transparent to-transparent" />
                            </div>
                          ) : (
                            <div className="h-32 rounded-2xl border border-dashed border-white/20 bg-white/5 flex items-center justify-center text-white/50">
                              <Image className="w-8 h-8" />
                            </div>
                          )}
                          <div className="flex items-center justify-between text-xs text-white/70">
                            <span className="uppercase tracking-[0.35em]">{visual.label}</span>
                            <Link
                              to="/history"
                              className="inline-flex items-center gap-1 text-neon-blue hover:text-neon-purple transition-colors"
                            >
                              深入查看
                              <ArrowRight className="w-4 h-4" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-16 rounded-3xl border border-dashed border-white/15 bg-white/5">
                  <History className="w-12 h-12 text-white/40 mb-4" />
                  <p className="text-white/70 mb-6">还没有生成记录，先去体验一下吧。</p>
                  <Link
                    to="/editor"
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 py-2 text-sm text-white hover:bg-white/20 transition-colors"
                  >
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
