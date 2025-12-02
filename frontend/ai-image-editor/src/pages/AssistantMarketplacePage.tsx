import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  Sparkles,
  Layers,
  Filter,
  Image as ImageIcon,
  Video as VideoIcon,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  ArrowUpRight,
  X,
  Clock,
  User2,
  Globe,
  Lock,
  Copy,
  Plus,
  Edit3,
  Eye,
  EyeOff,
  Loader2,
  UploadCloud
} from 'lucide-react'
import NavBar from '../components/NavBar'
import { useApi } from '../contexts/ApiContext'
import { useAuth } from '../contexts/AuthContext'
import {
  AssistantPaginatedSection,
  AssistantProfile,
  AssistantType,
  AssistantUpsertPayload,
  AssistantVisibility,
  AssistantVisibilityFilter,
  AssistantCategorySummary,
  AssistantModelDefinition,
  AssistantCoverUploadResult
} from '../types'
import { getDefaultModelOptions } from '../services/modelCapabilities'
import { resolveCoverUrl, isAbsoluteUrl } from '../config/storage'

const PAGE_SIZE = 20
type CoverTypeValue = 'image' | 'video' | 'gif'

const COVER_TYPE_META: Record<CoverTypeValue, { label: string; description: string; Icon: typeof ImageIcon }> = {
  image: {
    label: '图像',
    description: '静态封面与通用图像能力',
    Icon: ImageIcon
  },
  video: {
    label: '视频',
    description: '视频脚本与动效输出能力',
    Icon: VideoIcon
  },
  gif: {
    label: '动图',
    description: '动图与循环动效封面',
    Icon: ImageIcon
  }
}

const normalizeCoverType = (value?: string | null): CoverTypeValue => {
  if (value === 'video') {
    return 'video'
  }
  if (value === 'gif') {
    return 'gif'
  }
  return 'image'
}

const deriveSupportFlags = (coverType: CoverTypeValue) => ({
  supportsImage: coverType !== 'video',
  supportsVideo: coverType === 'video'
})

type MediaFilterValue = 'all' | CoverTypeValue

const MEDIA_FILTER_OPTIONS: Array<{ label: string; value: MediaFilterValue }> = [
  { label: '全部媒介', value: 'all' },
  { label: '仅图像', value: 'image' },
  { label: '仅视频', value: 'video' }
]

type CategoryUsageMapByLibrary = Record<AssistantType, Map<number, number>>
type CategoriesByLibrary = Record<AssistantType, AssistantCategorySummary[]>
type CategoryFilterOption = {
  id: number | null
  label: string
}
const DEFAULT_CATEGORY_LABEL = '全部'
const createCategoryFilterOption = (): CategoryFilterOption => ({
  id: null,
  label: DEFAULT_CATEGORY_LABEL
})
const LIBRARY_META: Record<AssistantType, { label: string; badge: string; description: string }> = {
  official: {
    label: '官方旗舰库',
    badge: 'OFFICIAL',
    description: '由平台精调的旗舰助手，覆盖多模态创作场景'
  },
  custom: {
    label: '创作者自定义库',
    badge: 'CUSTOM',
    description: '绑定验证码后专属的创作助手，支持自定义分类'
  }
}

const CUSTOM_VISIBILITY_OPTIONS: { label: string; value: AssistantVisibilityFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '公开', value: 'public' },
  { label: '私有', value: 'private' }
]

const mergeCategorySummaries = (
  primary: AssistantCategorySummary[],
  secondary: AssistantCategorySummary[]
): AssistantCategorySummary[] => {
  const map = new Map<number, AssistantCategorySummary>()
  ;[...(primary || []), ...(secondary || [])].forEach((item) => {
    const existing = map.get(item.id)
    if (!existing) {
      map.set(item.id, item)
      return
    }
    map.set(item.id, {
      ...existing,
      assistantCount: Math.max(existing.assistantCount, item.assistantCount)
    })
  })
  return Array.from(map.values()).sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  )
}

const getEmptyAssistantPayload = (authCode?: string): AssistantUpsertPayload => ({
  authCode: authCode ?? '',
  name: '',
  slug: '',
  definition: '',
  description: '',
  coverUrl: '',
  coverType: 'image',
  categoryIds: [],
  models: [],
  supportsImage: true,
  supportsVideo: false,
  accentColor: '#22d3ee',
  visibility: 'private'
})

