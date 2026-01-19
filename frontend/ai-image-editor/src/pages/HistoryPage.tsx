import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  format,
  parseISO,
  subDays,
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useAuth } from '../contexts/AuthContext'
import { useApi } from '../contexts/ApiContext'
import NavBar from '../components/NavBar'
import {
  History,
  Download,
  RotateCcw,
  Copy,
  Search,
  Filter,
  Clock,
  Coins,
  Video,
  LayoutGrid,
  List as ListIcon,
  Sparkles,
  ArrowRightLeft,
  Calendar,
  ChevronDown,
  X
} from 'lucide-react'
import { GenerationRecord, GenerationModuleName } from '../types'

type ModuleFilter =
  | 'all'
  | 'AI图像:多图模式'
  | 'AI图像:拼图模式-自定义画布'
  | 'AI图像:拼图模式-图像拼接'

type HistoryMeta = {
  availableDates: string[]
  hasMore: boolean
  nextOffset: number | null
  total: number
}

type DateRangeState = {
  from?: Date | null
  to?: Date | null
} | undefined

type DatePresetKey = 'all' | 'week' | 'month' | 'threeMonths'
type DatePresetState = DatePresetKey | 'custom'

const createRelativeRange = (days: number): DateRangeState => {
  const endDate = new Date()
  const normalizedEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
  const startDate = subDays(normalizedEnd, days - 1)
  return {
    from: startDate,
    to: normalizedEnd
  }
}

const DATE_PRESETS: Array<{ key: DatePresetKey; label: string; resolve: () => DateRangeState }> = [
  {
    key: 'all',
    label: '全部',
    resolve: () => undefined
  },
  {
    key: 'week',
    label: '最近一周',
    resolve: () => createRelativeRange(7)
  },
  {
    key: 'month',
    label: '最近一个月',
    resolve: () => createRelativeRange(30)
  },
  {
    key: 'threeMonths',
    label: '最近三个月',
    resolve: () => createRelativeRange(90)
  }
]

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

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

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

const PAGE_SIZE = 18

