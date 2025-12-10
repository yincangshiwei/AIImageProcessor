import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Brain,
  Check,
  ChevronDown,
  Edit3,
  Globe,
  Image as ImageIcon,
  Layers,
  Loader2,
  Lock,
  Search,
  Sparkles,
  UploadCloud,
  Video as VideoIcon,
  X
} from 'lucide-react'
import {
  AssistantCategorySummary,
  AssistantCoverUploadResult,
  AssistantModelDefinition,
  AssistantUpsertPayload,
  AssistantVisibility
} from '../types'
import { resolveCoverUrl, isAbsoluteUrl } from '../config/storage'

const ASSISTANT_NAME_LIMIT = 15
const ASSISTANT_SLUG_LIMIT = 50
const ASSISTANT_DESCRIPTION_LIMIT = 100

export interface AssistantUpsertDrawerProps {
  open: boolean
  mode: 'create' | 'edit'
  draft: AssistantUpsertPayload
  categoryOptions: AssistantCategorySummary[]
  selectedCategoryIds: number[]
  modelOptions: AssistantModelDefinition[]
  onCategoriesChange: (ids: number[]) => void
  onModelsChange: (models: string[]) => void
  onCoverUpload: (file: File) => Promise<AssistantCoverUploadResult>
  onOptimizeDefinition?: (options: { modelName: string; definition: string }) => Promise<string>
  onFieldChange: (field: keyof AssistantUpsertPayload, value: string | boolean) => void
  onClose: () => void
  onSubmit: () => void
  saving: boolean
  error: string | null
}

