import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useApi } from '../contexts/ApiContext'
import NavBar from '../components/NavBar'
import {
  History,
  Download,
  RotateCcw,
  Copy,
  Trash2,
  Search,
  Filter,
  Clock,
  Coins,
  Video,
  LayoutGrid,
  List as ListIcon,
  Sparkles
} from 'lucide-react'
import { GenerationRecord, GenerationModuleName } from '../types'

type ModuleFilter =
  | 'all'
  | 'AI图像:多图模式'
  | 'AI图像:拼图模式-自定义画布'
  | 'AI图像:拼图模式-图像拼接'

const MODULE_FILTER_OPTIONS: { value: ModuleFilter; label: string }[] = [
  { value: 'all', label: '全部模块' },
  { value: 'AI图像:多图模式', label: '多图模式' },
  { value: 'AI图像:拼图模式-自定义画布', label: '拼图 · 自定义画布' },
  { value: 'AI图像:拼图模式-图像拼接', label: '拼图 · 图像拼接' }
]

const MODULE_ROUTE_MAP: Record<GenerationModuleName, string> = {
  'AI图像:多图模式': '/editor/multi',
  'AI图像:拼图模式-自定义画布': '/editor/puzzle?layout=canvas',
  'AI图像:拼图模式-图像拼接': '/editor/puzzle?layout=merge'
}

const formatModuleLabel = (moduleName: string) => moduleName.replace('AI图像:', '')
const isPuzzleModule = (moduleName: string) => moduleName.includes('拼图')
const isVideoTask = (mediaType: string) => mediaType === 'video'

const PARAM_LABEL_MAP: Record<string, string> = {
  image_size: '分辨率',
  aspect_ratio: '比例',
  output_count: '输出',
  model_name: '模型',
  legacy_mode_type: '模式',
  media_type: '媒介',
  duration_seconds: '时长',
  input_image_count: '输入'
}

const buildParamTokens = (record: GenerationRecord) => {
  if (!record.input_ext_param) {
    return [] as { key: string; label: string; value: string }[]
  }

  const tokens: { key: string; label: string; value: string }[] = []
  Object.entries(PARAM_LABEL_MAP).forEach(([key, label]) => {
    const rawValue = record.input_ext_param?.[key]
    if (rawValue === null || rawValue === undefined) {
      return
    }
    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim()
      if (!trimmed) {
        return
      }
      tokens.push({ key, label, value: trimmed })
      return
    }
    if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
      tokens.push({ key, label, value: `${rawValue}` })
    }
  })
  return tokens.slice(0, 5)
}

const formatTimestamp = (value: string) =>
  new Date(value).toLocaleString('zh-CN', {
    hour12: false
  })