const formatDateLabel = (value?: string | number | Date | null) => {
  if (!value) {
    return '未知时间'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '未知时间'
  }
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

export default function AssistantMarketplacePage() {
  const { api } = useApi()
  const { user } = useAuth()
  const [officialSection, setOfficialSection] = useState<AssistantPaginatedSection | null>(null)
  const [customSection, setCustomSection] = useState<AssistantPaginatedSection | null>(null)
  const [availableCategories, setAvailableCategories] = useState<AssistantCategorySummary[]>([])
  const [categoryDictionary, setCategoryDictionary] = useState<AssistantCategorySummary[]>([])
  const [availableModels, setAvailableModels] = useState<AssistantModelDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [categoryByLibrary, setCategoryByLibrary] = useState<Record<AssistantType, CategoryFilterOption>>({
    official: createCategoryFilterOption(),
    custom: createCategoryFilterOption()
  })
  const [activeLibrary, setActiveLibrary] = useState<AssistantType>('official')
  const [officialPage, setOfficialPage] = useState(1)
  const [customPage, setCustomPage] = useState(1)
  const [customVisibility, setCustomVisibility] = useState<AssistantVisibilityFilter>('all')
  const [mediaFilter, setMediaFilter] = useState<MediaFilterValue>('all')
  const [selectedAssistant, setSelectedAssistant] = useState<AssistantProfile | null>(null)
  const [upsertDrawerOpen, setUpsertDrawerOpen] = useState(false)
  const [upsertMode, setUpsertMode] = useState<'create' | 'edit'>('create')
  const [upsertDraft, setUpsertDraft] = useState<AssistantUpsertPayload>(() => getEmptyAssistantPayload(user?.code))
  const [formError, setFormError] = useState<string | null>(null)
  const [savingAssistant, setSavingAssistant] = useState(false)
  const [editingAssistantId, setEditingAssistantId] = useState<number | null>(null)
  const [visibilityUpdatingId, setVisibilityUpdatingId] = useState<number | null>(null)

  const handleAssistantSelect = useCallback((assistant: AssistantProfile) => {
    setSelectedAssistant(assistant)
  }, [])

  const handleAssistantDetailClose = useCallback(() => {
    setSelectedAssistant(null)
  }, [])

  useEffect(() => {
    setUpsertDraft((prev) => ({
      ...prev,
      authCode: user?.code ?? ''
    }))
  }, [user?.code])

  const resetUpsertForm = useCallback(() => {
    setUpsertDraft(getEmptyAssistantPayload(user?.code))
    setEditingAssistantId(null)
    setFormError(null)
  }, [user?.code])

  const handleCreateAssistant = useCallback(() => {
    if (!user?.code) {
      setFormError('请先绑定授权码后再创建私有助手')
      return
    }
    resetUpsertForm()
    setUpsertMode('create')
    setUpsertDrawerOpen(true)
  }, [resetUpsertForm, user?.code])

  const handleEditAssistant = useCallback(
    (assistant: AssistantProfile) => {
      if (!user?.code || assistant.ownerCode !== user.code) {
        setFormError('仅能管理属于自己的助手')
        return
      }
      setUpsertMode('edit')
      setEditingAssistantId(assistant.id)
      const normalizedCoverType = normalizeCoverType(assistant.coverType)
      const supportFlags = deriveSupportFlags(normalizedCoverType)
      setUpsertDraft({
        authCode: user.code,
        name: assistant.name,
        slug: assistant.slug,
        definition: assistant.definition,
        description: assistant.description || '',
        coverUrl: assistant.coverStoragePath ?? assistant.coverUrl,
        coverType: normalizedCoverType,
        categoryIds: assistant.categoryIds,
        models: assistant.models,
        supportsImage: supportFlags.supportsImage,
        supportsVideo: supportFlags.supportsVideo,
        accentColor: assistant.accentColor || '',
        visibility: assistant.visibility as AssistantVisibility
      })
      setUpsertDrawerOpen(true)
      setFormError(null)
    },
    [user?.code]
  )

  const handleFieldChange = useCallback(
    (field: keyof AssistantUpsertPayload, value: string | boolean) => {
      setUpsertDraft((prev) => {
        if (field === 'coverType') {
          const nextCoverType = normalizeCoverType(String(value))
          const supportFlags = deriveSupportFlags(nextCoverType)
          return {
            ...prev,
            coverType: nextCoverType,
            ...supportFlags
          }
        }
        return {
          ...prev,
          [field]: value
        }
      })
    },
    []
  )

  const handleCategoryIdsChange = useCallback((ids: number[]) => {
    setUpsertDraft((prev) => ({
      ...prev,
      categoryIds: ids
    }))
  }, [])

  const handleModelsChange = useCallback((models: string[]) => {
    setUpsertDraft((prev) => ({
      ...prev,
      models
    }))
  }, [])

  const handleCoverUpload = useCallback(
    async (file: File): Promise<AssistantCoverUploadResult> => {
      if (!user?.code) {
        throw new Error('请先绑定授权码后再上传封面')
      }
      return api.uploadAssistantCover(file, user.code)
    },
    [api, user?.code]
  )

  const handleDrawerClose = useCallback(() => {
    setUpsertDrawerOpen(false)
    if (upsertMode === 'create') {
      resetUpsertForm()
    }
    setFormError(null)
  }, [resetUpsertForm, upsertMode])

  const fetchAssistants = useCallback(async () => {
    setLoading(true)
    setError(null)
    const officialCategory = categoryByLibrary.official
    const customCategory = categoryByLibrary.custom
    const coverTypeFilter = mediaFilter === 'all' ? undefined : mediaFilter
    try {
      const [officialResponse, customResponse] = await Promise.all([
        api.getAssistants({
          search,
          category: officialCategory.label,
          categoryId: officialCategory.id ?? undefined,
          officialPage,
          customPage: 1,
          pageSize: PAGE_SIZE,
          authCode: user?.code,
          coverType: coverTypeFilter,
          customVisibility
        }),
        api.getAssistants({
          search,
          category: customCategory.label,
          categoryId: customCategory.id ?? undefined,
          officialPage: 1,
          customPage,
          pageSize: PAGE_SIZE,
          authCode: user?.code,
          coverType: coverTypeFilter,
          customVisibility
        })
      ])

      setOfficialSection(officialResponse.official)
      setCustomSection(customResponse.custom)
      setAvailableCategories(
        mergeCategorySummaries(
          officialResponse.availableCategories ?? [],
          customResponse.availableCategories ?? []
        )
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '助手数据加载失败')
    } finally {
      setLoading(false)
    }
  }, [api, search, categoryByLibrary, officialPage, customPage, customVisibility, mediaFilter, user?.code])

  const handleSubmitAssistant = useCallback(async () => {
    if (!user?.code) {
      setFormError('请先绑定授权码后再保存')
      return
    }

    if (!upsertDraft.name.trim() || !upsertDraft.definition.trim() || !upsertDraft.coverUrl.trim()) {
      setFormError('名称、定义与封面为必填项')
      return
    }

    if (!upsertDraft.categoryIds.length) {
      setFormError('请至少选择一个分类')
      return
    }

    const normalizedVisibility: AssistantVisibility = (upsertDraft.visibility ?? 'private') as AssistantVisibility
    const payload: AssistantUpsertPayload = {
      ...upsertDraft,
      authCode: user.code,
      name: upsertDraft.name.trim(),
      slug: upsertDraft.slug?.trim() || undefined,
      definition: upsertDraft.definition.trim(),
      description: upsertDraft.description?.trim() || undefined,
      coverUrl: upsertDraft.coverUrl.trim(),
      coverType: upsertDraft.coverType ?? 'image',
      models: upsertDraft.models,
      supportsImage: upsertDraft.supportsImage,
      supportsVideo: upsertDraft.supportsVideo,
      accentColor: upsertDraft.accentColor?.trim() || undefined,
      visibility: normalizedVisibility
    }

    setSavingAssistant(true)
    setFormError(null)

    try {
      const result =
        upsertMode === 'create'
          ? await api.createAssistant(payload)
          : await api.updateAssistant(editingAssistantId as number, payload)

      await fetchAssistants()
      setSelectedAssistant((prev) => (prev?.id === result.id ? result : prev))
      setUpsertDrawerOpen(false)
      setEditingAssistantId(null)
      resetUpsertForm()

      if (upsertMode === 'create') {
        setActiveLibrary('custom')
        setCustomVisibility('private')
        setCustomPage(1)
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败，请稍后重试')
    } finally {
      setSavingAssistant(false)
    }
  }, [
    api,
    upsertDraft,
    upsertMode,
    editingAssistantId,
    fetchAssistants,
    resetUpsertForm,
    user?.code,
    setCustomPage
  ])

  const handleVisibilityToggle = useCallback(
    async (assistant: AssistantProfile) => {
      if (!user?.code || assistant.ownerCode !== user.code) {
        setError('仅能调整自己的助手可见性')
        return
      }
      const nextVisibility: AssistantVisibility = assistant.visibility === 'private' ? 'public' : 'private'
      setVisibilityUpdatingId(assistant.id)
      try {
        const updated = await api.updateAssistantVisibility(assistant.id, {
          authCode: user.code,
          visibility: nextVisibility
        })
        setSelectedAssistant((prev) => (prev?.id === updated.id ? updated : prev))
        await fetchAssistants()
      } catch (err) {
        setError(err instanceof Error ? err.message : '可见性更新失败')
      } finally {
        setVisibilityUpdatingId(null)
      }
    },
    [api, fetchAssistants, user?.code]
  )

  const modelOptions = useMemo<AssistantModelDefinition[]>(() => {
    if (availableModels.length) {
      return availableModels
    }
    return getDefaultModelOptions().map((option, index) => ({
      id: index + 1,
      name: option.value,
      alias: option.alias ?? option.value,
      description: option.description,
      logoUrl: option.logoUrl,
      status: 'active'
    }))
  }, [availableModels])

  const modelAliasMap = useMemo(() => {
    return modelOptions.reduce<Record<string, string>>((acc, option) => {
      acc[option.name] = option.alias || option.name
      return acc
    }, {})
  }, [modelOptions])

  useEffect(() => {
    let cancelled = false
    const loadModels = async () => {
      try {
        const models = await api.getAssistantModels()
        if (!cancelled) {
          setAvailableModels(models)
        }
      } catch (err) {
        console.error('模型列表加载失败', err)
      }
    }
    loadModels()
    return () => {
      cancelled = true
    }
  }, [api])

  useEffect(() => {
    let cancelled = false
    const loadCategories = async () => {
      try {
        const categories = await api.getAssistantCategories({ includeEmpty: true })
        if (!cancelled) {
          setCategoryDictionary(categories)
        }
      } catch (err) {
        console.error('分类字典加载失败', err)
      }
    }
    loadCategories()
    return () => {
      cancelled = true
    }
  }, [api])

  useEffect(() => {
    fetchAssistants()
  }, [fetchAssistants])

  const categoryUsageMapByLibrary = useMemo<CategoryUsageMapByLibrary>(() => {
    const buildUsageMap = (section: AssistantPaginatedSection | null) => {
      const usage = new Map<number, number>()
      section?.items.forEach((assistant) => {
        if (!Array.isArray(assistant.categoryIds)) {
          return
        }
        assistant.categoryIds.forEach((id) => {
          if (typeof id !== 'number' || Number.isNaN(id)) {
            return
          }
          usage.set(id, (usage.get(id) ?? 0) + 1)
        })
      })
      return usage
    }

    return {
      official: buildUsageMap(officialSection),
      custom: buildUsageMap(customSection)
    }
  }, [officialSection, customSection])

  const categoriesWithAssistantsByLibrary = useMemo<CategoriesByLibrary>(() => {
    const buildCategoryList = (library: AssistantType) => {
      const usageMap = categoryUsageMapByLibrary[library]
      if (!usageMap.size) {
        return []
      }
      return availableCategories.filter((category) => (usageMap.get(category.id) ?? 0) > 0)
    }

    return {
      official: buildCategoryList('official'),
      custom: buildCategoryList('custom')
    }
  }, [availableCategories, categoryUsageMapByLibrary])

  useEffect(() => {
    const validCategoryIdsByLibrary: Record<AssistantType, Set<number>> = {
      official: new Set(categoriesWithAssistantsByLibrary.official.map((category) => category.id)),
      custom: new Set(categoriesWithAssistantsByLibrary.custom.map((category) => category.id))
    }

    let nextSelection = categoryByLibrary
    let changed = false
    let officialReset = false
    let customReset = false

    ;(['official', 'custom'] as AssistantType[]).forEach((library) => {
      const currentSelection = categoryByLibrary[library]
      if (
        currentSelection.id !== null &&
        !validCategoryIdsByLibrary[library].has(currentSelection.id as number)
      ) {
        if (!changed) {
          nextSelection = { ...categoryByLibrary }
        }
        nextSelection[library] = createCategoryFilterOption()
        changed = true
        if (library === 'official') {
          officialReset = true
        } else {
          customReset = true
        }
      }
    })

    if (changed) {
      setCategoryByLibrary(nextSelection)
    }
    if (officialReset) {
      setOfficialPage(1)
    }
    if (customReset) {
      setCustomPage(1)
    }
  }, [categoriesWithAssistantsByLibrary, categoryByLibrary])

  const activeCategory = categoryByLibrary[activeLibrary]
  const categoriesForActiveLibrary = categoriesWithAssistantsByLibrary[activeLibrary]

  const categoryOptions = useMemo<CategoryFilterOption[]>(() => {
    const base: CategoryFilterOption[] = [createCategoryFilterOption()]
    categoriesForActiveLibrary.forEach((category) => {
      base.push({
        id: category.id,
        label: category.name
      })
    })
    return base
  }, [categoriesForActiveLibrary])

  const handleCategoryChange = (library: AssistantType, option: CategoryFilterOption) => {
    setCategoryByLibrary((prev) => ({
      ...prev,
      [library]: { ...option }
    }))
    if (library === 'official') {
      setOfficialPage(1)
    } else {
      setCustomPage(1)
    }
    setActiveLibrary(library)
  }

  const handleVisibilityChange = (visibility: AssistantVisibilityFilter) => {
    setCustomVisibility(visibility)
    setCustomPage(1)
    setActiveLibrary('custom')
  }

  const handleMediaFilterChange = (value: MediaFilterValue) => {
    setMediaFilter(value)
    setOfficialPage(1)
    setCustomPage(1)
  }

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value)
    setOfficialPage(1)
    setCustomPage(1)
  }

  const activeSection = activeLibrary === 'official' ? officialSection : customSection
  const totalAssistants = (officialSection?.total ?? 0) + (customSection?.total ?? 0)
  const activeCategories = categoryOptions
  const libraryMeta = LIBRARY_META[activeLibrary]
  const activePage = activeLibrary === 'official' ? officialPage : customPage
  const activeModelCount = activeSection ? new Set(activeSection.items.flatMap((item) => item.models)).size : 0
  const activeTotalPages = activeSection
    ? Math.max(1, Math.ceil(activeSection.total / (activeSection.pageSize || PAGE_SIZE)))
    : 1
  const categoryCount = categoriesForActiveLibrary.length
  const insightStats = [
    { label: '分类数量', value: categoryCount, hint: '可选类别' },
    { label: `${libraryMeta.label}总量`, value: activeSection?.total ?? 0, hint: '当前筛选' },
    { label: '当前页码', value: `${activePage} / ${activeTotalPages}`, hint: '分页进度' },
    { label: '模型组合', value: activeModelCount, hint: '活跃模型' }
  ]

  return (
    <div className="min-h-screen bg-cyber-dark">
      <NavBar />
      <main className="relative min-h-screen pl-[130px] md:pl-[150px] px-4 md:px-8 lg:px-12 py-10 overflow-hidden">
        <div className="fixed inset-0 pointer-events-none">
          <div className="cyber-grid-bg opacity-20" />
          <div className="floating-particles" />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl space-y-10">
          <section className="glass-panel relative overflow-hidden p-5 md:p-6 lg:p-7">
            <div className="absolute inset-0 bg-gradient-to-r from-[#0f172a]/75 via-[#0b1b2b]/30 to-transparent" />
            <div className="absolute -right-12 -top-10 h-52 w-52 rounded-full bg-neon-blue/20 blur-3xl" />
            <div className="relative z-10 space-y-4 text-white">
              <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.4em] text-white/60">
                <span className="glass-chip text-[10px]">AGENT SQUARE</span>
                <span className="inline-flex items-center gap-2 text-white/50">
                  <Sparkles className="h-4 w-4 text-neon-blue" />
                  灵感工作台
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-end gap-3">
                  <h1 className="text-3xl md:text-4xl font-semibold">助手广场</h1>
                  <span className="text-neon-blue text-2xl font-medium">{totalAssistants}+</span>
                </div>
                <p className="text-sm text-white/65 max-w-2xl">
                  聚合官方与创作者助手的创意矩阵，直接进入你需要的灵感场。
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="relative flex flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white/80 focus-within:border-neon-blue/60 focus-within:bg-white/10">
                  <Search className="h-5 w-5 text-neon-blue" />
                  <input
                    type="text"
                    value={search}
                    onChange={handleSearchChange}
                    placeholder="搜索助手名称、定义或者描述"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-white/40"
                  />
                </label>
              </div>
              <div className="flex flex-wrap justify-end gap-3">
                {insightStats.map((stat) => (
                  <HighlightStat key={stat.label} label={stat.label} value={stat.value} hint={stat.hint} />
                ))}
              </div>
            </div>
            {error && (
              <div className="mt-6 flex items-center justify-between rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                <span>{error}</span>
                <button type="button" onClick={fetchAssistants} className="text-red-100 hover:text-white">
                  重试
                </button>
              </div>
            )}
          </section>

          <section className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              {(['official', 'custom'] as AssistantType[]).map((libraryKey) => {
                const meta = LIBRARY_META[libraryKey]
                const sectionData = libraryKey === 'official' ? officialSection : customSection
                const isActive = activeLibrary === libraryKey
                const accent =
                  libraryKey === 'official'
                    ? 'from-[#2dd4ff]/40 via-[#0ea5e9]/20 to-transparent'
                    : 'from-[#f472b6]/40 via-[#a855f7]/20 to-transparent'
                return (
                  <button
                    key={libraryKey}
                    type="button"
                    onClick={() => setActiveLibrary(libraryKey)}
                    className={`group relative overflow-hidden rounded-3xl border px-6 py-5 text-left transition-all duration-500 backdrop-blur-2xl ${
                      isActive
                        ? 'border-neon-blue/60 shadow-[0_30px_80px_rgba(14,165,233,0.25)]'
                        : 'border-white/10 hover:border-white/40'
                    }`}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${accent} ${
                      isActive ? 'opacity-80' : 'opacity-40 group-hover:opacity-60'
                    }`} />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.45),transparent_60%)] opacity-0 transition-opacity duration-500 group-hover:opacity-20" />
                    <div className="relative z-10 flex items-center justify-between gap-4 text-white">
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-[0.4em] text-white/70">{meta.badge}</p>
                        <p className="text-lg font-semibold">{meta.label}</p>
                      </div>
                      <div className="flex items-end gap-1 text-white">
                        <span className="text-3xl font-semibold">{sectionData?.total ?? 0}</span>
                        <span className="text-xs text-white/70">助手</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="rounded-[30px] border border-white/10 bg-white/5 px-4 py-5 md:px-6 backdrop-blur-2xl shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
              <div className="flex flex-wrap gap-2">
                {activeCategories.map((option) => {
                  const isSelected = activeCategory.id === option.id
                  return (
                    <button
                      key={`${libraryMeta.label}-${option.id ?? 'all'}`}
                      type="button"
                      onClick={() => handleCategoryChange(activeLibrary, option)}
                      className={`px-4 py-2 rounded-2xl border text-sm font-medium tracking-wide transition-all duration-300 ${
                        isSelected
                          ? 'border-neon-blue/60 bg-neon-blue/20 text-white shadow-[0_10px_30px_rgba(14,165,233,0.25)]'
                          : 'border-white/10 text-white/60 hover:text-white hover:border-white/40'
                      }`}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>

              {activeLibrary === 'custom' && (
                <>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {CUSTOM_VISIBILITY_OPTIONS.map((option) => {
                      const selected = customVisibility === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleVisibilityChange(option.value)}
                          className={`rounded-2xl border px-4 py-2 text-sm transition-all duration-300 ${
                            selected
                              ? 'border-neon-blue/60 bg-neon-blue/15 text-white shadow-[0_10px_30px_rgba(14,165,233,0.3)]'
                              : 'border-white/10 text-white/60 hover:text-white'
                          }`}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>

                </>
              )}
            </div>
          </section>

          <AssistantGallery
            variant={activeLibrary}
            section={activeSection}
            loading={loading}
            modelAliasMap={modelAliasMap}
            currentPage={activePage}
            mediaFilter={mediaFilter}
            onMediaFilterChange={handleMediaFilterChange}
            onPageChange={(page) => {
              if (activeLibrary === 'official') {
                setOfficialPage(page)
              } else {
                setCustomPage(page)
              }
            }}
            onAssistantSelect={handleAssistantSelect}
            onCreateAssistant={activeLibrary === 'custom' ? handleCreateAssistant : undefined}
            canCreateAssistant={activeLibrary === 'custom' ? Boolean(user?.code) : undefined}
          />

          {selectedAssistant && (
            <AssistantDetailPanel
              assistant={selectedAssistant}
              variant={selectedAssistant.type}
              modelAliasMap={modelAliasMap}
              onClose={handleAssistantDetailClose}
              currentUserCode={user?.code}
              onEdit={handleEditAssistant}
              onToggleVisibility={handleVisibilityToggle}
              visibilityPendingId={visibilityUpdatingId}
            />
          )}

          <AssistantUpsertDrawer
            open={upsertDrawerOpen}
            mode={upsertMode}
            draft={upsertDraft}
            categoryOptions={categoryDictionary}
            selectedCategoryIds={upsertDraft.categoryIds}
            modelOptions={modelOptions}
            onCategoriesChange={handleCategoryIdsChange}
            onModelsChange={handleModelsChange}
            onCoverUpload={handleCoverUpload}
            onFieldChange={handleFieldChange}
            onClose={handleDrawerClose}
            onSubmit={handleSubmitAssistant}
            saving={savingAssistant}
            error={formError}
          />
        </div>
      </main>
    </div>
  )
}

interface AssistantGalleryProps {
  variant: AssistantType
  section: AssistantPaginatedSection | null
  loading: boolean
  modelAliasMap: Record<string, string>
  currentPage: number
  mediaFilter: MediaFilterValue
  onMediaFilterChange: (value: MediaFilterValue) => void
  onPageChange: (page: number) => void
  onAssistantSelect?: (assistant: AssistantProfile, variant: AssistantType) => void
  onCreateAssistant?: () => void
  canCreateAssistant?: boolean
}

function AssistantGallery({
  variant,
  section,
  loading,
  modelAliasMap,
  currentPage,
  mediaFilter,
  onMediaFilterChange,
  onPageChange,
  onAssistantSelect,
  onCreateAssistant,
  canCreateAssistant
}: AssistantGalleryProps) {
  const meta = LIBRARY_META[variant]
  const total = section?.total ?? 0
  const pageSize = section?.pageSize ?? PAGE_SIZE
  const items = section?.items ?? []
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const handlePrev = () => onPageChange(Math.max(1, currentPage - 1))
  const handleNext = () => onPageChange(Math.min(totalPages, currentPage + 1))

  return (
    <section className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.4em] text-white/45">{meta.badge}</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-semibold text-white">{meta.label}</h2>
              {variant === 'custom' && onCreateAssistant && (
                <button
                  type="button"
                  onClick={onCreateAssistant}
                  disabled={canCreateAssistant === false}
                  title={canCreateAssistant === false ? '绑定授权码后可新增' : '新增私有助手'}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-white transition ${
                    canCreateAssistant === false
                      ? 'border-white/10 text-white/30'
                      : 'border-neon-blue/50 bg-neon-blue/10 hover:bg-neon-blue/25'
                  }`}
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/60 backdrop-blur-md">
              共 {total} 个
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <MediaFilterDropdown value={mediaFilter} onChange={onMediaFilterChange} />
          <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-white/70 shadow-[0_10px_40px_rgba(15,23,42,0.35)] backdrop-blur-2xl">
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentPage <= 1 || loading}
              className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs transition ${
                currentPage <= 1 || loading
                  ? 'text-white/30'
                  : 'text-white hover:text-neon-blue'
              }`}
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <span className="text-sm font-medium text-white">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={handleNext}
              disabled={currentPage >= totalPages || loading}
              className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs transition ${
                currentPage >= totalPages || loading
                  ? 'text-white/30'
                  : 'text-white hover:text-neon-blue'
              }`}
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {[...Array(8)].map((_, index) => (
            <div key={index} className="h-56 rounded-2xl border border-white/10 bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {items.map((assistant) => (
            <AssistantCard
              key={assistant.id}
              assistant={assistant}
              variant={variant}
              modelAliasMap={modelAliasMap}
              onSelect={() => onAssistantSelect?.(assistant, variant)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-white/15 bg-white/5 p-10 text-center text-white/60">
          暂无符合条件的助手，试试调整搜索或分类。
        </div>
      )}
    </section>
  )
}

interface MediaFilterDropdownProps {
  value: MediaFilterValue
  onChange: (value: MediaFilterValue) => void
}

function MediaFilterDropdown({ value, onChange }: MediaFilterDropdownProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const selectedOption = MEDIA_FILTER_OPTIONS.find((option) => option.value === value)

  useEffect(() => {
    if (!open) {
      return
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:border-neon-blue/60 hover:text-white"
      >
        <Filter className="h-4 w-4 text-white/60" />
        <span>{selectedOption?.label ?? '全部媒介'}</span>
        <ChevronDown
          className={`h-4 w-4 text-white/50 transition ${open ? 'rotate-180 text-neon-blue' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-40 rounded-2xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl">
          <div className="space-y-1">
            {MEDIA_FILTER_OPTIONS.map((option) => {
              const selected = option.value === value
              return (
                <button
                  key={`media-filter-${option.value}`}
                  type="button"
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                    selected ? 'border border-neon-blue/40 bg-neon-blue/20 text-white' : 'text-white/70 hover:bg-white/5'
                  }`}
                >
                  <span>{option.label}</span>
                  {selected && <Check className="h-4 w-4 text-neon-blue" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

interface AssistantCardProps {
  assistant: AssistantProfile
  variant: AssistantType
  modelAliasMap: Record<string, string>
  onSelect?: (assistant: AssistantProfile) => void
}

function AssistantCard({ assistant, variant, modelAliasMap, onSelect }: AssistantCardProps) {
  const handleSelect = () => {
    onSelect?.(assistant)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleSelect()
    }
  }

  const accentGradient =
    variant === 'official'
      ? 'from-[#5ee7df]/15 via-[#b490ca]/10 to-transparent'
      : 'from-[#ff9a9e]/20 via-[#fad0c4]/10 to-transparent'

  const normalizedCoverType = normalizeCoverType(assistant.coverType)
  const coverTypeMeta = COVER_TYPE_META[normalizedCoverType]
  const CoverTypeIcon = coverTypeMeta?.Icon
  const mediums = coverTypeMeta && CoverTypeIcon
    ? ([{ icon: CoverTypeIcon, label: coverTypeMeta.label }] as {
        icon: typeof ImageIcon
        label: string
      }[])
    : []

  const displayModels = assistant.models.slice(0, 3)
  const extraModels = assistant.models.length - displayModels.length
  const categoriesLabel = assistant.categories.length ? assistant.categories.join(' · ') : '未分类'
  const visibilityLabel = assistant.visibility === 'private' ? '私有' : '公开'
  const visibilityBadgeClass =
    assistant.visibility === 'private'
      ? 'border-rose-300/40 text-rose-200'
      : 'border-emerald-300/40 text-emerald-200'
  const descriptionSnippet = assistant.description || assistant.definition

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05] backdrop-blur-2xl transition-all duration-500 hover:-translate-y-1.5 hover:border-neon-blue/40 hover:bg-white/[0.08] hover:shadow-[0_30px_80px_rgba(14,165,233,0.25)] cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
      aria-label={`查看${assistant.name}详情`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${accentGradient}`} />
      {assistant.accentColor && (
        <div
          className="absolute inset-0 opacity-25"
          style={{ background: `radial-gradient(circle at 20% 20%, ${assistant.accentColor}22, transparent 60%)` }}
        />
      )}
      <div className="relative z-10 flex h-full flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3 text-[11px] text-white/65">
          <div className="flex items-center gap-2">
            <span className="glass-chip text-[10px] tracking-[0.3em]">{assistant.type === 'official' ? '官方' : '自定义'}</span>
            {assistant.type === 'custom' && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] ${visibilityBadgeClass}`}>
                {visibilityLabel}
              </span>
            )}
          </div>
          <span className="max-w-[8rem] truncate text-right text-white/50">{categoriesLabel}</span>
        </div>

        <div className="flex gap-3">
          <div className="h-16 w-16 overflow-hidden rounded-2xl border border-white/10 shadow-lg">
            <img
              src={assistant.coverUrl}
              alt={assistant.name}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-white truncate">{assistant.name}</h3>
              {assistant.type === 'official' ? <ShieldCheck className="h-4 w-4 text-neon-blue" /> : null}
            </div>
            <p className="mt-1 text-xs text-white/70 line-clamp-2">{descriptionSnippet}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {mediums.length ? (
            mediums.map((medium) => {
              const MediumIcon = medium.icon
              return (
                <span
                  key={medium.label}
                  className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[11px] text-white/80"
                >
                  <MediumIcon className="h-3.5 w-3.5" />
                  {medium.label}
                </span>
              )
            })
          ) : (
            <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-white/50">未标注媒介</span>
          )}
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">关联模型</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {displayModels.map((model) => (
              <span key={model} className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[11px] text-white/80">
                {modelAliasMap[model] ?? model}
              </span>
            ))}
            {extraModels > 0 && (
              <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/60">+{extraModels}</span>
            )}
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between text-[11px] text-white/65">
          <span className="flex items-center gap-1.5 truncate">
            <Layers className="h-3.5 w-3.5" />
            <span className="truncate">{assistant.primaryCategory ?? '未分类'}</span>
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              handleSelect()
            }}
            className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-0.5 text-[11px] text-neon-blue transition hover:border-neon-blue/60"
          >
            查看详情
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

