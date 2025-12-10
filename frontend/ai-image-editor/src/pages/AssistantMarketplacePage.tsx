import { FormEvent, MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  Sparkles,
  Layers,
  Filter,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  ArrowUpRight,
  X,
  Plus,
  Folder,
  FolderPlus,
  Heart,
  MessageCircle,
  Trash2,
  Brain
} from 'lucide-react'
import NavBar from '../components/NavBar'
import AssistantDetailPanel from '../components/AssistantDetailPanel'
import AssistantUpsertDrawer from '../components/AssistantUpsertDrawer'
import {
  COVER_TYPE_META,
  deriveSupportFlags,
  normalizeCoverType,
  type CoverTypeValue
} from '../constants/assistantMarketplace'
import { useApi } from '../contexts/ApiContext'
import { useAuth } from '../contexts/AuthContext'
import {
  AssistantPaginatedSection,
  AssistantProfile,
  AssistantReviewStatus,
  AssistantType,
  AssistantUpsertPayload,
  AssistantVisibility,
  AssistantVisibilityFilter,
  AssistantCategorySummary,
  AssistantModelDefinition,
  AssistantCoverUploadResult,
  FavoriteGroup
} from '../types'
import { getDefaultModelOptions } from '../services/modelCapabilities'

const PAGE_SIZE = 20

type MediaFilterValue = 'all' | CoverTypeValue
type ReviewFilterValue = 'all' | AssistantReviewStatus

const MEDIA_FILTER_OPTIONS: Array<{ label: string; value: MediaFilterValue }> = [
  { label: '全部媒介', value: 'all' },
  { label: '仅图像', value: 'image' },
  { label: '仅视频', value: 'video' }
]

const REVIEW_STATUS_FILTER_OPTIONS: Array<{ label: string; value: ReviewFilterValue }> = [
  { label: '全部状态', value: 'all' },
  { label: '待审核', value: 'pending' },
  { label: '未通过', value: 'rejected' },
  { label: '已审核', value: 'approved' }
]

type CategoryUsageMapByLibrary = Record<AssistantLibrary, Map<number, number>>
type CategoriesByLibrary = Record<AssistantLibrary, AssistantCategorySummary[]>
type CategoryFilterOption = {
  id: number | null
  label: string
}

type AssistantSelectOptions = {
  openComments?: boolean
}
type AssistantLibrary = AssistantType | 'favorite'
const DEFAULT_CATEGORY_LABEL = '全部'
const createCategoryFilterOption = (): CategoryFilterOption => ({
  id: null,
  label: DEFAULT_CATEGORY_LABEL
})
const LIBRARY_META: Record<AssistantLibrary, { label: string; badge: string; description: string }> = {
  official: {
    label: '官方旗舰库',
    badge: 'OFFICIAL',
    description: '由平台精调的旗舰助手，覆盖多模态创作场景'
  },
  custom: {
    label: '创作者库',
    badge: 'CUSTOM',
    description: '绑定验证码后专属的创作助手，支持自定义分类'
  },
  favorite: {
    label: '我的收藏',
    badge: 'FAVORITE',
    description: '收藏的助手随时复用，避免重复检索'
  }
}

const LIBRARY_TABS: AssistantLibrary[] = ['official', 'custom', 'favorite']

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