export default function AssistantUpsertDrawer({
  open,
  mode,
  draft,
  categoryOptions,
  selectedCategoryIds,
  modelOptions,
  onCategoriesChange,
  onModelsChange,
  onCoverUpload,
  onOptimizeDefinition,
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
  const [mediaDropdownOpen, setMediaDropdownOpen] = useState(false)
  const mediaDropdownRef = useRef<HTMLDivElement | null>(null)
  const [definitionOptimizing, setDefinitionOptimizing] = useState(false)
  const [definitionOptimizeError, setDefinitionOptimizeError] = useState<string | null>(null)

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
  const hasMediaSelection = draft.supportsImage || draft.supportsVideo
  const activeMediaKey: 'image' | 'video' | null = draft.supportsImage ? 'image' : draft.supportsVideo ? 'video' : null

  const chatModelOptions = useMemo(() => modelOptions.filter((option) => option.modelType === 'chat'), [modelOptions])
  const chatModelNameSet = useMemo(() => new Set(chatModelOptions.map((option) => option.name)), [chatModelOptions])
  const selectedChatModelName = useMemo(() => {
    if (!chatModelNameSet.size) {
      return ''
    }
    for (const modelName of draft.models) {
      if (chatModelNameSet.has(modelName)) {
        return modelName
      }
    }
    return ''
  }, [draft.models, chatModelNameSet])

  const selectedModelsCount = draft.models.filter((name) => !chatModelNameSet.has(name)).length

  const handleNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value.slice(0, ASSISTANT_NAME_LIMIT)
      onFieldChange('name', value)
    },
    [onFieldChange]
  )

  const handleSlugChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value.slice(0, ASSISTANT_SLUG_LIMIT)
      onFieldChange('slug', value)
    },
    [onFieldChange]
  )

  const handleDescriptionChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value.slice(0, ASSISTANT_DESCRIPTION_LIMIT)
      onFieldChange('description', value)
    },
    [onFieldChange]
  )

  const handleChatModelSelect = useCallback(
    (modelName: string) => {
      const preservedModels = draft.models.filter((name) => !chatModelNameSet.has(name))
      const nextModels = modelName ? [...preservedModels, modelName] : preservedModels
      onModelsChange(nextModels)
    },
    [chatModelNameSet, draft.models, onModelsChange]
  )

  const mediaSelectedModels = useMemo(
    () => draft.models.filter((name) => !chatModelNameSet.has(name)),
    [draft.models, chatModelNameSet]
  )

  const handleMediaModelsChange = useCallback(
    (models: string[]) => {
      const preservedChat = selectedChatModelName ? [selectedChatModelName] : []
      onModelsChange([...models, ...preservedChat])
    },
    [onModelsChange, selectedChatModelName]
  )

  const mediaModelOptions = useMemo(() => {
    const allowedTypes: AssistantModelDefinition['modelType'][] = []
    if (draft.supportsImage) {
      allowedTypes.push('image')
    }
    if (draft.supportsVideo) {
      allowedTypes.push('video')
    }
    if (!allowedTypes.length) {
      return []
    }
    return modelOptions.filter((option) => allowedTypes.includes(option.modelType))
  }, [draft.supportsImage, draft.supportsVideo, modelOptions])

  const mediaToggleOptions: Array<{
    key: 'image' | 'video'
    label: string
    Icon: typeof ImageIcon
  }> = [
    {
      key: 'image',
      label: '图像创作',
      Icon: ImageIcon
    },
    {
      key: 'video',
      label: '视频叙事',
      Icon: VideoIcon
    }
  ]

  const selectedMediaOptions = activeMediaKey
    ? mediaToggleOptions.filter((option) => option.key === activeMediaKey)
    : []

  const handleMediaSelection = (key: 'image' | 'video') => {
    const nextKey = activeMediaKey === key ? null : key
    onFieldChange('supportsImage', nextKey === 'image')
    onFieldChange('supportsVideo', nextKey === 'video')
  }

  useEffect(() => {
    if (!mediaDropdownOpen) {
      return
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (!mediaDropdownRef.current) {
        return
      }
      if (!mediaDropdownRef.current.contains(event.target as Node)) {
        setMediaDropdownOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMediaDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [mediaDropdownOpen])

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

  const handleDefinitionOptimize = useCallback(async () => {
    if (!onOptimizeDefinition) {
      return
    }
    const trimmedDefinition = draft.definition?.trim()
    if (!trimmedDefinition) {
      setDefinitionOptimizeError('请先输入助手定义内容')
      return
    }
    if (!selectedChatModelName) {
      setDefinitionOptimizeError('请先选择一个助手大脑模型')
      return
    }
    setDefinitionOptimizeError(null)
    setDefinitionOptimizing(true)
    try {
      const optimized = await onOptimizeDefinition({
        modelName: selectedChatModelName,
        definition: trimmedDefinition
      })
      if (optimized) {
        onFieldChange('definition', optimized)
      }
    } catch (error) {
      setDefinitionOptimizeError(
        error instanceof Error ? error.message : '优化失败，请稍后再试'
      )
    } finally {
      setDefinitionOptimizing(false)
    }
  }, [draft.definition, onOptimizeDefinition, onFieldChange, selectedChatModelName])

  useEffect(() => {
    setDefinitionOptimizeError(null)
  }, [draft.definition])

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
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="space-y-4">
                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.35em] text-white/45">助手名称 *</span>
                    <div className="space-y-1">
                      <input
                        value={draft.name}
                        onChange={handleNameChange}
                        maxLength={ASSISTANT_NAME_LIMIT}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-neon-blue/60 focus:bg-white/10"
                        placeholder="请输入助手名称"
                      />
                      <p className="text-right text-[11px] text-white/40">
                        {draft.name.length}/{ASSISTANT_NAME_LIMIT}
                      </p>
                    </div>
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.35em] text-white/45">Slug</span>
                    <div className="space-y-1">
                      <input
                        value={draft.slug ?? ''}
                        onChange={handleSlugChange}
                        maxLength={ASSISTANT_SLUG_LIMIT}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-neon-blue/60 focus:bg-white/10"
                        placeholder="可选，留空将自动生成"
                      />
                      <p className="text-right text-[11px] text-white/40">
                        {(draft.slug?.length ?? 0)}/{ASSISTANT_SLUG_LIMIT}
                      </p>
                    </div>
                  </label>
                </div>
                <ChatModelSelector
                  options={chatModelOptions}
                  selectedModelName={selectedChatModelName}
                  onSelect={handleChatModelSelect}
                />
              </div>
              <label className="space-y-2 flex-1">
                <span className="text-xs uppercase tracking-[0.35em] text-white/45">详细描述</span>
                <div className="space-y-1">
                  <textarea
                    value={draft.description ?? ''}
                    onChange={handleDescriptionChange}
                    maxLength={ASSISTANT_DESCRIPTION_LIMIT}
                    className="h-[70px] w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-neon-blue/60 focus:bg-white/10"
                    placeholder="补充使用方法、注意事项或案例"
                  />
                  <p className="text-right text-[11px] text-white/40">
                    {(draft.description?.length ?? 0)}/{ASSISTANT_DESCRIPTION_LIMIT}
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs uppercase tracking-[0.35em] text-white/45">助手定义 *</span>
              {onOptimizeDefinition && (
                <button
                  type="button"
                  onClick={handleDefinitionOptimize}
                  disabled={
                    definitionOptimizing || !selectedChatModelName || !draft.definition?.trim()
                  }
                  title={
                    !selectedChatModelName
                      ? '请先选择助手大脑模型'
                      : !draft.definition?.trim()
                        ? '请先输入助手定义内容'
                        : undefined
                  }
                  className="inline-flex items-center gap-2 rounded-2xl border border-neon-blue/40 px-3 py-1.5 text-[11px] font-medium text-white/70 transition hover:border-neon-blue/70 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
                >
                  {definitionOptimizing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-neon-blue" />
                  )}
                  <span>优化定义</span>
                </button>
              )}
            </div>
            <textarea
              value={draft.definition}
              onChange={(event) => onFieldChange('definition', event.target.value)}
              className="min-h-[220px] w-full resize-none rounded-3xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white focus:border-neon-blue/60 focus:bg-white/10"
              placeholder="详细描述助手如何响应、擅长的场景与语气"
            />
            {definitionOptimizeError && (
              <p className="text-xs text-rose-300">{definitionOptimizeError}</p>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[280px_13rem_minmax(0,1.6fr)_220px] items-stretch">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_20px_60px_rgba(2,6,23,0.35)] xl:col-span-1">
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

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_20px_60px_rgba(2,6,23,0.35)] xl:max-w-[13rem] xl:w-full">
              <div className="space-y-3">
                <span className="text-xs uppercase tracking-[0.35em] text-white/45">媒介选择 *</span>
                <div className="space-y-2">
                  <div ref={mediaDropdownRef} className="relative">
                    <button
                      type="button"
                      aria-expanded={mediaDropdownOpen}
                      onClick={() => setMediaDropdownOpen((openDropdown) => !openDropdown)}
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                        mediaDropdownOpen
                          ? 'border-neon-blue/60 bg-neon-blue/10 text-white'
                          : 'border-white/10 bg-white/5 text-white/80 hover:border-white/30'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {selectedMediaOptions.length ? (
                          selectedMediaOptions.map((option) => {
                            const Icon = option.Icon
                            return (
                              <span key={option.key} className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                                <Icon className="h-5 w-5 text-neon-blue" />
                                {option.label}
                              </span>
                            )
                          })
                        ) : (
                          <span className="text-sm text-white/55">请选择媒介</span>
                        )}
                      </div>
                      <ChevronDown className={`h-4 w-4 text-white/60 transition ${mediaDropdownOpen ? 'rotate-180 text-neon-blue' : ''}`} />
                    </button>
                    {mediaDropdownOpen && (
                      <div className="absolute bottom-full left-0 right-0 z-10 mb-2 rounded-2xl border border-white/10 bg-[#050b16]/95 p-2 shadow-[0_30px_90px_rgba(2,6,23,0.65)] backdrop-blur-2xl">
                        {mediaToggleOptions.map((option) => {
                          const Icon = option.Icon
                          const active = activeMediaKey === option.key
                          return (
                            <button
                              key={option.key}
                              type="button"
                              onClick={() => handleMediaSelection(option.key)}
                              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
                                active
                                  ? 'bg-neon-blue/15 text-white shadow-[0_15px_35px_rgba(14,165,233,0.25)]'
                                  : 'text-white/75 hover:bg-white/5'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <Icon className={`h-5 w-5 ${active ? 'text-neon-blue' : 'text-white/50'}`} />
                                <span className="font-semibold">{option.label}</span>
                              </div>
                              <span
                                className={`h-2.5 w-2.5 rounded-full border transition ${
                                  active
                                    ? 'border-neon-blue bg-neon-blue shadow-[0_0_12px_rgba(14,165,233,0.9)]'
                                    : 'border-white/20'
                                }`}
                              />
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  {!hasMediaSelection && (
                    <p className="text-xs text-rose-300">至少选择一个媒介以解锁模型配置。</p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs uppercase tracking-[0.35em] text-white/45">媒介模型配置</span>
                  {selectedModelsCount > 0 && (
                    <span className="text-[11px] text-white/60">已选 {selectedModelsCount} 个</span>
                  )}
                </div>
                {mediaModelOptions.length ? (
                  <ModelMultiSelect options={mediaModelOptions} selectedModels={mediaSelectedModels} onChange={handleMediaModelsChange} />
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-3 text-sm text-white/65">
                    {hasMediaSelection ? '当前媒介暂未接入模型，请稍后重试或联系管理员。' : '请先选择媒介后再配置模型。'}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_20px_60px_rgba(2,6,23,0.35)] xl:max-w-[13rem] xl:w-full">
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
                <p className="text-[11px] text-white/55 leading-relaxed">
                  公开助手会进入审核流程，通过后才会对其他创作者展示。
                </p>
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

  const selectedNames = useMemo(
    () =>
      selectedIds
        .map((id) => options.find((option) => option.id === id)?.name)
        .filter((name): name is string => Boolean(name)),
    [options, selectedIds]
  )

  const filteredOptions = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) {
      return options
    }
    return options.filter((option) => option.name.toLowerCase().includes(keyword))
  }, [options, search])

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
        <div className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-2xl border border-white/10 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5">
            <Search className="h-4 w-4 text-white/50" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
              placeholder="搜索分类名称"
            />
          </div>
          <div className="mt-2 max-h-60 space-y-1 overflow-y-auto pr-1">
            {filteredOptions.length ? (
              filteredOptions.map((option) => {
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
              })
            ) : (
              <div className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white/60">未找到匹配分类</div>
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
    : '请选择媒介模型'

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
        <div className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-2xl border border-white/10 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-xl">
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
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-white">{option.alias ?? option.name}</p>
                      </div>
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

interface ChatModelSelectorProps {
  options: AssistantModelDefinition[]
  selectedModelName?: string
  onSelect: (modelName: string) => void
}

function ChatModelSelector({ options, selectedModelName, onSelect }: ChatModelSelectorProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const hasOptions = options.length > 0

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
    if (!hasOptions && open) {
      setOpen(false)
    }
  }, [hasOptions, open])

  const activeOption = useMemo(
    () => options.find((option) => option.name === selectedModelName),
    [options, selectedModelName]
  )
  const displayAlias = activeOption?.alias ?? activeOption?.name ?? (hasOptions ? '未选择' : '暂无可选助手大脑')

  const handleSelect = (modelName: string) => {
    onSelect(modelName)
    setOpen(false)
  }

  const handleClear = () => {
    onSelect('')
    setOpen(false)
  }

  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-3 text-center lg:justify-self-center" ref={containerRef}>
      <div className="flex items-center gap-2 self-start text-xs uppercase tracking-[0.35em] text-white/45">
        <span>助手大脑</span>
        <Edit3 className="h-3.5 w-3.5 text-white/60" />
      </div>
      <div className="flex justify-center w-full">
        <button
          type="button"
          disabled={!hasOptions}
          onClick={() => hasOptions && setOpen((prev) => !prev)}
          className={`flex flex-col items-center gap-3 text-center focus:outline-none ${
            hasOptions ? 'text-white hover:text-neon-blue' : 'cursor-default text-white/30'
          }`}
        >
          <Brain className={`h-20 w-20 ${hasOptions ? 'text-neon-blue' : 'text-white/30'}`} />
          <p className="w-36 truncate text-base font-semibold tracking-wide">{displayAlias}</p>
        </button>
      </div>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-3 w-72 rounded-2xl border border-white/10 bg-[#050b16]/95 p-3 shadow-[0_35px_80px_rgba(5,10,30,0.65)] backdrop-blur-2xl">
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {options.length ? (
              options.map((option) => {
                const active = option.name === selectedModelName
                return (
                  <button
                    key={`chat-model-option-${option.id}-${option.name}`}
                    type="button"
                    onClick={() => handleSelect(option.name)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition ${
                      active ? 'border border-neon-blue/40 bg-neon-blue/15 text-white' : 'text-white/75 hover:bg-white/5'
                    }`}
                  >
                    {option.logoUrl ? (
                      <img src={option.logoUrl} alt={option.name} className="h-10 w-10 rounded-xl border border-white/10 object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                        <Brain className="h-5 w-5 text-white/60" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">{option.alias ?? option.name}</p>
                      <p className="text-xs text-white/55 line-clamp-2">{option.description ?? '暂无描述'}</p>
                    </div>
                    {active && <Check className="h-4 w-4 text-neon-blue" />}
                  </button>
                )
              })
            ) : (
              <div className="rounded-2xl border border-white/10 px-3 py-2 text-center text-sm text-white/60">暂无可选助手大脑</div>
            )}
          </div>
          {selectedModelName && (
            <button
              type="button"
              onClick={handleClear}
              className="mt-3 w-full rounded-2xl border border-white/10 px-3 py-2 text-sm text-white/65 transition hover:border-rose-400/40 hover:text-white"
            >
              清除选择
            </button>
          )}
        </div>
      )}
    </div>
  )
}