interface AssistantDetailPanelProps {
  assistant: AssistantProfile
  variant: AssistantType
  modelAliasMap: Record<string, string>
  onClose: () => void
  currentUserCode?: string
  onEdit?: (assistant: AssistantProfile) => void
  onToggleVisibility?: (assistant: AssistantProfile) => void
  visibilityPendingId?: number | null
}

function AssistantDetailPanel({
  assistant,
  variant,
  modelAliasMap,
  onClose,
  currentUserCode,
  onEdit,
  onToggleVisibility,
  visibilityPendingId
}: AssistantDetailPanelProps) {
  const [copiedSlug, setCopiedSlug] = useState(false)

  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  useEffect(() => {
    if (!copiedSlug) {
      return
    }
    const timer = setTimeout(() => setCopiedSlug(false), 2000)
    return () => clearTimeout(timer)
  }, [copiedSlug])

  const handleCopySlug = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return
    }
    try {
      await navigator.clipboard.writeText(assistant.slug)
      setCopiedSlug(true)
    } catch {
      setCopiedSlug(false)
    }
  }

  const accentGlow =
    variant === 'official'
      ? 'from-[#2dd4ff]/40 via-[#0ea5e9]/10 to-transparent'
      : 'from-[#f472b6]/40 via-[#a855f7]/10 to-transparent'

  const haloColor = variant === 'official' ? 'bg-neon-blue/30' : 'bg-fuchsia-300/30'
  const coverTypeMeta = COVER_TYPE_META[normalizeCoverType(assistant.coverType)]
  const CoverTypeIcon = coverTypeMeta?.Icon
  const mediumLabel = coverTypeMeta?.label

  const formattedCreatedAt = formatDateLabel(assistant.createdAt)
  const formattedUpdatedAt = formatDateLabel(assistant.updatedAt)
  const creatorLabel = assistant.ownerDisplayName?.trim() || (assistant.type === 'official' ? '官方平台' : '未定义')
  const maskedCreatorCode = assistant.ownerCodeMasked ?? '已隐藏'
  const visibilityMeta =
    assistant.visibility === 'private'
      ? { label: '私有', className: 'border-rose-300/40 text-rose-200', Icon: Lock }
      : { label: '公开', className: 'border-emerald-300/40 text-emerald-200', Icon: Globe }
  const isOwner = assistant.type === 'custom' && assistant.ownerCode && assistant.ownerCode === currentUserCode
  const visibilityPending = visibilityPendingId === assistant.id

  const fallbackCategories = [assistant.primaryCategory, assistant.secondaryCategory].filter(
    (value): value is string => Boolean(value?.trim())
  )
  const normalizedCategoryNames = (assistant.categories.length ? assistant.categories : fallbackCategories)
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value, index, array) => array.indexOf(value) === index)
  const categoryDisplayNames = normalizedCategoryNames.length ? normalizedCategoryNames : ['未分类']
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-[6px]"
        aria-label="关闭助手详情"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/10 bg-[#070d1b]/95 shadow-[0_40px_140px_rgba(8,15,40,0.65)]">
        <div className="absolute inset-0">
          <div className={`absolute inset-0 bg-gradient-to-br ${accentGlow} opacity-60`} />
          <div className={`absolute -right-10 -top-10 h-48 w-48 blur-3xl ${haloColor}`} />
        </div>

        <div className="relative z-10 p-6 md:p-8 space-y-8 text-white">
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="lg:w-[280px]">
              <div className="relative overflow-hidden rounded-3xl border border-white/10">
                <img src={assistant.coverUrl} alt={assistant.name} className="h-64 w-full object-cover" />
                <div className="absolute inset-x-4 top-4 flex flex-col gap-2">
                  <span className="glass-chip text-[10px] uppercase tracking-[0.35em]">
                    {assistant.type === 'official' ? 'OFFICIAL' : 'CUSTOM'}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] ${visibilityMeta.className}`}>
                    <visibilityMeta.Icon className="h-3.5 w-3.5" />
                    {visibilityMeta.label}
                  </span>
                </div>
              </div>
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.35em] text-white/45">Slug</p>
                  <div className="mt-1 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                    <span className="text-sm text-white/70 truncate">{assistant.slug}</span>
                    <button
                      type="button"
                      onClick={handleCopySlug}
                      className="inline-flex items-center gap-1 rounded-2xl border border-white/10 px-2 py-1 text-[11px] text-white/60 transition hover:border-white/40 hover:text-white"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copiedSlug ? '已复制' : '复制'}
                    </button>
                  </div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4 space-y-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.35em] text-white/45">分类</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {categoryDisplayNames.map((category) => (
                        <span
                          key={category}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75"
                        >
                          {category}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.35em] text-white/45">模型组合</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {assistant.models.length ? (
                        assistant.models.map((model) => (
                          <span
                            key={model}
                            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80"
                          >
                            {modelAliasMap[model] ?? model}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-2xl border border-white/10 px-3 py-1 text-xs text-white/60">
                          未配置模型
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.35em] text-white/45">媒介类型</p>
                    <div className="mt-2">
                      {coverTypeMeta ? (
                        <span className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
                          {CoverTypeIcon && <CoverTypeIcon className="h-4 w-4" />}
                          {coverTypeMeta.label}
                        </span>
                      ) : (
                        <span className="rounded-2xl border border-white/10 px-3 py-1 text-xs text-white/60">
                          暂未标注媒介能力
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-white/55">
                    {assistant.type === 'official' ? '官方旗舰库' : '创作者自定义库'}
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold">{assistant.name}</h2>
                  {assistant.description ? (
                    <p className="mt-3 text-sm text-white/70 leading-relaxed whitespace-pre-wrap break-words break-all max-h-10 overflow-y-auto">
                      {assistant.description}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm text-white/50 leading-relaxed">暂无描述</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-white/10 p-2 text-white/70 transition hover:border-white/40 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4 text-white/80 min-h-[15rem] max-h-[15rem] overflow-auto">
                <p className="text-[11px] uppercase tracking-[0.35em] text-white/45">助手定义</p>
                <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap break-words break-all">
                  {assistant.definition}
                </p>
              </div>

              {isOwner && (
                <div className="flex flex-wrap gap-2 rounded-3xl border border-white/10 bg-white/5 p-3">
                  <button
                    type="button"
                    onClick={() => onEdit?.(assistant)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/15 px-3 py-1.5 text-xs text-white/80 transition hover:border-neon-blue/60 hover:text-white"
                  >
                    <Edit3 className="h-4 w-4 text-neon-blue" />
                    编辑配置
                  </button>
                  <button
                    type="button"
                    disabled={visibilityPending || !onToggleVisibility}
                    onClick={() => onToggleVisibility?.(assistant)}
                    className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-1.5 text-xs transition ${
                      visibilityPending || !onToggleVisibility
                        ? 'border-white/10 text-white/40'
                        : 'border-white/15 text-white/80 hover:border-neon-blue/60 hover:text-white'
                    }`}
                  >
                    {visibilityPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : assistant.visibility === 'private' ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                    {assistant.visibility === 'private' ? '设为公开' : '设为私有'}
                  </button>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-white/75">
                  <p className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-white/50" />
                    最近更新
                  </p>
                  <p className="mt-1 text-lg font-semibold">{formattedUpdatedAt}</p>
                  <p className="text-xs text-white/50">创建于 {formattedCreatedAt}</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-white/75">
                  <p className="flex items-center gap-2 text-sm">
                    <User2 className="h-4 w-4 text-white/50" />
                    创作者
                  </p>
                  <p className="mt-1 text-lg font-semibold">{creatorLabel}</p>
                  {assistant.type === 'custom' && (
                    <p className="text-xs text-white/50">授权码：{maskedCreatorCode}</p>
                  )}
                  <p className="text-xs text-white/50">可见性：{visibilityMeta.label}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3 border-t border-white/10 pt-4">
            <button
              type="button"
              className="rounded-2xl border border-white/10 px-5 py-2 text-sm text-white/70 transition hover:border-white/40 hover:text-white"
              onClick={onClose}
            >
              返回
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-2xl border border-neon-blue/50 bg-neon-blue/20 px-5 py-2 text-sm font-medium text-white shadow-[0_15px_35px_rgba(14,165,233,0.35)] transition hover:bg-neon-blue/30"
            >
              立即启用
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface AssistantUpsertDrawerProps {
  open: boolean
  mode: 'create' | 'edit'
  draft: AssistantUpsertPayload
  categoryOptions: AssistantCategorySummary[]
  selectedCategoryIds: number[]
  modelOptions: AssistantModelDefinition[]
  onCategoriesChange: (ids: number[]) => void
  onModelsChange: (models: string[]) => void
  onCoverUpload: (file: File) => Promise<AssistantCoverUploadResult>
  onFieldChange: (field: keyof AssistantUpsertPayload, value: string | boolean) => void
  onClose: () => void
  onSubmit: () => void
  saving: boolean
  error: string | null
}

function AssistantUpsertDrawer({
  open,
  mode,
  draft,
  categoryOptions,
  selectedCategoryIds,
  modelOptions,
  onCategoriesChange,
  onModelsChange,
  onCoverUpload,
  onFieldChange,
  onClose,
  onSubmit,
  saving,
  error
}: AssistantUpsertDrawerProps) {
  if (!open) {
    return null
  }

  const selectedCategoryNames = useMemo(() => {
    if (!categoryOptions?.length) {
      return []
    }
    return selectedCategoryIds
      .map((id) => categoryOptions.find((category) => category.id === id)?.name)
      .filter((name): name is string => Boolean(name))
  }, [categoryOptions, selectedCategoryIds])

  const [coverUploading, setCoverUploading] = useState(false)
  const [coverUploadError, setCoverUploadError] = useState<string | null>(null)
  const coverInputRef = useRef<HTMLInputElement | null>(null)

  const resolvedCoverUrl = useMemo(() => {
    if (!draft.coverUrl?.trim()) {
      return ''
    }
    return isAbsoluteUrl(draft.coverUrl) ? draft.coverUrl : resolveCoverUrl(draft.coverUrl)
  }, [draft.coverUrl])

  const visibilityOptions: { label: string; value: AssistantVisibility; description: string }[] = [
    { label: '私有', value: 'private', description: '仅创作者本人可见' },
    { label: '公开', value: 'public', description: '展示于助手广场' }
  ]

  const normalizedVisibility = (draft.visibility ?? 'private') as AssistantVisibility
  const coverStoragePath = draft.coverUrl?.trim() ?? ''
  const selectedModelsCount = draft.models.length

  const handleTriggerCoverUpload = () => {
    coverInputRef.current?.click()
  }

  const handleCoverFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setCoverUploadError(null)
    setCoverUploading(true)
    try {
      const result = await onCoverUpload(file)
      onFieldChange('coverUrl', result.fileName)
      setCoverUploadError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : '封面上传失败'
      setCoverUploadError(message)
    } finally {
      setCoverUploading(false)
      event.target.value = ''
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-[6px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-[32px] border border-white/10 bg-[#050b16]/95 p-6 sm:p-8 text-white shadow-[0_40px_140px_rgba(5,10,30,0.7)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-white/55">
              {mode === 'create' ? 'NEW PRIVATE ASSISTANT' : 'EDIT PRIVATE ASSISTANT'}
            </p>
            <h3 className="mt-2 text-2xl font-semibold">
              {mode === 'create' ? '新增私有助手' : `编辑 ${draft.name || '助手'}`}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 p-2 text-white/70 transition hover:border-white/40 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        <div className="mt-6 space-y-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,260px)_1fr]">
            <div className="space-y-3">
              <span className="text-xs uppercase tracking-[0.35em] text-white/45">封面图 *</span>
              <div
                role="button"
                tabIndex={0}
                onClick={handleTriggerCoverUpload}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handleTriggerCoverUpload()
                  }
                }}
                className="group relative flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-3xl border border-dashed border-white/15 bg-white/5 text-center focus:outline-none focus-visible:border-neon-blue/60"
              >
                {resolvedCoverUrl ? (
                  <img
                    src={resolvedCoverUrl}
                    alt="助手封面"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-white/60">
                    <UploadCloud className="h-9 w-9 text-neon-blue" />
                    <p className="text-sm">点击上传助手封面</p>
                    <p className="text-xs text-white/45">支持 jpg/png/webp，建议 1:1</p>
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/20 text-white transition group-hover:bg-slate-950/40">
                  <UploadCloud className="h-7 w-7 text-white" />
                  <span className="text-[11px] tracking-[0.35em] text-white/80">上传封面</span>
                </div>
                {coverUploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70">
                    <Loader2 className="h-8 w-8 animate-spin text-white" />
                  </div>
                )}
              </div>
              <input
                ref={coverInputRef}
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleCoverFileChange}
              />
              {coverUploadError && (
                <p className="text-xs text-rose-300">{coverUploadError}</p>
              )}
            </div>

            <div className="space-y-4">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.35em] text-white/45">助手名称 *</span>
                <input
                  value={draft.name}
                  onChange={(event) => onFieldChange('name', event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-neon-blue/60 focus:bg-white/10"
                  placeholder="请输入助手名称"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.35em] text-white/45">Slug</span>
                <input
                  value={draft.slug ?? ''}
                  onChange={(event) => onFieldChange('slug', event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-neon-blue/60 focus:bg-white/10"
                  placeholder="可选，留空将自动生成"
                />
              </label>
              <label className="space-y-2 flex-1">
                <span className="text-xs uppercase tracking-[0.35em] text-white/45">详细描述</span>
                <textarea
                  value={draft.description ?? ''}
                  onChange={(event) => onFieldChange('description', event.target.value)}
                  className="h-[120px] w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-neon-blue/60 focus:bg-white/10"
                  placeholder="补充使用方法、注意事项或案例"
                />
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <span className="text-xs uppercase tracking-[0.35em] text-white/45">助手定义 *</span>
            <textarea
              value={draft.definition}
              onChange={(event) => onFieldChange('definition', event.target.value)}
              className="min-h-[220px] w-full resize-none rounded-3xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white focus:border-neon-blue/60 focus:bg-white/10"
              placeholder="详细描述助手如何响应、擅长的场景与语气"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
              <div className="space-y-3">
                <span className="text-xs uppercase tracking-[0.35em] text-white/45">分类选择 *</span>
                {categoryOptions.length ? (
                  <CategoryMultiSelect
                    options={categoryOptions}
                    selectedIds={selectedCategoryIds}
                    onChange={onCategoriesChange}
                  />
                ) : (
                  <div className="rounded-2xl border border-yellow-400/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
                    暂无可用分类，请联系管理员配置分类字典。
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
              <div className="space-y-3">
                <span className="text-xs uppercase tracking-[0.35em] text-white/45">模型配置</span>
                <ModelMultiSelect options={modelOptions} selectedModels={draft.models} onChange={onModelsChange} />
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
              <div className="space-y-3">
                <span className="text-xs uppercase tracking-[0.35em] text-white/45">可见性</span>
                <div className="grid grid-cols-2 gap-2">
                  {visibilityOptions.map((option) => {
                    const active = normalizedVisibility === option.value
                    const Icon = option.value === 'private' ? Lock : Globe
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onFieldChange('visibility', option.value)}
                        className={`flex flex-col items-center justify-center rounded-2xl border px-3 py-3 text-center transition ${
                          active ? 'border-neon-blue/60 bg-neon-blue/15 text-white' : 'border-white/10 text-white/65 hover:border-white/30'
                        }`}
                      >
                        <Icon className={`h-5 w-5 mb-1 ${active ? 'text-neon-blue' : 'text-white/45'}`} />
                        <p className="text-sm font-semibold">{option.label}</p>
                        <p className="text-[10px] text-white/55 leading-tight mt-0.5">{option.description}</p>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-end gap-3 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-white/10 px-5 py-2 text-sm text-white/70 transition hover:border-white/40 hover:text-white"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving}
            className={`inline-flex items-center gap-2 rounded-2xl border px-5 py-2 text-sm font-medium transition ${
              saving
                ? 'border-white/20 bg-white/10 text-white/40'
                : 'border-neon-blue/50 bg-neon-blue/20 text-white shadow-[0_15px_35px_rgba(14,165,233,0.35)] hover:bg-neon-blue/30'
            }`}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? '保存中...' : mode === 'create' ? '创建助手' : '保存更新'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface CategoryMultiSelectProps {
  options: AssistantCategorySummary[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
}

function CategoryMultiSelect({ options, selectedIds, onChange }: CategoryMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const selectedNames = useMemo(
    () =>
      selectedIds
        .map((id) => options.find((option) => option.id === id)?.name)
        .filter((name): name is string => Boolean(name)),
    [options, selectedIds]
  )

  const toggleOption = (id: number) => {
    if (!id) {
      return
    }
    const exists = selectedIds.includes(id)
    const next = exists ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]
    onChange(next)
  }

  const summaryLabel = selectedNames.length
    ? `${selectedNames.slice(0, 2).join('、')}${selectedNames.length > 2 ? ` 等${selectedNames.length}类` : ''}`
    : '请选择分类'

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white transition hover:border-neon-blue/60 hover:bg-white/10"
      >
        <span className="truncate">{summaryLabel}</span>
        <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180 text-neon-blue' : 'text-white/60'}`} />
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl">
          <div className="max-h-60 space-y-1 overflow-y-auto">
            {options.map((option) => {
              const selected = selectedIds.includes(option.id)
              return (
                <button
                  key={`category-select-${option.id}`}
                  type="button"
                  onClick={() => toggleOption(option.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                    selected ? 'border border-neon-blue/40 bg-neon-blue/20 text-white' : 'text-white/70 hover:bg-white/5'
                  }`}
                >
                  <span>{option.name}</span>
                  <div className="flex items-center gap-2 text-xs text-white/60">
                    <span>{option.assistantCount} 个</span>
                    {selected && <Check className="h-4 w-4 text-neon-blue" />}
                  </div>
                </button>
              )
            })}
            {!options.length && (
              <div className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white/50">暂无分类</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface ModelMultiSelectProps {
  options: AssistantModelDefinition[]
  selectedModels: string[]
  onChange: (models: string[]) => void
}

function ModelMultiSelect({ options, selectedModels, onChange }: ModelMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  useEffect(() => {
    if (!open && search) {
      setSearch('')
    }
  }, [open, search])

  const normalizedSelection = useMemo(
    () =>
      Array.from(
        new Set(
          (selectedModels ?? [])
            .map((value) => value?.trim())
            .filter((value): value is string => Boolean(value))
        )
      ),
    [selectedModels]
  )

  const filteredOptions = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) {
      return options
    }
    return options.filter((option) => {
      const payload = `${option.name} ${option.alias ?? ''} ${option.description ?? ''}`.toLowerCase()
      return payload.includes(keyword)
    })
  }, [options, search])

  const toggleModel = (name: string) => {
    if (!name) {
      return
    }
    const exists = normalizedSelection.includes(name)
    const next = exists
      ? normalizedSelection.filter((value) => value !== name)
      : [...normalizedSelection, name]
    onChange(next)
  }

  const selectedAliases = useMemo(
    () =>
      normalizedSelection.map((name) => {
        const option = options.find((opt) => opt.name === name)
        return option?.alias ?? name
      }),
    [normalizedSelection, options]
  )

  const summaryLabel = selectedAliases.length
    ? `${selectedAliases.slice(0, 2).join('、')}${selectedAliases.length > 2 ? ` 等${selectedAliases.length}个` : ''}`
    : '请选择关联模型'

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white transition hover:border-neon-blue/60 hover:bg-white/10"
      >
        <span className="truncate">{summaryLabel}</span>
        <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180 text-neon-blue' : 'text-white/60'}`} />
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5">
            <Search className="h-4 w-4 text-white/50" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
              placeholder="搜索模型名称或别名"
            />
          </div>
          <div className="mt-3 max-h-64 space-y-1 overflow-y-auto pr-1">
            {filteredOptions.length ? (
              filteredOptions.map((option) => {
                const selected = normalizedSelection.includes(option.name)
                return (
                  <button
                    key={`model-option-${option.id}-${option.name}`}
                    type="button"
                    onClick={() => toggleModel(option.name)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition ${
                      selected ? 'border border-neon-blue/40 bg-neon-blue/15 text-white' : 'text-white/70 hover:bg-white/5'
                    }`}
                  >
                    {option.logoUrl ? (
                      <img
                        src={option.logoUrl}
                        alt={option.name}
                        className="h-10 w-10 rounded-xl border border-white/10 object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                        <Layers className="h-5 w-5 text-white/60" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">{option.alias ?? option.name}</p>
                      <p className="text-xs text-white/55 line-clamp-2">
                        {option.description ?? '暂无描述'}
                      </p>
                    </div>
                    {selected && <Check className="h-4 w-4 text-neon-blue" />}
                  </button>
                )
              })
            ) : (
              <div className="rounded-2xl border border-white/10 px-3 py-2 text-center text-sm text-white/60">
                未找到匹配模型
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface HighlightStatProps {
  label: string
  value: string | number
  hint: string
}

function HighlightStat({ label, value, hint }: HighlightStatProps) {
  return (
    <div className="flex min-w-[150px] flex-1 items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white/80">
      <div>
        <p className="text-[10px] uppercase tracking-[0.35em] text-white/50">{label}</p>
        <p className="text-[11px] text-white/45">{hint}</p>
      </div>
      <p className="text-xl font-semibold text-white">{value}</p>
    </div>
  )
}