export default function AssistantMarketplacePage() {
  const { api } = useApi()
  const { user } = useAuth()
  const [officialSection, setOfficialSection] = useState<AssistantPaginatedSection | null>(null)
  const [customSection, setCustomSection] = useState<AssistantPaginatedSection | null>(null)
  const [favoriteSection, setFavoriteSection] = useState<AssistantPaginatedSection | null>(null)
  const [availableCategories, setAvailableCategories] = useState<AssistantCategorySummary[]>([])
  const [categoryDictionary, setCategoryDictionary] = useState<AssistantCategorySummary[]>([])
  const [availableModels, setAvailableModels] = useState<AssistantModelDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [categoryByLibrary, setCategoryByLibrary] = useState<Record<AssistantLibrary, CategoryFilterOption>>({
    official: createCategoryFilterOption(),
    custom: createCategoryFilterOption(),
    favorite: createCategoryFilterOption()
  })
  const [activeLibrary, setActiveLibrary] = useState<AssistantLibrary>('official')
  const [officialPage, setOfficialPage] = useState(1)
  const [customPage, setCustomPage] = useState(1)
  const [favoritePage, setFavoritePage] = useState(1)
  const [customVisibility, setCustomVisibility] = useState<AssistantVisibilityFilter>('all')
  const [mediaFilter, setMediaFilter] = useState<MediaFilterValue>('all')
  const [customReviewFilter, setCustomReviewFilter] = useState<ReviewFilterValue>('all')
  const [favoriteReviewFilter, setFavoriteReviewFilter] = useState<ReviewFilterValue>('all')
  const favoriteThrottleRef = useRef<number>(0)
  const [favoritePending, setFavoritePending] = useState<Record<number, boolean>>({})
  const [favoriteGroups, setFavoriteGroups] = useState<FavoriteGroup[]>([])
  const [favoriteGroupFilter, setFavoriteGroupFilter] = useState<number[]>([])
  const [favoriteGroupManagerOpen, setFavoriteGroupManagerOpen] = useState(false)
  const [favoriteGroupSaving, setFavoriteGroupSaving] = useState(false)
  const [selectedAssistant, setSelectedAssistant] = useState<AssistantProfile | null>(null)
  const [detailPanelCommentsOpen, setDetailPanelCommentsOpen] = useState(false)
  const [upsertDrawerOpen, setUpsertDrawerOpen] = useState(false)
  const [upsertMode, setUpsertMode] = useState<'create' | 'edit'>('create')
  const [upsertDraft, setUpsertDraft] = useState<AssistantUpsertPayload>(() => getEmptyAssistantPayload(user?.code))
  const [formError, setFormError] = useState<string | null>(null)
  const [savingAssistant, setSavingAssistant] = useState(false)
  const [editingAssistantId, setEditingAssistantId] = useState<number | null>(null)
  const [visibilityUpdatingId, setVisibilityUpdatingId] = useState<number | null>(null)

  const handleAssistantSelect = useCallback(
    (assistant: AssistantProfile, _library: AssistantLibrary, options?: AssistantSelectOptions) => {
      setSelectedAssistant(assistant)
      setDetailPanelCommentsOpen(Boolean(options?.openComments))
    },
    []
  )

  const handleAssistantDetailClose = useCallback(() => {
    setSelectedAssistant(null)
    setDetailPanelCommentsOpen(false)
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

  const refreshFavoriteGroups = useCallback(async () => {
    if (!user?.code) {
      setFavoriteGroups([])
      return []
    }
    try {
      const groups = await api.getFavoriteGroups(user.code)
      setFavoriteGroups(groups)
      return groups
    } catch (err) {
      console.error('收藏分组加载失败', err)
      return []
    }
  }, [api, user?.code])

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
      const fallbackSupportFlags = deriveSupportFlags(normalizedCoverType)
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
        supportsImage: assistant.supportsImage ?? fallbackSupportFlags.supportsImage,
        supportsVideo: assistant.supportsVideo ?? fallbackSupportFlags.supportsVideo,
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
          return {
            ...prev,
            coverType: nextCoverType
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

  const handleFavoriteGroupFilterChange = useCallback((nextSelection: number[]) => {
    setFavoriteGroupFilter(nextSelection)
    setFavoritePage(1)
    setActiveLibrary('favorite')
  }, [])

  const handleOpenFavoriteGroupManager = useCallback(() => {
    setFavoriteGroupManagerOpen(true)
  }, [])

  const handleCloseFavoriteGroupManager = useCallback(() => {
    setFavoriteGroupManagerOpen(false)
  }, [])

  const handleCreateFavoriteGroup = useCallback(
    async (name: string) => {
      if (!user?.code) {
        alert('请先绑定授权码')
        return
      }
      const trimmed = name.trim()
      if (!trimmed) {
        alert('分组名称不能为空')
        return
      }
      setFavoriteGroupSaving(true)
      try {
        await api.createFavoriteGroup(user.code, trimmed)
        await refreshFavoriteGroups()
      } catch (err) {
        alert(err instanceof Error ? err.message : '分组创建失败')
      } finally {
        setFavoriteGroupSaving(false)
      }
    },
    [api, refreshFavoriteGroups, user?.code]
  )

  const handleRenameFavoriteGroup = useCallback(
    async (groupId: number, name: string) => {
      if (!user?.code) {
        alert('请先绑定授权码')
        return
      }
      const trimmed = name.trim()
      if (!trimmed) {
        alert('分组名称不能为空')
        return
      }
      setFavoriteGroupSaving(true)
      try {
        await api.updateFavoriteGroup(groupId, user.code, trimmed)
        await refreshFavoriteGroups()
      } catch (err) {
        alert(err instanceof Error ? err.message : '分组重命名失败')
      } finally {
        setFavoriteGroupSaving(false)
      }
    },
    [api, refreshFavoriteGroups, user?.code]
  )

  const handleDeleteFavoriteGroup = useCallback(
    async (groupId: number) => {
      if (!user?.code) {
        alert('请先绑定授权码')
        return
      }
      if (!window.confirm('确认删除该分组？已收藏的助手会移动到未分组。')) {
        return
      }
      setFavoriteGroupSaving(true)
      try {
        await api.deleteFavoriteGroup(groupId, user.code)
        setFavoriteGroupFilter((prev) => prev.filter((id) => id !== groupId))
        await refreshFavoriteGroups()
      } catch (err) {
        alert(err instanceof Error ? err.message : '分组删除失败')
      } finally {
        setFavoriteGroupSaving(false)
      }
    },
    [api, refreshFavoriteGroups, user?.code]
  )

  const fetchAssistants = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setLoading(true)
      }
      setError(null)
      const officialCategory = categoryByLibrary.official
      const customCategory = categoryByLibrary.custom
      const favoriteCategory = categoryByLibrary.favorite
      const coverTypeFilter = mediaFilter === 'all' ? undefined : mediaFilter
      const customReviewStatusParam = customReviewFilter === 'all' ? undefined : customReviewFilter
      const favoriteReviewStatusParam = favoriteReviewFilter === 'all' ? undefined : favoriteReviewFilter
      try {
        const officialPromise = api.getAssistants({
          search,
          category: officialCategory.label,
          categoryId: officialCategory.id ?? undefined,
          officialPage,
          customPage: 1,
          favoritesPage: 1,
          pageSize: PAGE_SIZE,
          authCode: user?.code,
          coverType: coverTypeFilter,
          customVisibility
        })

        const customPromise = api.getAssistants({
          search,
          category: customCategory.label,
          categoryId: customCategory.id ?? undefined,
          officialPage: 1,
          customPage,
          favoritesPage: 1,
          pageSize: PAGE_SIZE,
          authCode: user?.code,
          coverType: coverTypeFilter,
          customVisibility,
          customReviewStatus: customReviewStatusParam
        })

        const favoritePromise: Promise<AssistantMarketplaceResponse | null> = user?.code
          ? api.getAssistants({
              search,
              category: favoriteCategory.label,
              categoryId: favoriteCategory.id ?? undefined,
              officialPage: 1,
              customPage: 1,
              favoritesPage: favoritePage,
              pageSize: PAGE_SIZE,
              authCode: user.code,
              coverType: coverTypeFilter,
              customVisibility,
              favoriteGroupIds:
                favoriteGroupFilter.length > 0 ? favoriteGroupFilter : undefined,
              favoriteReviewStatus: favoriteReviewStatusParam
            })
          : Promise.resolve(null)

        const [officialResponse, customResponse, favoriteResponse] = await Promise.all([
          officialPromise,
          customPromise,
          favoritePromise
        ])

        setOfficialSection(officialResponse.official)
        setCustomSection(customResponse.custom)
        setAvailableCategories(
          mergeCategorySummaries(
            officialResponse.availableCategories ?? [],
            customResponse.availableCategories ?? []
          )
        )
        if (favoriteResponse) {
          setFavoriteSection(favoriteResponse.favorites)
        } else {
          setFavoriteSection(null)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '助手数据加载失败')
      } finally {
        if (!options?.silent) {
          setLoading(false)
        }
      }
    },
    [
      api,
      search,
      categoryByLibrary,
      officialPage,
      customPage,
      favoritePage,
      customVisibility,
      mediaFilter,
      favoriteGroupFilter,
      customReviewFilter,
      favoriteReviewFilter,
      user?.code
    ]
  )

  const handleCustomReviewFilterChange = useCallback((value: ReviewFilterValue) => {
    setCustomReviewFilter(value)
    setCustomPage(1)
  }, [])

  const handleFavoriteReviewFilterChange = useCallback((value: ReviewFilterValue) => {
    setFavoriteReviewFilter(value)
    setFavoritePage(1)
  }, [])

  const handleAssignFavoriteGroup = useCallback(
    async (assistant: AssistantProfile, groupId: number | null) => {
      if (!user?.code) {
        alert('请先绑定授权码')
        return
      }
      if (!assistant.isFavorited) {
        alert('请先收藏该助手后再分组')
        return
      }
      try {
        await api.assignFavoriteGroup(assistant.id, user.code, groupId)
        const groupName =
          groupId !== null && groupId !== undefined
            ? favoriteGroups.find((group) => group.id === groupId)?.name ?? null
            : null
        setSelectedAssistant((prev) => {
          if (!prev || prev.id !== assistant.id) {
            return prev
          }
          return {
            ...prev,
            favoriteGroupId: groupId,
            favoriteGroupName: groupName
          }
        })
        await fetchAssistants({ silent: true })
      } catch (err) {
        alert(err instanceof Error ? err.message : '分组调整失败')
      }
    },
    [api, favoriteGroups, fetchAssistants, setSelectedAssistant, user?.code]
  )

  const handleCoverUpload = useCallback(
    async (file: File): Promise<AssistantCoverUploadResult> => {
      if (!user?.code) {
        throw new Error('请先绑定授权码后再上传封面')
      }
      return api.uploadAssistantCover(file, user.code)
    },
    [api, user?.code]
  )

  const handleOptimizeDefinition = useCallback(
    async ({ modelName, definition }: { modelName: string; definition: string }) => {
      if (!user?.code) {
        throw new Error('请先绑定授权码后再优化定义')
      }
      const result = await api.optimizeAssistantDefinition({
        authCode: user.code,
        modelName,
        definition
      })
      return result.optimizedDefinition
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

    if (!upsertDraft.supportsImage && !upsertDraft.supportsVideo) {
      setFormError('请至少选择一个媒介能力')
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

  const handleFavoriteToggle = useCallback(
    async (assistant: AssistantProfile) => {
      if (!user?.code) {
        alert('请先绑定授权码后再收藏')
        return
      }
      const now = Date.now()
      if (now - favoriteThrottleRef.current < 1000) {
        alert('操作太频繁，请稍后再试')
        return
      }
      favoriteThrottleRef.current = now
      setFavoritePending((prev) => ({ ...prev, [assistant.id]: true }))
      try {
        await api.toggleAssistantFavorite(assistant.id, user.code)
        await fetchAssistants({ silent: true })
      } catch (err) {
        alert(err instanceof Error ? err.message : '收藏操作失败')
      } finally {
        setFavoritePending((prev) => {
          const next = { ...prev }
          delete next[assistant.id]
          return next
        })
      }
    },
    [api, fetchAssistants, user?.code]
  )

  const modelOptions = useMemo<AssistantModelDefinition[]>(() => {
    const sortByOrder = (models: AssistantModelDefinition[]) =>
      [...models].sort((a, b) => (a.orderIndex ?? Number.MAX_SAFE_INTEGER) - (b.orderIndex ?? Number.MAX_SAFE_INTEGER))

    if (availableModels.length) {
      return sortByOrder(availableModels)
    }
    const fallback = getDefaultModelOptions().map((option, index) => ({
      id: index + 1,
      name: option.value,
      alias: option.alias ?? option.value,
      description: option.description,
      logoUrl: option.logoUrl,
      status: 'active',
      modelType: 'image' as const,
      orderIndex: option.orderIndex ?? index + 1
    }))
    return sortByOrder(fallback)
  }, [availableModels])

  const modelAliasMap = useMemo(() => {
    return modelOptions.reduce<Record<string, string>>((acc, option) => {
      acc[option.name] = option.alias || option.name
      return acc
    }, {})
  }, [modelOptions])

  const modelTypeMap = useMemo(() => {
    return modelOptions.reduce<Record<string, AssistantModelDefinition['modelType']>>((acc, option) => {
      acc[option.name] = option.modelType
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

  const currentSupportsImage = upsertDraft.supportsImage
  const currentSupportsVideo = upsertDraft.supportsVideo

  useEffect(() => {
    setUpsertDraft((prev) => {
      const allowedTypes = new Set<AssistantModelDefinition['modelType']>()
      if (currentSupportsImage) {
        allowedTypes.add('image')
      }
      if (currentSupportsVideo) {
        allowedTypes.add('video')
      }

      const filtered = prev.models.filter((modelName) => {
        const modelType = modelTypeMap[modelName]
        if (!modelType) {
          return true
        }
        if (modelType === 'chat') {
          return true
        }
        return allowedTypes.has(modelType)
      })

      if (!allowedTypes.size) {
        if (filtered.length === prev.models.length) {
          return prev
        }
        return {
          ...prev,
          models: filtered
        }
      }

      if (filtered.length === prev.models.length) {
        return prev
      }
      return {
        ...prev,
        models: filtered
      }
    })
  }, [currentSupportsImage, currentSupportsVideo, modelTypeMap])

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

  useEffect(() => {
    if (!user?.code) {
      setFavoriteSection(null)
      setFavoritePage(1)
    }
  }, [user?.code])

  useEffect(() => {
    if (!user?.code) {
      setFavoriteGroups([])
      setFavoriteGroupFilter([])
      return
    }
    refreshFavoriteGroups()
  }, [refreshFavoriteGroups, user?.code])

  useEffect(() => {
    setFavoriteGroupFilter((prev) => {
      if (!prev.length) {
        return prev
      }
      const validIds = new Set(favoriteGroups.map((group) => group.id))
      const nextSelection = prev.filter((id) => id === 0 || validIds.has(id))
      if (nextSelection.length === prev.length) {
        return prev
      }
      return nextSelection
    })
  }, [favoriteGroups])

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
      custom: buildUsageMap(customSection),
      favorite: buildUsageMap(favoriteSection)
    }
  }, [officialSection, customSection, favoriteSection])

  const categoriesWithAssistantsByLibrary = useMemo<CategoriesByLibrary>(() => {
    const buildCategoryList = (library: AssistantLibrary) => {
      const usageMap = categoryUsageMapByLibrary[library]
      if (!usageMap.size) {
        return []
      }
      return availableCategories.filter((category) => (usageMap.get(category.id) ?? 0) > 0)
    }

    return {
      official: buildCategoryList('official'),
      custom: buildCategoryList('custom'),
      favorite: buildCategoryList('favorite')
    }
  }, [availableCategories, categoryUsageMapByLibrary])

  useEffect(() => {
    const validCategoryIdsByLibrary: Record<AssistantLibrary, Set<number>> = {
      official: new Set(categoriesWithAssistantsByLibrary.official.map((category) => category.id)),
      custom: new Set(categoriesWithAssistantsByLibrary.custom.map((category) => category.id)),
      favorite: new Set(categoriesWithAssistantsByLibrary.favorite.map((category) => category.id))
    }

    let nextSelection = categoryByLibrary
    let changed = false
    let officialReset = false
    let customReset = false
    let favoriteReset = false

    LIBRARY_TABS.forEach((library) => {
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
        } else if (library === 'custom') {
          customReset = true
        } else {
          favoriteReset = true
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
    if (favoriteReset) {
      setFavoritePage(1)
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

  const handleCategoryChange = (library: AssistantLibrary, option: CategoryFilterOption) => {
    setCategoryByLibrary((prev) => ({
      ...prev,
      [library]: { ...option }
    }))
    if (library === 'official') {
      setOfficialPage(1)
    } else if (library === 'custom') {
      setCustomPage(1)
    } else {
      setFavoritePage(1)
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
    setFavoritePage(1)
  }

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value)
    setOfficialPage(1)
    setCustomPage(1)
    setFavoritePage(1)
  }

  const activeSection =
    activeLibrary === 'official'
      ? officialSection
      : activeLibrary === 'custom'
        ? customSection
        : favoriteSection
  const totalAssistants = (officialSection?.total ?? 0) + (customSection?.total ?? 0)
  const activeCategories = categoryOptions
  const libraryMeta = LIBRARY_META[activeLibrary]
  const activePage =
    activeLibrary === 'official'
      ? officialPage
      : activeLibrary === 'custom'
        ? customPage
        : favoritePage
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
      <main className="relative min-h-screen pl-0 lg:pl-[120px] xl:pl-[150px] px-4 md:px-8 lg:px-12 py-10 overflow-hidden">
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
                    placeholder="搜索助手名称、定义、描述或创作者"
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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {LIBRARY_TABS.map((libraryKey) => {
                const meta = LIBRARY_META[libraryKey]
                const sectionData =
                  libraryKey === 'official'
                    ? officialSection
                    : libraryKey === 'custom'
                      ? customSection
                      : favoriteSection
                const isActive = activeLibrary === libraryKey
                const accent =
                  libraryKey === 'official'
                    ? 'from-[#2dd4ff]/40 via-[#0ea5e9]/20 to-transparent'
                    : libraryKey === 'custom'
                      ? 'from-[#f472b6]/40 via-[#a855f7]/20 to-transparent'
                      : 'from-[#f97316]/40 via-[#facc15]/20 to-transparent'
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
            modelTypeMap={modelTypeMap}
            currentPage={activePage}
            mediaFilter={mediaFilter}
            onMediaFilterChange={handleMediaFilterChange}
            onPageChange={(page) => {
              if (activeLibrary === 'official') {
                setOfficialPage(page)
              } else if (activeLibrary === 'custom') {
                setCustomPage(page)
              } else {
                setFavoritePage(page)
              }
            }}
            onAssistantSelect={handleAssistantSelect}
            onCreateAssistant={activeLibrary === 'custom' ? handleCreateAssistant : undefined}
            canCreateAssistant={activeLibrary === 'custom' ? Boolean(user?.code) : undefined}
            favoriteEnabled={Boolean(user?.code)}
            favoritePendingMap={favoritePending}
            favoriteGroups={favoriteGroups}
            favoriteGroupFilter={favoriteGroupFilter}
            onFavoriteGroupFilterChange={handleFavoriteGroupFilterChange}
            onManageFavoriteGroups={handleOpenFavoriteGroupManager}
            onAssignFavoriteGroup={handleAssignFavoriteGroup}
            onToggleFavorite={handleFavoriteToggle}
            currentUserCode={user?.code}
            reviewFilter={
              activeLibrary === 'custom'
                ? customReviewFilter
                : activeLibrary === 'favorite'
                  ? favoriteReviewFilter
                  : undefined
            }
            reviewFilterDisabled={activeLibrary === 'favorite' && !user?.code}
            onReviewFilterChange={
              activeLibrary === 'custom'
                ? handleCustomReviewFilterChange
                : activeLibrary === 'favorite'
                  ? handleFavoriteReviewFilterChange
                  : undefined
            }
          />

          {selectedAssistant && (
            <AssistantDetailPanel
              assistant={selectedAssistant}
              variant={selectedAssistant.type}
              modelAliasMap={modelAliasMap}
              modelTypeMap={modelTypeMap}
              initialCommentsOpen={detailPanelCommentsOpen}
              onClose={handleAssistantDetailClose}
              currentUserCode={user?.code}
              onEdit={handleEditAssistant}
              onToggleVisibility={handleVisibilityToggle}
              visibilityPendingId={visibilityUpdatingId}
              favoriteGroups={favoriteGroups}
              favoriteEnabled={Boolean(user?.code)}
              onAssignFavoriteGroup={handleAssignFavoriteGroup}
              onManageFavoriteGroups={handleOpenFavoriteGroupManager}
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
            onOptimizeDefinition={handleOptimizeDefinition}
            onFieldChange={handleFieldChange}
            onClose={handleDrawerClose}
            onSubmit={handleSubmitAssistant}
            saving={savingAssistant}
            error={formError}
          />

          <FavoriteGroupManager
            open={favoriteGroupManagerOpen}
            groups={favoriteGroups}
            loading={favoriteGroupSaving}
            onClose={handleCloseFavoriteGroupManager}
            onCreate={handleCreateFavoriteGroup}
            onRename={handleRenameFavoriteGroup}
            onDelete={handleDeleteFavoriteGroup}
          />
        </div>
      </main>
    </div>
  )
}

interface AssistantGalleryProps {
  variant: AssistantLibrary
  section: AssistantPaginatedSection | null
  loading: boolean
  modelAliasMap: Record<string, string>
  modelTypeMap: Record<string, AssistantModelDefinition['modelType']>
  currentPage: number
  mediaFilter: MediaFilterValue
  currentUserCode?: string
  reviewFilter?: ReviewFilterValue
  reviewFilterDisabled?: boolean
  onMediaFilterChange: (value: MediaFilterValue) => void
  onReviewFilterChange?: (value: ReviewFilterValue) => void
  onPageChange: (page: number) => void
  onAssistantSelect?: (assistant: AssistantProfile, variant: AssistantLibrary, options?: AssistantSelectOptions) => void
  onCreateAssistant?: () => void
  canCreateAssistant?: boolean
  favoriteEnabled?: boolean
  favoritePendingMap?: Record<number, boolean>
  favoriteGroups?: FavoriteGroup[]
  favoriteGroupFilter?: number[]
  onFavoriteGroupFilterChange?: (groupIds: number[]) => void
  onManageFavoriteGroups?: () => void
  onAssignFavoriteGroup?: (assistant: AssistantProfile, groupId: number | null) => void
  onToggleFavorite?: (assistant: AssistantProfile) => void
}

function AssistantGallery({
  variant,
  section,
  loading,
  modelAliasMap,
  modelTypeMap,
  currentPage,
  mediaFilter,
  currentUserCode,
  reviewFilter = 'all',
  reviewFilterDisabled = false,
  onMediaFilterChange,
  onReviewFilterChange,
  onPageChange,
  onAssistantSelect,
  onCreateAssistant,
  canCreateAssistant,
  favoriteEnabled,
  favoritePendingMap = {},
  favoriteGroups = [],
  favoriteGroupFilter = [],
  onFavoriteGroupFilterChange,
  onManageFavoriteGroups,
  onAssignFavoriteGroup,
  onToggleFavorite
}: AssistantGalleryProps) {
  const meta = LIBRARY_META[variant]
  const total = section?.total ?? 0
  const pageSize = section?.pageSize ?? PAGE_SIZE
  const items = section?.items ?? []
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const handlePrev = () => onPageChange(Math.max(1, currentPage - 1))
  const handleNext = () => onPageChange(Math.min(totalPages, currentPage + 1))
  const shouldRenderReviewFilter =
    (variant === 'custom' || variant === 'favorite') && typeof onReviewFilterChange === 'function'

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
          {variant === 'favorite' && favoriteEnabled && onFavoriteGroupFilterChange && (
            <FavoriteGroupFilter
              groups={favoriteGroups}
              selectedIds={favoriteGroupFilter}
              onChange={onFavoriteGroupFilterChange}
              onManage={onManageFavoriteGroups}
              disabled={!favoriteEnabled}
            />
          )}
          {shouldRenderReviewFilter && onReviewFilterChange && (
            <ReviewStatusFilterDropdown
              value={reviewFilter}
              onChange={onReviewFilterChange}
              disabled={reviewFilterDisabled}
            />
          )}
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
              modelTypeMap={modelTypeMap}
              currentUserCode={currentUserCode}
              onSelect={(selectedAssistant, options) =>
                onAssistantSelect?.(selectedAssistant, variant, options)
              }
              favoriteEnabled={favoriteEnabled}
              favoritePending={Boolean(favoritePendingMap?.[assistant.id])}
              onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(assistant) : undefined}
            />
          ))}
        </div>
      ) : variant === 'favorite' && favoriteEnabled === false ? (
        <div className="rounded-3xl border border-dashed border-white/15 bg-white/5 p-10 text-center text-white/60">
          绑定授权码后即可收藏并管理常用助手。
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

interface ReviewStatusFilterDropdownProps {
  value: ReviewFilterValue
  onChange: (value: ReviewFilterValue) => void
  disabled?: boolean
}

function ReviewStatusFilterDropdown({ value, onChange, disabled }: ReviewStatusFilterDropdownProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const selectedOption = REVIEW_STATUS_FILTER_OPTIONS.find((option) => option.value === value)

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

  const handleToggle = () => {
    if (disabled) {
      return
    }
    setOpen((prev) => !prev)
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-1.5 text-xs font-medium transition ${
          disabled
            ? 'border-white/5 bg-white/5 text-white/30'
            : 'border-white/10 bg-white/5 text-white/80 hover:border-neon-blue/60 hover:text-white'
        }`}
      >
        <ShieldCheck className="h-4 w-4 text-white/60" />
        <span>{selectedOption?.label ?? '全部状态'}</span>
        <ChevronDown
          className={`h-4 w-4 text-white/50 transition ${open ? 'rotate-180 text-neon-blue' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-44 rounded-2xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl">
          <div className="space-y-1">
            {REVIEW_STATUS_FILTER_OPTIONS.map((option) => {
              const selected = option.value === value
              return (
                <button
                  key={`review-filter-${option.value}`}
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

interface FavoriteGroupFilterProps {
  groups: FavoriteGroup[]
  selectedIds: number[]
  onChange: (groupIds: number[]) => void
  onManage?: () => void
  disabled?: boolean
}

function FavoriteGroupFilter({ groups, selectedIds, onChange, onManage, disabled }: FavoriteGroupFilterProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

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

  const selectionLabel = selectedIds.length
    ? `分组 · ${selectedIds.length}`
    : '全部分组'

  const handleToggle = (groupId: number) => {
    if (disabled) {
      return
    }
    const next = new Set(selectedIds)
    if (next.has(groupId)) {
      next.delete(groupId)
    } else {
      next.add(groupId)
    }
    onChange(Array.from(next))
  }

  const handleClear = () => {
    if (disabled) {
      return
    }
    onChange([])
    setOpen(false)
  }

  const renderOption = (groupId: number, label: string) => {
    const selected = selectedIds.includes(groupId)
    return (
      <button
        type="button"
        key={`favorite-filter-${groupId}`}
        onClick={() => handleToggle(groupId)}
        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
          selected ? 'border border-neon-blue/40 bg-neon-blue/20 text-white' : 'text-white/70 hover:bg-white/5'
        }`}
      >
        <span>{label}</span>
        {selected && <Check className="h-4 w-4 text-neon-blue" />}
      </button>
    )
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-1.5 text-xs font-medium transition ${
          disabled
            ? 'border-white/5 bg-white/5 text-white/30'
            : 'border-white/10 bg-white/5 text-white/80 hover:border-neon-blue/60 hover:text-white'
        }`}
      >
        <Folder className="h-4 w-4 text-white/60" />
        <span>{selectionLabel}</span>
        <ChevronDown
          className={`h-4 w-4 text-white/50 transition ${open ? 'rotate-180 text-neon-blue' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-2 w-60 rounded-2xl border border-white/10 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-xl">
          <div className="space-y-1">
            <button
              type="button"
              onClick={handleClear}
              className="flex w-full items-center justify-between rounded-xl border border-white/10 px-3 py-2 text-left text-xs text-white/70 hover:border-neon-blue/50 hover:text-white"
            >
              <span>全部收藏</span>
            </button>
            {renderOption(0, '未分组')}
          </div>
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
            {groups.length ? (
              groups.map((group) =>
                renderOption(group.id, `${group.name} · ${group.assistantCount}`)
              )
            ) : (
              <p className="px-3 py-2 text-xs text-white/40">暂无自定义分组</p>
            )}
          </div>
          {onManage && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onManage()
              }}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 transition hover:border-neon-blue/60 hover:text-white"
            >
              <FolderPlus className="h-4 w-4" /> 管理分组
            </button>
          )}
        </div>
      )}
    </div>
  )
}

interface FavoriteGroupPillProps {
  groups: FavoriteGroup[]
  currentGroupId: number | null
  currentGroupName: string | null
  onSelect?: (groupId: number | null) => void
  disabled?: boolean
}

function FavoriteGroupPill({
  groups,
  currentGroupId,
  currentGroupName,
  onSelect,
  disabled
}: FavoriteGroupPillProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const label = currentGroupName?.trim() || '未分组'

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

  if (!onSelect || disabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[11px] text-white/70">
        <Folder className="h-3.5 w-3.5" />
        {label}
      </span>
    )
  }

  const handleSelect = (groupId: number | null) => {
    onSelect(groupId)
    setOpen(false)
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] text-white/80 transition hover:border-neon-blue/60 hover:text-white"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((prev) => !prev)
        }}
      >
        <Folder className="h-3.5 w-3.5" />
        <span className="truncate max-w-[7rem]">{label}</span>
        <ChevronDown className={`h-3 w-3 text-white/60 transition ${open ? 'rotate-180 text-neon-blue' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-48 rounded-2xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl">
          <div className="space-y-1 text-sm text-white/70">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                handleSelect(null)
              }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition ${
                currentGroupId === null ? 'border border-neon-blue/40 bg-neon-blue/20 text-white' : 'hover:bg-white/5'
              }`}
            >
              <span>未分组</span>
              {currentGroupId === null && <Check className="h-4 w-4 text-neon-blue" />}
            </button>
            {groups.length ? (
              groups.map((group) => {
                const selected = currentGroupId === group.id
                return (
                  <button
                    type="button"
                    key={`favorite-pill-${group.id}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      handleSelect(group.id)
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition ${
                      selected ? 'border border-neon-blue/40 bg-neon-blue/20 text-white' : 'hover:bg-white/5'
                    }`}
                  >
                    <span>{group.name}</span>
                    {selected && <Check className="h-4 w-4 text-neon-blue" />}
                  </button>
                )
              })
            ) : (
              <p className="px-3 py-2 text-xs text-white/40">暂无自定义分组</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface AssistantCardProps {
  assistant: AssistantProfile
  variant: AssistantLibrary
  modelAliasMap: Record<string, string>
  modelTypeMap: Record<string, AssistantModelDefinition['modelType']>
  currentUserCode?: string
  onSelect?: (assistant: AssistantProfile, options?: AssistantSelectOptions) => void
  onToggleFavorite?: () => void
  favoriteEnabled?: boolean
  favoritePending?: boolean
  favoriteGroups?: FavoriteGroup[]
  onAssignFavoriteGroup?: (assistant: AssistantProfile, groupId: number | null) => void
}

function AssistantCard({
  assistant,
  variant,
  modelAliasMap,
  modelTypeMap,
  currentUserCode,
  onSelect,
  onToggleFavorite,
  favoriteEnabled,
  favoritePending,
  favoriteGroups = [],
  onAssignFavoriteGroup
}: AssistantCardProps) {
  const { api } = useApi()
  const [commentTotal, setCommentTotal] = useState<number | null>(null)
  const [commentLoading, setCommentLoading] = useState(false)
  const isCommentableCustom =
    assistant.type === 'custom' && assistant.visibility === 'public' && assistant.reviewStatus === 'approved'
  const commentBadgeVisible = assistant.type === 'official' || isCommentableCustom

  const handleSelect = () => {
    onSelect?.(assistant)
  }

  const handleCommentBadgeClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onSelect?.(assistant, { openComments: true })
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
      : variant === 'custom'
        ? 'from-[#ff9a9e]/20 via-[#fad0c4]/10 to-transparent'
        : 'from-[#fbbf24]/20 via-[#f97316]/10 to-transparent'

  const normalizedCoverType = normalizeCoverType(assistant.coverType)
  const coverTypeMeta = COVER_TYPE_META[normalizedCoverType]
  const CoverTypeIcon = coverTypeMeta?.Icon
  const mediums = coverTypeMeta && CoverTypeIcon
    ? ([{ icon: CoverTypeIcon, label: coverTypeMeta.label }] as {
        icon: typeof ImageIcon
        label: string
      }[])
    : []

  const mediaModels = useMemo(() => {
    return assistant.models.filter((modelName) => {
      const modelType = modelTypeMap[modelName]
      if (modelType === 'image') {
        return assistant.supportsImage
      }
      if (modelType === 'video') {
        return assistant.supportsVideo
      }
      return false
    })
  }, [assistant.models, assistant.supportsImage, assistant.supportsVideo, modelTypeMap])
  const previewMediaModels = mediaModels.slice(0, 3)
  const extraMediaModels = mediaModels.length - previewMediaModels.length
  const assistantBrainLabel = useMemo(() => {
    const chatModelName = assistant.models.find((modelName) => modelTypeMap[modelName] === 'chat')
    if (!chatModelName) {
      return ''
    }
    return modelAliasMap[chatModelName] ?? chatModelName
  }, [assistant.models, modelAliasMap, modelTypeMap])

  const categoriesLabel = assistant.categories.length ? assistant.categories.join(' · ') : '未分类'
  const visibilityLabel = assistant.visibility === 'private' ? '私有' : '公开'
  const visibilityBadgeClass =
    assistant.visibility === 'private'
      ? 'border-rose-300/40 text-rose-200'
      : 'border-emerald-300/40 text-emerald-200'
  const isOwner = assistant.type === 'custom' && assistant.ownerCode && assistant.ownerCode === currentUserCode
  const reviewStatusMeta = {
    pending: {
      label: '待审核',
      className: 'border-amber-300/60 text-amber-100 bg-amber-500/10'
    },
    rejected: {
      label: '未通过',
      className: 'border-rose-400/60 text-rose-200 bg-rose-500/10'
    },
    approved: {
      label: '已审核',
      className: 'border-emerald-300/60 text-emerald-200 bg-emerald-500/10'
    }
  } as const
  const reviewStatusInfo = reviewStatusMeta[assistant.reviewStatus]
  const showReviewStatus = isOwner && assistant.visibility === 'public'
  const descriptionSnippet = assistant.description || assistant.definition
  const canToggleFavorite = Boolean(onToggleFavorite && favoriteEnabled)
  const favoriteButtonTitle = assistant.isFavorited ? '取消收藏' : '收藏助手'

  const [showUnfavoriteConfirm, setShowUnfavoriteConfirm] = useState(false)
  const favoriteButtonWrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!commentBadgeVisible) {
      setCommentTotal(null)
      setCommentLoading(false)
      return
    }
    let cancelled = false
    setCommentLoading(true)
    const fetchCommentTotal = async () => {
      try {
        const result = await api.getAssistantComments(assistant.id, { page: 1, pageSize: 1 })
        if (!cancelled) {
          setCommentTotal(result.total ?? 0)
        }
      } catch {
        if (!cancelled) {
          setCommentTotal(0)
        }
      } finally {
        if (!cancelled) {
          setCommentLoading(false)
        }
      }
    }
    fetchCommentTotal()
    return () => {
      cancelled = true
    }
  }, [api, assistant.id, commentBadgeVisible])

  useEffect(() => {
    if (!showUnfavoriteConfirm) {
      return
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (favoriteButtonWrapperRef.current?.contains(event.target as Node)) {
        return
      }
      setShowUnfavoriteConfirm(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [showUnfavoriteConfirm])

  useEffect(() => {
    setShowUnfavoriteConfirm(false)
  }, [assistant.id])

  useEffect(() => {
    if (!assistant.isFavorited) {
      setShowUnfavoriteConfirm(false)
    }
  }, [assistant.isFavorited])

  const handleFavoriteButtonClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (!canToggleFavorite || favoritePending) {
      return
    }
    if (assistant.isFavorited) {
      setShowUnfavoriteConfirm(true)
      return
    }
    onToggleFavorite?.()
  }

  const handleConfirmUnfavorite = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (!canToggleFavorite || favoritePending) {
      return
    }
    setShowUnfavoriteConfirm(false)
    onToggleFavorite?.()
  }

  const handleCancelUnfavorite = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    setShowUnfavoriteConfirm(false)
  }

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
            <span className="glass-chip text-[10px] tracking-[0.3em]">{assistant.type === 'official' ? '官方' : '创作者'}</span>
            {assistant.type === 'custom' && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] ${visibilityBadgeClass}`}>
                {visibilityLabel}
              </span>
            )}
            {showReviewStatus && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${reviewStatusInfo.className}`}>
                {reviewStatusInfo.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {commentBadgeVisible && (
              <button
                type="button"
                onClick={handleCommentBadgeClick}
                className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-white/70 transition hover:border-neon-blue/60 hover:text-white"
                title="查看评论"
              >
                <MessageCircle className={`h-3.5 w-3.5 ${commentLoading ? 'text-white/40' : 'text-neon-blue'}`} />
                {commentLoading ? '···' : commentTotal ?? 0}
              </button>
            )}
            <div className="relative" ref={favoriteButtonWrapperRef}>
              <button
                type="button"
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition ${
                  assistant.isFavorited
                    ? 'border-rose-300/70 bg-rose-500/20 text-rose-200'
                    : 'border-white/15 bg-white/5 text-white/60 hover:text-white hover:border-white/40'
                } ${
                  !canToggleFavorite || favoritePending ? 'cursor-not-allowed opacity-40 hover:text-white/60 hover:border-white/15' : ''
                }`}
                onClick={handleFavoriteButtonClick}
                disabled={!canToggleFavorite || favoritePending}
                title={canToggleFavorite ? favoriteButtonTitle : '绑定授权码后可收藏'}
              >
                <Heart
                  className="h-3.5 w-3.5"
                  fill={assistant.isFavorited ? 'currentColor' : 'none'}
                />
              </button>

              {showUnfavoriteConfirm && assistant.isFavorited && (
                <div className="absolute right-0 top-10 z-20 w-60 rounded-2xl border border-white/15 bg-slate-950/90 p-4 text-white/80 shadow-[0_25px_55px_rgba(3,7,18,0.7)] backdrop-blur-2xl">
                  <p className="text-sm font-semibold text-white">确认取消收藏？</p>
                  <p className="mt-1 text-xs text-white/60 leading-relaxed">取消后将从收藏列表中移除，可随时重新收藏。</p>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmUnfavorite}
                      className="flex-1 rounded-xl border border-rose-400/50 bg-rose-500/20 px-3 py-1.5 text-xs font-medium text-white transition hover:border-rose-300 hover:bg-rose-500/30"
                    >
                      确认取消
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelUnfavorite}
                      className="flex-1 rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/40 hover:text-white"
                    >
                      再想想
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
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

        <div className="flex flex-wrap items-center gap-2">
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
          {assistantBrainLabel && (
            <span className="inline-flex items-center gap-1 rounded-full border border-neon-blue/40 bg-neon-blue/10 px-2.5 py-0.5 text-[11px] text-white">
              <Brain className="h-3.5 w-3.5 text-neon-blue" />
              {assistantBrainLabel}
            </span>
          )}
          {variant === 'favorite' && (
            <FavoriteGroupPill
              groups={favoriteGroups}
              currentGroupId={assistant.favoriteGroupId ?? null}
              currentGroupName={assistant.favoriteGroupName ?? null}
              onSelect={
                onAssignFavoriteGroup && favoriteEnabled
                  ? (groupId) => onAssignFavoriteGroup(assistant, groupId)
                  : undefined
              }
              disabled={!favoriteEnabled}
            />
          )}
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">媒介组合</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {previewMediaModels.length ? (
              <>
                {previewMediaModels.map((model) => (
                  <span
                    key={`card-media-model-${model}`}
                    className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[11px] text-white/80"
                  >
                    {modelAliasMap[model] ?? model}
                  </span>
                ))}
                {extraMediaModels > 0 && (
                  <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/60">+{extraMediaModels}</span>
                )}
              </>
            ) : (
              <span className="text-[11px] text-white/45">尚未配置媒介模型</span>
            )}
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between text-[11px] text-white/65">
          <span className="flex items-center gap-1.5 truncate">
            <Layers className="h-3.5 w-3.5" />
            <span className="truncate">{categoriesLabel}</span>
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


interface FavoriteGroupManagerProps {
  open: boolean
  groups: FavoriteGroup[]
  loading: boolean
  onClose: () => void
  onCreate: (name: string) => Promise<void> | void
  onRename: (groupId: number, name: string) => Promise<void> | void
  onDelete: (groupId: number) => Promise<void> | void
}

function FavoriteGroupManager({
  open,
  groups,
  loading,
  onClose,
  onCreate,
  onRename,
  onDelete
}: FavoriteGroupManagerProps) {
  const [newGroupName, setNewGroupName] = useState('')
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')

  useEffect(() => {
    if (!open) {
      setNewGroupName('')
      setEditingGroupId(null)
      setEditingName('')
    }
  }, [open])

  if (!open) {
    return null
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = newGroupName.trim()
    if (!trimmed) {
      return
    }
    await onCreate(trimmed)
    setNewGroupName('')
  }

  const startEdit = (group: FavoriteGroup) => {
    setEditingGroupId(group.id)
    setEditingName(group.name)
  }

  const cancelEdit = () => {
    setEditingGroupId(null)
    setEditingName('')
  }

  const handleRename = async () => {
    if (!editingGroupId) {
      return
    }
    const trimmed = editingName.trim()
    if (!trimmed) {
      return
    }
    await onRename(editingGroupId, trimmed)
    cancelEdit()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8">
      <div className="w-full max-w-lg space-y-5 rounded-3xl border border-white/10 bg-white/10 p-6 text-white shadow-[0_40px_120px_rgba(2,6,23,0.65)] backdrop-blur-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold">管理收藏分组</h3>
            <p className="text-sm text-white/70">自定义助手收藏分组，只影响当前授权码。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 p-1 text-white/60 hover:border-white/40 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="flex items-center gap-2">
          <label className="flex-1 text-sm text-white/60">
            <input
              type="text"
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              placeholder="输入分组名称"
              disabled={loading}
              className="mt-1 w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-white outline-none placeholder:text-white/40 focus:border-neon-blue/60"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl border border-neon-blue/40 bg-neon-blue/20 px-4 py-2 text-sm font-medium text-white shadow-[0_10px_30px_rgba(14,165,233,0.35)] transition hover:bg-neon-blue/30 disabled:opacity-40"
          >
            <FolderPlus className="h-4 w-4" /> 新建
          </button>
        </form>

        <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
          {groups.length ? (
            groups.map((group) => {
              const isEditing = editingGroupId === group.id
              return (
                <div
                  key={group.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        disabled={loading}
                        className="w-full rounded-xl border border-white/10 bg-slate-900/40 px-3 py-1.5 text-sm text-white outline-none focus:border-neon-blue/60"
                      />
                    ) : (
                      <p className="text-sm font-medium">{group.name}</p>
                    )}
                    <span className="text-xs text-white/50">{group.assistantCount} 个助手</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={handleRename}
                          disabled={loading}
                          className="rounded-xl border border-emerald-300/40 px-3 py-1 text-xs text-emerald-200 hover:border-emerald-200"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-xl border border-white/15 px-3 py-1 text-xs text-white/70 hover:border-white/40"
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(group)}
                          disabled={loading}
                          className="rounded-xl border border-white/15 px-3 py-1 text-xs text-white/70 hover:border-white/40"
                        >
                          重命名
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(group.id)}
                          disabled={loading}
                          className="inline-flex items-center gap-1 rounded-xl border border-rose-400/40 px-3 py-1 text-xs text-rose-200 hover:border-rose-300/70"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> 删除
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-10 text-center text-sm text-white/50">
              还没有分组，先创建一个吧。
            </div>
          )}
        </div>
      </div>
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