const formatModuleLabel = (moduleName: string) => moduleName.replace('AI图像:', '')
const isPuzzleModule = (moduleName: string) => moduleName.includes('拼图')
const isVideoTask = (mediaType: string) => mediaType === 'video'
const formatTimestamp = (value: string) => {
  try {
    return format(new Date(value), 'yyyy/MM/dd HH:mm:ss')
  } catch (error) {
    return value
  }
}
const formatDateHeading = (value: string) => {
  try {
    return format(parseISO(value), 'yyyy年M月d日 EEEE', { locale: zhCN })
  } catch (error) {
    return value
  }
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

export default function HistoryPage() {
  const { user } = useAuth()
  const { api } = useApi()
  const [records, setRecords] = useState<GenerationRecord[]>([])
  const [filteredRecords, setFilteredRecords] = useState<GenerationRecord[]>([])
  const [historyMeta, setHistoryMeta] = useState<HistoryMeta>({
    availableDates: [],
    hasMore: false,
    nextOffset: null,
    total: 0
  })
  const [loading, setLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>('all')
  const [selectedRecord, setSelectedRecord] = useState<GenerationRecord | null>(null)
  const [copiedPrompt, setCopiedPrompt] = useState('')
  const [dateRange, setDateRange] = useState<DateRangeState>()
  const [activeDateField, setActiveDateField] = useState<'from' | 'to'>('from')
  const [activePreset, setActivePreset] = useState<DatePresetState>('all')
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false)
  const [isCalendarVisible, setIsCalendarVisible] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null)
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const todayStart = useMemo<Date>(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }, [])
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const dateButtonRef = useRef<HTMLButtonElement | null>(null)
  const dateMenuRef = useRef<HTMLDivElement | null>(null)

  const buildDateParams = useCallback((range?: DateRangeState) => {
    if (!range?.from && !range?.to) {
      return {}
    }
    const params: Record<string, string> = {}
    if (range?.from) {
      params.startDate = format(range.from, 'yyyy-MM-dd')
    }
    if (range?.to) {
      params.endDate = format(range.to, 'yyyy-MM-dd')
    }
    return params
  }, [])

  const fetchHistory = useCallback(
    async ({ offset, reset, range }: { offset: number; reset: boolean; range?: DateRangeState }) => {
      if (!user) return null
      const params = {
        limit: PAGE_SIZE,
        offset,
        ...buildDateParams(range)
      }
      const response = await api.getHistory(user.code, params)

      setHistoryMeta({
        availableDates: response.availableDates,
        hasMore: response.hasMore,
        nextOffset: response.hasMore ? response.nextOffset ?? offset + response.records.length : null,
        total: response.total
      })

      setRecords((prev) => {
        const merged = reset ? response.records : [...prev, ...response.records]
        const uniqueMap = new Map<number, GenerationRecord>()
        merged.forEach((item) => uniqueMap.set(item.id, item))
        return Array.from(uniqueMap.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      })

      return response
    },
    [api, buildDateParams, user]
  )

  useEffect(() => {
    if (!user) {
      return
    }
    let mounted = true
    const loadHistory = async () => {
      setLoading(true)
      try {
        await fetchHistory({ offset: 0, reset: true, range: dateRange })
        if (mounted) {
          setLoading(false)
        }
      } catch (error) {
        console.error('Failed to load history:', error)
        if (mounted) {
          setLoading(false)
        }
      }
    }
    loadHistory()
    return () => {
      mounted = false
    }
  }, [user, fetchHistory, dateRange])

  useEffect(() => {
    let filtered = [...records]

    if (moduleFilter !== 'all') {
      filtered = filtered.filter((record) => record.module_name === moduleFilter)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase()
      filtered = filtered.filter((record) => record.prompt_text.toLowerCase().includes(query))
    }

    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    setFilteredRecords(filtered)
  }, [records, searchQuery, moduleFilter])

  useEffect(() => {
    if (!isDateMenuOpen) {
      setDropdownPosition(null)
      return
    }

    const updatePosition = () => {
      if (!dateButtonRef.current) {
        return
      }
      const rect = dateButtonRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + 12,
        left: rect.left,
        width: rect.width,
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isDateMenuOpen])

  useEffect(() => {
    if (!isDateMenuOpen) {
      return
    }
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (dateButtonRef.current?.contains(target) || dateMenuRef.current?.contains(target)) {
        return
      }
      setIsDateMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isDateMenuOpen])

  useEffect(() => {
    if (!isDateMenuOpen) {
      return
    }
    const anchor = dateRange?.to ?? dateRange?.from
    if (!anchor) {
      return
    }
    const anchorMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    if (
      calendarMonth.getFullYear() === anchorMonth.getFullYear() &&
      calendarMonth.getMonth() === anchorMonth.getMonth()
    ) {
      return
    }
    setCalendarMonth(anchorMonth)
  }, [isDateMenuOpen, dateRange, calendarMonth])

  useEffect(() => {
    if (dateRange?.from || dateRange?.to || !historyMeta.availableDates.length) {
      return
    }
    const sorted = [...historyMeta.availableDates].sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime()
    )
    const candidate = sorted[0]
    if (!candidate) {
      return
    }
    const parsed = new Date(candidate)
    if (Number.isNaN(parsed.getTime())) {
      return
    }
    const monthStart = new Date(parsed.getFullYear(), parsed.getMonth(), 1)
    if (
      calendarMonth.getFullYear() === monthStart.getFullYear() &&
      calendarMonth.getMonth() === monthStart.getMonth()
    ) {
      return
    }
    setCalendarMonth(monthStart)
  }, [historyMeta.availableDates, dateRange, calendarMonth])

  useEffect(() => {
    if (!isDateMenuOpen) {
      return
    }
    if (!dateRange?.from) {
      setActiveDateField('from')
      return
    }
    if (!dateRange?.to) {
      setActiveDateField('to')
      return
    }
    setActiveDateField('from')
  }, [isDateMenuOpen, dateRange])

  useEffect(() => {
    if (!isDateMenuOpen) {
      setIsCalendarVisible(false)
    }
  }, [isDateMenuOpen])


  const groupedRecords = useMemo(() => {
    const groups = filteredRecords.reduce((acc, record) => {
      const key = record.created_at.split('T')[0]
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(record)
      return acc
    }, {} as Record<string, GenerationRecord[]>)
    return Object.entries(groups).sort(
      (a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime()
    )
  }, [filteredRecords])

  const availableDateSet = useMemo(() => {
    const set = new Set<string>()
    historyMeta.availableDates.forEach((dateString) => {
      if (!dateString) {
        return
      }
      try {
        const normalized = format(new Date(dateString), 'yyyy-MM-dd')
        set.add(normalized)
      } catch (error) {
        console.warn('Invalid history date entry:', dateString, error)
      }
    })
    return set
  }, [historyMeta.availableDates])

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 0 })
    const end = endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 0 })
    const days: Date[] = []
    let cursor = start
    while (cursor <= end) {
      days.push(cursor)
      cursor = addDays(cursor, 1)
    }
    return days
  }, [calendarMonth])

  const isDaySelectable = useCallback(
    (day: Date) => {
      if (isAfter(day, todayStart)) {
        return false
      }
      if (availableDateSet.size === 0) {
        return true
      }
      const key = format(day, 'yyyy-MM-dd')
      return availableDateSet.has(key)
    },
    [availableDateSet, todayStart]
  )

  const handleDaySelect = useCallback(
    (day: Date) => {
      if (!isDaySelectable(day)) {
        return
      }
      setActivePreset('custom')
      setDateRange((prev) => {
        const draft: { from?: Date | null; to?: Date | null } = { ...(prev ?? {}) }
        if (activeDateField === 'from') {
          draft.from = day
          if (draft.to && draft.to < day) {
            draft.to = day
          }
        } else {
          draft.to = day
          if (draft.from && draft.from > day) {
            draft.from = day
          }
        }
        return draft
      })
      setIsCalendarVisible(false)
    },
    [activeDateField, isDaySelectable, setIsCalendarVisible]
  )

  const handleDateFieldClick = useCallback(
    (field: 'from' | 'to') => {
      setActiveDateField(field)
      setIsCalendarVisible(true)
      const anchor = field === 'from' ? dateRange?.from : dateRange?.to
      const target = anchor ?? todayStart
      setCalendarMonth(new Date(target.getFullYear(), target.getMonth(), 1))
    },
    [dateRange, todayStart]
  )

  const handleFieldClear = useCallback(
    (field: 'from' | 'to') => {
      setDateRange((prev) => {
        if (!prev) {
          setActivePreset('all')
          setIsCalendarVisible(false)
          setActiveDateField('from')
          return undefined
        }
        const next: { from?: Date | null; to?: Date | null } = { ...prev }
        delete next[field]
        const hasValue = Boolean(next.from || next.to)
        setActivePreset(hasValue ? 'custom' : 'all')
        if (!hasValue) {
          setIsCalendarVisible(false)
          setActiveDateField('from')
          return undefined
        }
        setActiveDateField(field)
        return next
      })
    },
    [setActivePreset, setIsCalendarVisible, setActiveDateField]
  )

  const focusTodayMonth = useCallback(() => {
    setCalendarMonth(new Date(todayStart.getFullYear(), todayStart.getMonth(), 1))
  }, [todayStart])

  const handleClearRange = useCallback(() => {
    setDateRange(undefined)
    setActivePreset('all')
    setActiveDateField('from')
    setIsCalendarVisible(false)
    focusTodayMonth()
  }, [focusTodayMonth, setActivePreset, setActiveDateField, setIsCalendarVisible])

  const handlePresetSelect = useCallback(
    (presetKey: DatePresetKey) => {
      const preset = DATE_PRESETS.find((item) => item.key === presetKey)
      if (!preset) {
        return
      }
      const resolvedRange = preset.resolve()
      setDateRange(resolvedRange)
      setActivePreset(presetKey)
      setIsCalendarVisible(false)
      const anchor = resolvedRange?.to ?? resolvedRange?.from
      if (anchor) {
        setCalendarMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1))
      } else {
        focusTodayMonth()
      }
    },
    [focusTodayMonth, setActivePreset, setIsCalendarVisible]
  )

  const shiftCalendarMonth = useCallback((delta: number) => {
    setCalendarMonth((prev) => {
      const next = addMonths(prev, delta)
      return new Date(next.getFullYear(), next.getMonth(), 1)
    })
  }, [])

  const stats = {
    totalRecords: historyMeta.total || records.length,
    totalCreditsUsed: records.reduce((sum, record) => sum + record.credits_used, 0),
    favoriteModule: (() => {
      const moduleUsage = records.reduce((acc, record) => {
        const key = record.module_name
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      if (!Object.keys(moduleUsage).length) {
        return 'AI图像:多图模式'
      }
      return Object.keys(moduleUsage).reduce((a, b) => (moduleUsage[a] > moduleUsage[b] ? a : b))
    })()
  }

  const favoriteModuleLabel = formatModuleLabel(stats.favoriteModule)
  const modalParamTokens = selectedRecord ? buildParamTokens(selectedRecord) : []
  const hasCustomDateRange = Boolean(dateRange?.from || dateRange?.to)
  const startCompactLabel = dateRange?.from ? format(dateRange.from, 'yy-MM-dd') : '开始日期'
  const endCompactLabel = dateRange?.to ? format(dateRange.to, 'yy-MM-dd') : '结束日期'
  const summaryRangeLabel = hasCustomDateRange
    ? `${startCompactLabel} 至 ${endCompactLabel}`
    : '开始日期 至 结束日期'

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



  const renderListCard = (record: GenerationRecord) => {
    const videoTask = isVideoTask(record.media_type)
    const inputImages = record.input_images ?? []
    const outputImages = record.output_images ?? []
    const outputVideos = record.output_videos ?? []
    const combinedOutputs = [
      ...outputImages.map((url, index) => ({ type: 'image' as const, url, index })),
      ...outputVideos.map((url, index) => ({ type: 'video' as const, url, index }))
    ]
    const hasOutputs = combinedOutputs.length > 0
    const hasInputs = inputImages.length > 0
    const paramTokens = buildParamTokens(record)

    return (
      <div
        key={record.id}
        className="group relative flex flex-col overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.03] shadow-lg backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)]"
      >
        {/* Visual Area: Outputs Only */}
        <div className="relative bg-black/20 p-4 min-h-[160px]">
          {/* Top Right Badges */}
          {videoTask && (
            <div className="absolute right-4 top-4 z-10">
              <span className="rounded bg-orange-500/10 px-2 py-1 text-[10px] font-bold tracking-wider text-orange-300 backdrop-blur-md border border-orange-500/20">
                VIDEO
              </span>
            </div>
          )}

          {hasOutputs ? (
            <div className="flex flex-wrap gap-3">
              {combinedOutputs.map((item, idx) => (
                <div
                  key={`${item.type}-${idx}`}
                  onClick={() => setSelectedRecord(record)}
                  className="group/item relative h-40 w-40 flex-none cursor-zoom-in overflow-hidden rounded-xl border border-white/10 bg-black/40 transition hover:border-white/30 hover:shadow-lg"
                >
                  {item.type === 'video' ? (
                    <video
                      src={item.url}
                      className="h-full w-full object-cover"
                      muted
                      loop
                      playsInline
                      onMouseEnter={(e) => e.currentTarget.play()}
                      onMouseLeave={(e) => e.currentTarget.pause()}
                    />
                  ) : (
                    <img
                      src={item.url}
                      alt="Result"
                      className="h-full w-full object-cover transition duration-500 group-hover/item:scale-105"
                    />
                  )}
                  {/* Hover Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 backdrop-blur-[2px] transition duration-200 group-hover/item:opacity-100">
                    <span className="rounded-full bg-white/10 p-2 text-white backdrop-blur-md">
                      <Search className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40">
              无输出结果
            </div>
          )}
        </div>

        {/* Info Area */}
        <div className="flex flex-col gap-4 p-5 pt-4">
          {/* Prompt Row with Inline References */}
          <div className="flex items-start gap-4">
            {/* Reference Thumbnails (Left) */}
            {hasInputs && (
              <div 
                className="flex-none flex items-center -space-x-3 pt-0.5 cursor-pointer group/refs"
                onClick={() => setSelectedRecord(record)}
                title="点击查看所有参考图"
              >
                {inputImages.slice(0, 3).map((url, idx) => (
                  <div
                    key={`ref-${record.id}-${idx}`}
                    className="relative h-12 w-12 overflow-hidden rounded-xl border-2 border-[#1a1f2e] bg-black/50 shadow-lg transition-transform hover:scale-110 hover:z-10 hover:border-white/30"
                  >
                    <img src={url} alt="Ref" className="h-full w-full object-cover opacity-90" />
                  </div>
                ))}
                {inputImages.length > 3 && (
                  <div className="relative flex h-12 w-12 items-center justify-center rounded-xl border-2 border-[#1a1f2e] bg-[#2a2f3e] shadow-lg transition-transform hover:scale-110 hover:z-10 hover:border-white/30">
                    <span className="text-[10px] font-bold text-white/70">+{inputImages.length - 3}</span>
                  </div>
                )}
              </div>
            )}

            {/* Prompt Text (Right) */}
            <div className="flex-1 min-w-0">
              <div className="group/prompt relative">
                <p className="line-clamp-2 text-sm leading-relaxed text-white/85 transition-all group-hover/prompt:line-clamp-none">
                  {record.prompt_text}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    copyPrompt(record.prompt_text)
                  }}
                  className={`absolute -right-2 -top-2 hidden rounded-full border px-2 py-1 text-[10px] backdrop-blur group-hover/prompt:flex items-center gap-1 transition-colors ${
                    copiedPrompt === record.prompt_text
                      ? 'border-emerald-400 bg-emerald-400/10 text-emerald-300'
                      : 'border-white/20 bg-black/60 text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Copy className="h-3 w-3" />
                  {copiedPrompt === record.prompt_text ? '已复制' : '复制'}
                </button>
              </div>
            </div>
          </div>

          {/* Footer: Module, Params, Actions */}
          <div className="flex flex-wrap items-end justify-between gap-4 border-t border-white/5 pt-3">
            <div className="flex flex-col gap-1.5">
               <div className="flex items-center gap-3 text-xs text-white/50">
                  <span className="flex items-center gap-1.5 text-emerald-300/90 font-medium">
                    <Sparkles className="h-3.5 w-3.5" />
                    {formatModuleLabel(record.module_name)}
                  </span>
                  <span className="h-3 w-px bg-white/10"></span>
                  <span className="flex items-center gap-1.5" title="生成时间">
                    <Calendar className="h-3.5 w-3.5 opacity-70" />
                    {formatTimestamp(record.created_at)}
                  </span>
                  {record.processing_time && (
                    <>
                      <span className="h-3 w-px bg-white/10"></span>
                      <span className="flex items-center gap-1.5" title="耗时">
                        <Clock className="h-3.5 w-3.5 opacity-70" />
                        {record.processing_time}s
                      </span>
                    </>
                  )}
                  <span className="h-3 w-px bg-white/10"></span>
                   <span className="flex items-center gap-1.5" title="消耗积分">
                      <Coins className="h-3.5 w-3.5 opacity-70" />
                      {record.credits_used}
                   </span>
               </div>

               {/* Compact Params */}
               {paramTokens.length > 0 && (
                 <div className="flex flex-wrap gap-2 text-[11px] text-white/60">
                    {paramTokens.map((token) => (
                      <span 
                        key={token.key} 
                        className="flex items-center gap-1.5 rounded-md border border-white/5 bg-white/[0.02] px-2 py-1 transition hover:border-white/10 hover:bg-white/5"
                      >
                        <span className="uppercase opacity-50 text-[10px] tracking-wider">{token.label}</span>
                        <span className="font-medium text-white/80">{token.value}</span>
                      </span>
                    ))}
                 </div>
               )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => reuseRecord(record)}
                className="group/btn flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
                title="复用到编辑器"
              >
                <RotateCcw className="h-3.5 w-3.5 transition-transform group-hover/btn:-rotate-180" />
                <span className="hidden sm:inline">复用</span>
              </button>
              {hasOutputs && (
                <button
                  onClick={() => downloadResults(record)}
                  className="group/btn flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
                  title="下载全部"
                >
                  <Download className="h-3.5 w-3.5 transition-transform group-hover/btn:translate-y-0.5" />
                  <span className="hidden sm:inline">下载</span>
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
      <h3 className="text-2xl font-semibold mb-2">
        {searchQuery || moduleFilter !== 'all' || hasCustomDateRange ? '没有匹配的记录' : '还没有生成记录'}
      </h3>
      <p className="text-white/60 mb-6">
        {searchQuery || moduleFilter !== 'all' || hasCustomDateRange
          ? '请尝试调宽筛选条件，或清空日期范围'
          : '将灵感交给 AI，生成的每一次灵光都将被妥善存档'}
      </p>
      {!searchQuery && moduleFilter === 'all' && !hasCustomDateRange && (
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

  const renderDateFilter = () => (
    <div className="relative">
      <button
        ref={dateButtonRef}
        type="button"
        aria-expanded={isDateMenuOpen}
        aria-label={summaryRangeLabel}
        onClick={() => setIsDateMenuOpen((prev) => !prev)}
        className={`flex min-w-[260px] items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
          hasCustomDateRange || isDateMenuOpen
            ? 'border-white/30 bg-white/10 shadow-[0_10px_35px_rgba(15,23,42,0.55)]'
            : 'border-white/10 bg-white/5 hover:border-white/30'
        }`}
      >
        <div className="flex items-center gap-3">
          <Calendar className="h-4 w-4 text-emerald-200" />
          <div className="flex flex-col leading-tight">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <span>{startCompactLabel}</span>
              <span className="text-white/40">至</span>
              <span>{endCompactLabel}</span>
            </div>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-white/60 transition ${isDateMenuOpen ? 'rotate-180' : ''}`} />
      </button>
    </div>
  )

  const renderDateMenuPortal = () => {
    if (!isDateMenuOpen || !dropdownPosition) {
      return null
    }

    const menuStyle: CSSProperties = {
      top: dropdownPosition.top,
      left: dropdownPosition.left,
      width: Math.max(dropdownPosition.width, 420)
    }

    const renderFieldPill = (field: 'from' | 'to', label: string, value: string) => {
      const isActive = activeDateField === field && isCalendarVisible
      const hasValue = field === 'from' ? Boolean(dateRange?.from) : Boolean(dateRange?.to)
      const handleClick = () => {
        handleDateFieldClick(field)
      }
      const handleClearClick = (event: ReactMouseEvent) => {
        event.stopPropagation()
        handleFieldClear(field)
      }
      return (
        <button
          type="button"
          onClick={handleClick}
          className={`flex flex-1 min-w-[160px] items-center gap-3 rounded-2xl border px-4 py-2.5 text-left transition ${
            isActive
              ? 'border-white/70 bg-white/10 text-white shadow-[0_10px_35px_rgba(8,12,27,0.6)]'
              : 'border-white/10 text-white/70 hover:border-white/40'
          }`}
        >
          <div className="leading-tight">
            <p className="text-[10px] uppercase tracking-[0.4em] text-white/40">{label}</p>
            <p className="text-sm font-semibold text-white">{value}</p>
          </div>
          <div className="ml-auto flex items-center gap-1 text-white/60">
            {hasValue && (
              <span
                onClick={handleClearClick}
                className="rounded-full border border-white/20 p-1 text-xs hover:border-white/60"
              >
                <X className="h-3 w-3" />
              </span>
            )}
            <span className="rounded-full border border-white/15 p-1">
              <Calendar className="h-3.5 w-3.5" />
            </span>
          </div>
        </button>
      )
    }

    const renderPresetButton = (preset: (typeof DATE_PRESETS)[number]) => {
      const isActive = activePreset === preset.key
      return (
        <button
          key={preset.key}
          type="button"
          onClick={() => handlePresetSelect(preset.key)}
          className={`flex items-center justify-between rounded-2xl px-4 py-2 text-left transition ${
            isActive
              ? 'bg-white text-black shadow-[0_10px_30px_rgba(255,255,255,0.15)]'
              : 'bg-white/5 text-white/70 hover:text-white'
          }`}
        >
          <span>{preset.label}</span>
          {isActive && <span className="text-xs">✓</span>}
        </button>
      )
    }

    const renderCalendarPanel = () => (
      <div className="rounded-[28px] border border-white/10 bg-[#050915]/95 p-4 shadow-[0_35px_120px_rgba(4,7,17,0.85)] backdrop-blur-2xl">
        <div className="mb-4 flex items-center justify-between text-white/70">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => shiftCalendarMonth(-12)}
              className="rounded-full border border-white/15 px-2 py-1 text-xs transition hover:border-white/50"
            >
              «
            </button>
            <button
              type="button"
              onClick={() => shiftCalendarMonth(-1)}
              className="rounded-full border border-white/15 px-2 py-1 text-base transition hover:border-white/50"
            >
              ‹
            </button>
          </div>
          <div className="text-base font-semibold tracking-[0.3em]">
            {format(calendarMonth, 'yyyy年MM月')}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => shiftCalendarMonth(1)}
              className="rounded-full border border-white/15 px-2 py-1 text-base transition hover:border-white/50"
            >
              ›
            </button>
            <button
              type="button"
              onClick={() => shiftCalendarMonth(12)}
              className="rounded-full border border-white/15 px-2 py-1 text-xs transition hover:border-white/50"
            >
              »
            </button>
          </div>
        </div>

        <div className="mb-2 grid grid-cols-7 text-center text-[11px] uppercase tracking-[0.4em] text-white/40">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day) => {
            const dateKey = format(day, 'yyyy-MM-dd')
            const selectable = isDaySelectable(day)
            const rangeFrom = dateRange?.from ?? null
            const rangeTo = dateRange?.to ?? null
            const isSelectedStart = Boolean(rangeFrom && isSameDay(day, rangeFrom))
            const isSelectedEnd = Boolean(rangeTo && isSameDay(day, rangeTo))
            const isSelected = isSelectedStart || isSelectedEnd
            let isInRange = false
            if (rangeFrom && rangeTo) {
              isInRange = isAfter(day, rangeFrom) && isBefore(day, rangeTo)
            }
            const isCurrentMonth = isSameMonth(day, calendarMonth)
            const isToday = isSameDay(day, todayStart)
            const showRecordIndicator = availableDateSet.size > 0 && availableDateSet.has(dateKey)
            const baseClass = 'relative flex h-11 w-11 items-center justify-center rounded-2xl border text-sm transition-all duration-200'
            const interactionClass = selectable
              ? 'cursor-pointer border-transparent hover:border-white/40 hover:bg-white/10'
              : 'cursor-not-allowed border-white/5'
            const rangeClass = isInRange ? 'bg-white/10' : ''
            const selectionClass = isSelected ? 'bg-white text-black shadow-[0_18px_35px_rgba(15,118,219,0.35)]' : ''
            const todayClass = isToday && !isSelected ? 'border-emerald-400/60' : ''
            const colorClass = (() => {
              if (isSelected) {
                return 'text-black'
              }
              if (!selectable) {
                return 'text-white/25'
              }
              if (!isCurrentMonth) {
                return 'text-white/30'
              }
              if (isInRange) {
                return 'text-white'
              }
              return 'text-white/85'
            })()
            const dayClassName = [
              baseClass,
              interactionClass,
              rangeClass,
              selectionClass,
              todayClass,
              colorClass
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button
                key={dateKey}
                type="button"
                disabled={!selectable}
                onClick={() => handleDaySelect(day)}
                className={dayClassName}
              >
                {format(day, 'd')}
                {showRecordIndicator && !isSelected && (
                  <span className="absolute -bottom-1 h-1.5 w-1.5 rounded-full bg-emerald-300/80" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    )

    return createPortal(
      <div
        ref={dateMenuRef}
        style={menuStyle}
        className="fixed z-[5000] rounded-3xl border border-white/10 bg-[#050815]/95 p-5 text-sm text-white shadow-[0_45px_120px_rgba(4,7,17,0.78)] backdrop-blur-2xl"
      >
        <div className="space-y-4">
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-[0.4em] text-white/40">选择日期</p>
          <div className="flex flex-wrap items-center gap-3">
            {renderFieldPill('from', '开始日期', startCompactLabel)}
            <span className="text-lg font-semibold text-white/50">-</span>
            {renderFieldPill('to', '结束日期', endCompactLabel)}
          </div>
        </div>

        <div className="relative min-h-[360px]">
          <div
            className={`rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition duration-300 ${
              isCalendarVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
          >
            <p className="mb-2 text-[11px] uppercase tracking-[0.4em] text-white/40">快捷筛选</p>
            <div className="flex flex-col gap-2">
              {DATE_PRESETS.map((preset) => renderPresetButton(preset))}
            </div>
          </div>

          {isCalendarVisible && (
            <div className="absolute inset-0 z-40">
              {renderCalendarPanel()}
            </div>
          )}
        </div>

        {!isCalendarVisible && (
          <p className="text-center text-xs text-white/40">点击开始或结束日期以展开日历</p>
        )}


          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/50">
            <span>白色为可选日期，灰色不可选/未来日期</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={focusTodayMonth}
                className="rounded-full border border-white/15 px-3 py-1 transition hover:border-white/50"
              >
                回到本月
              </button>
              <button
                type="button"
                onClick={handleClearRange}
                className="rounded-full border border-white/15 px-3 py-1 transition hover:border-white/50"
              >
                清空
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    )
  }

  const handleLoadMore = useCallback(() => {
    if (!historyMeta.hasMore || isLoadingMore || loading) {
      return
    }
    setIsLoadingMore(true)
    fetchHistory({
      offset: historyMeta.nextOffset ?? records.length,
      reset: false,
      range: dateRange
    })
      .catch((error) => console.error('Load more history failed:', error))
      .finally(() => {
        setIsLoadingMore(false)
      })
  }, [historyMeta.hasMore, historyMeta.nextOffset, isLoadingMore, loading, fetchHistory, records.length, dateRange])

  useEffect(() => {
    if (!historyMeta.hasMore) {
      return
    }
    const target = loadMoreRef.current
    if (!target) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (entry.isIntersecting) {
          handleLoadMore()
        }
      },
      { rootMargin: '240px' }
    )
    observer.observe(target)
    return () => {
      observer.disconnect()
    }
  }, [historyMeta.hasMore, handleLoadMore])

  if (loading) {
    return renderLoadingState()
  }

  const hasRecords = filteredRecords.length > 0

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
                  科技感毛玻璃界面，聚合您的多模态创作。以批次化列表视角回溯灵感，随时复用提示词或下载素材。
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
                {renderDateFilter()}

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
              </div>
            </div>
          </section>

          <section>
            {!hasRecords && renderEmptyState()}
            {hasRecords && (
              <div className="space-y-8">
                {groupedRecords.map(([dateKey, group]) => (
                  <div key={dateKey} className="space-y-4">
                    <div className="flex items-center gap-3 text-sm text-white/50">
                      <div className="h-px flex-1 bg-white/10" />
                      <span className="text-xs uppercase tracking-[0.5em] text-white/60">
                        {formatDateHeading(dateKey)}
                      </span>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>
                    <div className="space-y-4">
                      {group.map((record) => renderListCard(record))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div ref={loadMoreRef} className="h-12" />
            {isLoadingMore && (
              <div className="mt-4 flex items-center justify-center text-sm text-white/60">
                正在加载更多记录...
              </div>
            )}
          </section>
        </div>
      </main>

      {renderDateMenuPortal()}

      {selectedRecord && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur" onClick={() => setSelectedRecord(null)} />
          <div className="relative z-[10000] w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-[32px] border border-white/10 bg-[#060912]/95 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.7)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.6em] text-white/50">
                  DETAIL VIEW
                </p>
                <h3 className="mt-2 flex items-center gap-2 text-2xl font-semibold">
                  {formatModuleLabel(selectedRecord.module_name)}
                  {isVideoTask(selectedRecord.media_type) && (
                    <span className="rounded-full border border-white/20 px-3 py-0.5 text-[10px] tracking-[0.4em] text-orange-300">
                      VIDEO
                    </span>
                  )}
                </h3>
                <p className="text-sm text-white/60 mt-1">{formatTimestamp(selectedRecord.created_at)}</p>
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
                  <X className="w-5 h-5" />
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

              <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.02] p-4">
                  <p className="text-xs uppercase tracking-[0.5em] text-white/50">原始输入</p>
                  {selectedRecord.input_images && selectedRecord.input_images.length > 0 ? (
                    <div className="grid gap-3">
                      {selectedRecord.input_images.map((url, index) => (
                        <div key={index} className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                          <img src={url} alt={`输入 ${index + 1}`} className="w-full h-48 object-contain bg-black/10" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-white/70">
                      无输入图片，直接由提示词生成。
                    </div>
                  )}
                </div>

                <div className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.02] p-4">
                  <p className="text-xs uppercase tracking-[0.5em] text-white/50">生成效果</p>
                  {isVideoTask(selectedRecord.media_type)
                    ? selectedRecord.output_videos && selectedRecord.output_videos.length > 0
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
                      : <p className="text-sm text-white/60">暂无视频输出</p>
                    : selectedRecord.output_images && selectedRecord.output_images.length > 0
                      ? selectedRecord.output_images.map((imageUrl, index) => (
                          <div key={index} className="relative rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
                            <img src={imageUrl} alt={`结果 ${index + 1}`} className="w-full h-64 object-contain bg-black/30" />
                            <button
                              onClick={() => {
                                const link = document.createElement('a')
                                link.href = imageUrl
                                link.download = `result-${selectedRecord.id}-${index + 1}.png`
                                link.click()
                              }}
                              className="absolute top-3 right-3 rounded-full border border-white/20 bg-black/60 p-2 text-white/80 hover:border-white/50"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        ))
                      : <p className="text-sm text-white/60">暂无图像输出</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