export default function HistoryPage() {
  const { user } = useAuth()
  const { api } = useApi()
  const [records, setRecords] = useState<GenerationRecord[]>([])
  const [filteredRecords, setFilteredRecords] = useState<GenerationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>('all')
  const [sortBy, setSortBy] = useState<'date' | 'credits'>('date')
  const [selectedRecord, setSelectedRecord] = useState<GenerationRecord | null>(null)
  const [copiedPrompt, setCopiedPrompt] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  useEffect(() => {
    const loadHistory = async () => {
      if (!user) return

      try {
        const history = await api.getHistory(user.code)
        setRecords(history)
        setFilteredRecords(history)
      } catch (error) {
        console.error('Failed to load history:', error)
      } finally {
        setLoading(false)
      }
    }

    loadHistory()
  }, [user, api])

  useEffect(() => {
    let filtered = [...records]

    if (moduleFilter !== 'all') {
      filtered = filtered.filter((record) => record.module_name === moduleFilter)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase()
      filtered = filtered.filter((record) => record.prompt_text.toLowerCase().includes(query))
    }

    filtered.sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
      return b.credits_used - a.credits_used
    })

    setFilteredRecords(filtered)
  }, [records, searchQuery, moduleFilter, sortBy])

  const reuseRecord = (record: GenerationRecord) => {
    const basePath = MODULE_ROUTE_MAP[record.module_name] ?? '/editor/multi'
    const targetUrl = new URL(basePath, window.location.origin)
    targetUrl.searchParams.set('prompt', record.prompt_text)
    window.location.href = `${targetUrl.pathname}${targetUrl.search}`
  }

  const copyPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopiedPrompt(prompt)
      setTimeout(() => setCopiedPrompt(''), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const downloadResults = (record: GenerationRecord) => {
    const targets = record.media_type === 'video' ? record.output_videos ?? [] : record.output_images ?? []
    targets.forEach((url, index) => {
      setTimeout(() => {
        const link = document.createElement('a')
        link.href = url
        const extension = record.media_type === 'video' ? 'mp4' : 'png'
        link.download = `result-${record.id}-${index + 1}.${extension}`
        link.click()
      }, index * 400)
    })
  }

  const moduleUsage = records.reduce((acc, record) => {
    const key = record.module_name
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const favoriteModule = Object.keys(moduleUsage).length
    ? Object.keys(moduleUsage).reduce((a, b) => (moduleUsage[a] > moduleUsage[b] ? a : b))
    : 'AI图像:多图模式'

  const stats = {
    totalRecords: records.length,
    totalCreditsUsed: records.reduce((sum, record) => sum + record.credits_used, 0),
    favoriteModule,
    moduleUsage
  }

  const favoriteModuleLabel = formatModuleLabel(stats.favoriteModule)
  const modalParamTokens = selectedRecord ? buildParamTokens(selectedRecord) : []

  const renderParamTokens = (record: GenerationRecord, size: 'md' | 'sm' = 'md') => {
    const tokens = buildParamTokens(record)
    if (!tokens.length) {
      return null
    }
    const baseClass = size === 'md' ? 'text-[11px] px-3 py-1.5' : 'text-[10px] px-2.5 py-1'
    return (
      <div className={`${size === 'md' ? 'mt-3' : 'mt-2'} flex flex-wrap gap-2`}>
        {tokens.map((token) => (
          <span
            key={`${record.id}-${token.key}-${size}`}
            className={`${baseClass} rounded-full border border-white/15 bg-white/10 text-white/80 uppercase tracking-[0.3em]`}
          >
            {token.label} · {token.value}
          </span>
        ))}
      </div>
    )
  }

  const renderMediaPreview = (record: GenerationRecord, variant: 'grid' | 'list') => {
    const videoTask = isVideoTask(record.media_type)
    const hasVideos = Array.isArray(record.output_videos) && record.output_videos.length > 0
    const hasImages = Array.isArray(record.output_images) && record.output_images.length > 0
    const containerBase =
      variant === 'grid'
        ? 'h-48 w-full rounded-2xl'
        : 'h-32 w-48 rounded-2xl'

    if (videoTask && hasVideos) {
      return (
        <div
          className={`${containerBase} overflow-hidden border border-white/10 bg-black/40 cursor-pointer group/video`}
          onClick={() => setSelectedRecord(record)}
        >
          <video src={record.output_videos?.[0]} className="h-full w-full object-cover opacity-80 group-hover/video:opacity-100 transition" muted loop playsInline />
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white/80">
            <Video className="w-6 h-6" />
          </div>
        </div>
      )
    }

    if (!videoTask && hasImages) {
      if (variant === 'grid') {
        const previewImages = record.output_images.slice(0, 4)
        return (
          <div className="grid grid-cols-2 gap-2" onClick={() => setSelectedRecord(record)}>
            {previewImages.map((imageUrl, index) => (
              <div
                key={index}
                className="aspect-square overflow-hidden rounded-2xl border border-white/10 bg-black/30 cursor-pointer"
              >
                <img src={imageUrl} alt={`结果 ${index + 1}`} className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        )
      }

      return (
        <div
          className={`${containerBase} overflow-hidden border border-white/10 bg-black/30 cursor-pointer`}
          onClick={() => setSelectedRecord(record)}
        >
          <img src={record.output_images[0]} alt="生成预览" className="h-full w-full object-cover" />
        </div>
      )
    }

    return (
      <div className={`${containerBase} border border-dashed border-white/15 bg-white/5 flex items-center justify-center text-white/50 text-xs`}>
        暂无预览
      </div>
    )
  }

  const renderGridCard = (record: GenerationRecord) => {
    const puzzleModule = isPuzzleModule(record.module_name)
    const videoTask = isVideoTask(record.media_type)
    const downloadableCount = videoTask
      ? record.output_videos?.length ?? 0
      : record.output_images?.length ?? 0

    return (
      <div
        key={record.id}
        className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.08] via-white/[0.02] to-transparent p-5 backdrop-blur-2xl shadow-[0_25px_55px_rgba(5,6,16,0.6)] transition-all duration-500 hover:-translate-y-1 hover:border-white/30"
      >
        <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-80 transition-opacity duration-500 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.2),_transparent_65%)]" />
        <div className="relative z-10 flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.7em] text-white/50 flex items-center gap-2">
              <Sparkles className="w-3 h-3" />
              {videoTask ? 'VIDEO SUITE' : puzzleModule ? 'COLLAGE LAB' : 'IMAGE LAB'}
            </p>
            <h3 className="mt-2 flex items-center gap-2 text-lg font-semibold">
              {formatModuleLabel(record.module_name)}
              {videoTask && (
                <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] tracking-[0.4em] text-orange-300">
                  VIDEO
                </span>
              )}
            </h3>
            <p className="mt-1 flex items-center gap-1 text-xs text-white/60">
              <Clock className="w-3 h-3" />
              {formatTimestamp(record.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-sm text-emerald-300">
            <Coins className="w-4 h-4" />
            {record.credits_used}
          </div>
        </div>

        <div className="relative z-10 space-y-4">
          {renderMediaPreview(record, 'grid')}

          <div>
            <p className="text-sm text-white/85 line-clamp-3 mb-3">
              {record.prompt_text}
            </p>
            <button
              onClick={() => copyPrompt(record.prompt_text)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs tracking-[0.3em] transition ${
                copiedPrompt === record.prompt_text
                  ? 'border-emerald-400 text-emerald-300 bg-emerald-400/10'
                  : 'border-white/15 text-white/70 hover:border-white/40'
              }`}
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedPrompt === record.prompt_text ? '已复制' : '复制提示词'}
            </button>
            {renderParamTokens(record)}
          </div>

          <div className="flex items-center justify-between border-t border-white/10 pt-4 text-xs text-white/60">
            <div className="flex items-center gap-2">
              <span>
                {record.output_count}
                {videoTask ? ' 段输出' : ' 张输出'}
              </span>
              {record.processing_time && (
                <>
                  <span>•</span>
                  <span>{record.processing_time}s</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => reuseRecord(record)}
                className="rounded-full border border-white/15 p-2 text-white/70 hover:border-white/60"
                title="复用到编辑器"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              {downloadableCount > 0 && (
                <button
                  onClick={() => downloadResults(record)}
                  className="rounded-full border border-white/15 p-2 text-white/70 hover:border-white/60"
                  title="下载结果"
                >
                  <Download className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderListCard = (record: GenerationRecord) => {
    const puzzleModule = isPuzzleModule(record.module_name)
    const videoTask = isVideoTask(record.media_type)
    const downloadableCount = videoTask
      ? record.output_videos?.length ?? 0
      : record.output_images?.length ?? 0

    return (
      <div
        key={record.id}
        className="group relative flex gap-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl shadow-[0_18px_45px_rgba(3,4,12,0.55)] transition hover:-translate-y-0.5"
      >
        <div className="relative">
          {renderMediaPreview(record, 'list')}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.4em] text-white/50">
                {videoTask ? 'VIDEO' : puzzleModule ? 'PUZZLE' : 'MULTI'}
              </p>
              <h3 className="text-base font-semibold flex items-center gap-2">
                {formatModuleLabel(record.module_name)}
              </h3>
              <p className="text-xs text-white/60 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTimestamp(record.created_at)}
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-emerald-300">
              <Coins className="w-4 h-4" />
              {record.credits_used}
            </div>
          </div>

          <p className="mt-3 text-sm text-white/80 line-clamp-2">
            {record.prompt_text}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={() => copyPrompt(record.prompt_text)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] tracking-[0.3em] transition ${
                copiedPrompt === record.prompt_text
                  ? 'border-emerald-400 text-emerald-300 bg-emerald-400/10'
                  : 'border-white/15 text-white/70 hover:border-white/40'
              }`}
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedPrompt === record.prompt_text ? '已复制' : '复制提示词'}
            </button>
            {renderParamTokens(record, 'sm')}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-white/60">
            <div className="flex items-center gap-2">
              <span>
                {record.output_count}
                {videoTask ? ' 段输出' : ' 张输出'}
              </span>
              {record.processing_time && (
                <>
                  <span>•</span>
                  <span>{record.processing_time}s</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => reuseRecord(record)}
                className="rounded-full border border-white/15 p-2 text-white/70 hover:border-white/60"
                title="复用到编辑器"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              {downloadableCount > 0 && (
                <button
                  onClick={() => downloadResults(record)}
                  className="rounded-full border border-white/15 p-2 text-white/70 hover:border-white/60"
                  title="下载结果"
                >
                  <Download className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderEmptyState = () => (
    <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.04] p-12 text-center backdrop-blur-2xl">
      <History className="mx-auto mb-4 h-12 w-12 text-white/40" />
      <h3 className="text-2xl font-semibold mb-2">{searchQuery || moduleFilter !== 'all' ? '没有匹配的记录' : '还没有生成记录'}</h3>
      <p className="text-white/60 mb-6">
        {searchQuery || moduleFilter !== 'all'
          ? '请尝试调宽筛选条件，或清空搜索关键字'
          : '将灵感交给 AI，生成的每一次灵光都将被妥善存档'}
      </p>
      {!searchQuery && moduleFilter === 'all' && (
        <Link to="/editor" className="inline-flex items-center gap-2 rounded-full bg-white text-black px-6 py-3 text-sm font-semibold">
          立即创作
        </Link>
      )}
    </div>
  )

  const renderLoadingState = () => (
    <div className="relative min-h-screen bg-[#040711] text-white">
      <NavBar />
      <main className="relative z-10 px-4 md:px-10 lg:px-16 py-12">
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, index) => (
            <div key={index} className="rounded-3xl border border-white/5 bg-white/[0.03] p-6 animate-pulse">
              <div className="mb-4 h-4 w-24 rounded-full bg-white/10" />
              <div className="mb-3 h-6 w-40 rounded-full bg-white/10" />
              <div className="h-32 rounded-2xl bg-white/5" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )

  if (loading) {
    return renderLoadingState()
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020512] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(76,110,245,0.2),_transparent_55%)]" />
        <div className="absolute -right-10 bottom-[-35%] h-[60%] w-[60%] rounded-full bg-gradient-to-l from-[#14b8a6]/30 via-transparent to-transparent blur-[140px]" />
      </div>

      <NavBar />

      <main className="relative z-10 px-4 py-10 md:px-10 lg:px-16 lg:py-14">
        <div className="mx-auto max-w-[1320px] space-y-6">
          <section className="rounded-[40px] border border-white/10 bg-white/[0.05] p-6 lg:p-8 shadow-[0_30px_80px_rgba(3,6,20,0.65)] backdrop-blur-3xl">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.7em] text-white/50 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  ARCHIVE STREAM
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <History className="h-8 w-8 text-emerald-300" />
                  <h1 className="text-3xl font-semibold lg:text-4xl">AI 生成历史记录</h1>
                </div>
                <p className="mt-3 max-w-2xl text-sm text-white/70">
                  科技感毛玻璃界面，聚合您的多模态创作。以宫格/列表两种视角快速回溯灵感，随时复用提示词或下载素材。
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-center md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-4">
                  <p className="text-xs uppercase tracking-[0.4em] text-white/50">记录</p>
                  <p className="text-3xl font-bold text-white">{stats.totalRecords}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-4">
                  <p className="text-xs uppercase tracking-[0.4em] text-white/50">累计积分</p>
                  <p className="text-3xl font-bold text-amber-300">{stats.totalCreditsUsed}</p>
                </div>
                <div className="col-span-2 rounded-2xl border border-white/10 bg-white/[0.08] p-4 md:col-span-1">
                  <p className="text-xs uppercase tracking-[0.4em] text-white/50">偏好模块</p>
                  <p className="text-lg font-semibold text-sky-300">{favoriteModuleLabel}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-2xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索提示词或关键字"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 pl-11 pr-4 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                  <Filter className="w-4 h-4 text-white/50" />
                  <select
                    value={moduleFilter}
                    onChange={(e) => setModuleFilter(e.target.value as ModuleFilter)}
                    className="bg-transparent text-sm text-white focus:outline-none"
                  >
                    {MODULE_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value} className="bg-[#020512]">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                  <Clock className="w-4 h-4 text-white/50" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'date' | 'credits')}
                    className="bg-transparent text-sm text-white focus:outline-none"
                  >
                    <option value="date" className="bg-[#020512]">
                      按时间排序
                    </option>
                    <option value="credits" className="bg-[#020512]">
                      按积分排序
                    </option>
                  </select>
                </div>

                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                      viewMode === 'grid'
                        ? 'bg-white text-black'
                        : 'text-white/50 hover:text-white'
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                      viewMode === 'list'
                        ? 'bg-white text-black'
                        : 'text-white/50 hover:text-white'
                    }`}
                  >
                    <ListIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section>
            {filteredRecords.length === 0 && renderEmptyState()}
            {filteredRecords.length > 0 && viewMode === 'grid' && (
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {filteredRecords.map((record) => renderGridCard(record))}
              </div>
            )}
            {filteredRecords.length > 0 && viewMode === 'list' && (
              <div className="space-y-4">
                {filteredRecords.map((record) => renderListCard(record))}
              </div>
            )}
          </section>
        </div>
      </main>

      {selectedRecord && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur" onClick={() => setSelectedRecord(null)} />
          <div className="relative z-[10000] w-full max-w-4xl max-h-[85vh] overflow-y-auto rounded-[32px] border border-white/10 bg-[#060912]/95 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.7)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.6em] text-white/50">
                  DETAIL VIEW
                </p>
                <h3 className="mt-2 flex items-center gap-2 text-2xl font-semibold">
                  {selectedRecord ? formatModuleLabel(selectedRecord.module_name) : ''}
                  {selectedRecord && isVideoTask(selectedRecord.media_type) && (
                    <span className="rounded-full border border-white/20 px-3 py-0.5 text-[10px] tracking-[0.4em] text-orange-300">
                      VIDEO
                    </span>
                  )}
                </h3>
                <p className="text-sm text-white/60 mt-1">
                  {selectedRecord ? formatTimestamp(selectedRecord.created_at) : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadResults(selectedRecord)}
                  className="rounded-full border border-white/20 px-4 py-2 text-sm text-white hover:border-white/50"
                >
                  <Download className="w-4 h-4 mr-1 inline" />
                  全部下载
                </button>
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="rounded-full border border-white/20 p-2 text-white/70 hover:border-white/50"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <h4 className="text-sm font-semibold text-white/70 uppercase tracking-[0.4em] mb-2">提示词</h4>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/85">
                  {selectedRecord.prompt_text}
                </div>
              </div>

              {modalParamTokens.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-white/70 uppercase tracking-[0.4em] mb-2">生成参数</h4>
                  <div className="flex flex-wrap gap-2">
                    {modalParamTokens.map((token) => (
                      <span
                        key={`modal-${token.key}`}
                        className="text-[11px] uppercase tracking-[0.3em] rounded-full border border-white/15 bg-white/10 px-3 py-1 text-white/80"
                      >
                        {token.label} · {token.value}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {selectedRecord && isVideoTask(selectedRecord.media_type)
                  ? (selectedRecord.output_videos && selectedRecord.output_videos.length > 0
                    ? selectedRecord.output_videos.map((videoUrl, index) => (
                        <div key={index} className="relative rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
                          <video src={videoUrl} controls className="w-full h-64 object-cover" />
                          <button
                            onClick={() => {
                              const link = document.createElement('a')
                              link.href = videoUrl
                              link.download = `result-${selectedRecord.id}-${index + 1}.mp4`
                              link.click()
                            }}
                            className="absolute top-3 right-3 rounded-full border border-white/20 bg-black/60 p-2 text-white/80 hover:border-white/50"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    : <p className="col-span-full text-sm text-white/60">暂无视频输出</p>)
                  : (selectedRecord?.output_images && selectedRecord.output_images.length > 0
                    ? selectedRecord.output_images.map((imageUrl, index) => (
                        <div key={index} className="relative rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
                          <img src={imageUrl} alt={`结果 ${index + 1}`} className="w-full h-64 object-contain bg-black/30" />
                          <button
                            onClick={() => {
                              const link = document.createElement('a')
                              link.href = imageUrl
                              link.download = `result-${selectedRecord?.id}-${index + 1}.png`
                              link.click()
                            }}
                            className="absolute top-3 right-3 rounded-full border border-white/20 bg-black/60 p-2 text-white/80 hover:border-white/50"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    : <p className="col-span-full text-sm text-white/60">暂无图像输出</p>)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
