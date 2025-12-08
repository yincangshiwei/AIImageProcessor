import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Brain,
  Check,
  ChevronDown,
  Clock,
  Edit3,
  Eye,
  EyeOff,
  Folder,
  FolderPlus,
  Globe,
  Loader2,
  Lock,
  MessageCircle,
  User2,
  X
} from 'lucide-react'
import AssistantCommentPanel from './AssistantCommentPanel'
import { useApi } from '../contexts/ApiContext'
import { AssistantModelDefinition, AssistantProfile, AssistantType, FavoriteGroup } from '../types'
import { COVER_TYPE_META, normalizeCoverType } from '../constants/assistantMarketplace'

export interface AssistantDetailPanelProps {
  assistant: AssistantProfile
  variant: AssistantType
  modelAliasMap: Record<string, string>
  modelTypeMap: Record<string, AssistantModelDefinition['modelType']>
  initialCommentsOpen?: boolean
  onClose: () => void
  currentUserCode?: string
  onEdit?: (assistant: AssistantProfile) => void
  onToggleVisibility?: (assistant: AssistantProfile) => void
  visibilityPendingId?: number | null
  favoriteGroups?: FavoriteGroup[]
  favoriteEnabled?: boolean
  onAssignFavoriteGroup?: (assistant: AssistantProfile, groupId: number | null) => Promise<void> | void
  onManageFavoriteGroups?: () => void
}

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

export default function AssistantDetailPanel({
  assistant,
  variant,
  modelAliasMap,
  modelTypeMap,
  initialCommentsOpen = false,
  onClose,
  currentUserCode,
  onEdit,
  onToggleVisibility,
  visibilityPendingId,
  favoriteGroups = [],
  favoriteEnabled = false,
  onAssignFavoriteGroup,
  onManageFavoriteGroups
}: AssistantDetailPanelProps) {
  const { api } = useApi()
  const [assigningFavoriteGroup, setAssigningFavoriteGroup] = useState(false)
  const [favoriteGroupDropdownOpen, setFavoriteGroupDropdownOpen] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(initialCommentsOpen)
  const [commentTotal, setCommentTotal] = useState<number | null>(null)
  const favoriteGroupDropdownRef = useRef<HTMLDivElement | null>(null)
  const detailPanelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  useEffect(() => {
    if (!favoriteGroupDropdownOpen) {
      return
    }
    const handleClick = (event: MouseEvent) => {
      if (favoriteGroupDropdownRef.current && !favoriteGroupDropdownRef.current.contains(event.target as Node)) {
        setFavoriteGroupDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [favoriteGroupDropdownOpen])

  const commentsSupported = assistant.type === 'official' || assistant.visibility === 'public'

  useEffect(() => {
    setCommentsOpen(initialCommentsOpen)
    setCommentTotal(null)
  }, [assistant.id, initialCommentsOpen])

  useEffect(() => {
    if (!commentsSupported || commentsOpen) {
      return
    }
    let cancelled = false
    const fetchCommentPreview = async () => {
      try {
        const result = await api.getAssistantComments(assistant.id, {
          page: 1,
          pageSize: 1,
          authCode: currentUserCode
        })
        if (!cancelled) {
          setCommentTotal(result.total)
        }
      } catch {
        if (!cancelled) {
          setCommentTotal(null)
        }
      }
    }
    fetchCommentPreview()
    return () => {
      cancelled = true
    }
  }, [api, assistant.id, commentsSupported, commentsOpen, currentUserCode])

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
  const showFavoriteGroupSelector = favoriteEnabled && assistant.isFavorited && Boolean(onAssignFavoriteGroup)
  const selectedFavoriteGroupId = assistant.favoriteGroupId ?? null
  const favoriteGroupSelectDisabled = assigningFavoriteGroup || !onAssignFavoriteGroup
  const canManageFavoriteGroups = Boolean(onManageFavoriteGroups && !favoriteGroupSelectDisabled)
  const currentFavoriteGroupLabel = assistant.favoriteGroupName?.trim() || '未分组'
  const commentButtonLabel = commentsOpen ? '收起评论' : `展开评论${typeof commentTotal === 'number' ? `（${commentTotal}）` : ''}`
  const selectedChatModelName = useMemo(
    () => assistant.models.find((modelName) => modelTypeMap[modelName] === 'chat') ?? '',
    [assistant.models, modelTypeMap]
  )
  const assistantBrainLabel = selectedChatModelName ? modelAliasMap[selectedChatModelName] ?? selectedChatModelName : '未配置助手大脑'
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

  const handleFavoriteGroupSelect = async (groupId: number | null) => {
    if (!showFavoriteGroupSelector || !onAssignFavoriteGroup) {
      return
    }
    if (!assistant.isFavorited) {
      alert('请先收藏该助手后再分组')
      return
    }
    try {
      setAssigningFavoriteGroup(true)
      await Promise.resolve(onAssignFavoriteGroup(assistant, groupId))
      setFavoriteGroupDropdownOpen(false)
    } finally {
      setAssigningFavoriteGroup(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 py-10 sm:px-6 lg:px-8 lg:pl-[120px] xl:pl-[150px]">
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-[6px]"
        aria-label="关闭助手详情"
        onClick={onClose}
      />
      <div
        ref={detailPanelRef}
        className="relative z-10 w-full max-w-[1000px] overflow-visible rounded-[32px] border border-white/10 bg-[#070d1b]/95 shadow-[0_40px_140px_rgba(8,15,40,0.65)]"
      >
        <div className="absolute inset-0">
          <div className={`absolute inset-0 bg-gradient-to-br ${accentGlow} opacity-60`} />
          <div className={`absolute -right-10 -top-10 h-48 w-48 blur-3xl ${haloColor}`} />
        </div>

        <div className="relative z-10 p-6 md:p-8 space-y-8 text-white">
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)] lg:gap-6">
            <div className="lg:col-span-1 lg:max-w-[260px]">
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
                    <p className="text-[11px] uppercase tracking-[0.35em] text-white/45">媒介组合</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {mediaModels.length ? (
                        mediaModels.map((model) => (
                          <span
                            key={`detail-media-model-${model}`}
                            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80"
                          >
                            {modelAliasMap[model] ?? model}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-2xl border border-white/10 px-3 py-1 text-xs text-white/60">
                          尚未配置媒介模型
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
                          {mediumLabel}
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

            <div className="flex-1 space-y-6 lg:col-span-1 xl:max-w-[720px] xl:pr-2">
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs uppercase tracking-[0.4em] text-white/55">
                      {assistant.type === 'official' ? '官方旗舰库' : '创作者库'}
                    </p>
                    <h2 className="mt-2 text-3xl font-semibold break-words break-all">{assistant.name}</h2>
                    {assistant.slug && (
                      <p className="mt-2 text-[11px] uppercase tracking-[0.35em] text-white/40">
                        {assistant.slug}
                      </p>
                    )}
                    {assistant.description ? (
                      <p className="mt-3 text-sm text-white/70 leading-relaxed whitespace-pre-wrap break-words break-all max-h-10 overflow-y-auto">
                        {assistant.description}
                      </p>
                    ) : (
                      <p className="mt-3 text-sm text-white/50 leading-relaxed">暂无描述</p>
                    )}
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-end text-right">
                      <p className="text-[11px] uppercase tracking-[0.35em] text-white/45">助手大脑</p>
                      <div className="mt-3 inline-flex items-center gap-3 text-white/80">
                        <Brain
                          className={`h-10 w-10 ${selectedChatModelName ? 'text-neon-blue' : 'text-white/40'}`}
                        />
                        <span className="max-w-[200px] truncate text-base font-semibold text-white">
                          {assistantBrainLabel}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-full border border-white/10 p-2 text-white/70 transition hover:border-white/40 hover:text-white"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4 text-white/80 min-h-[15rem] max-h-[15rem] overflow-auto">
                <p className="text-[11px] uppercase tracking-[0.35em] text-white/45">助手定义</p>
                <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap break-words break-all">
                  {assistant.definition}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
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

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 pt-4">
            <div className="mr-auto flex flex-wrap items-center gap-3">
              {showFavoriteGroupSelector && (
                <div className="relative" ref={favoriteGroupDropdownRef}>
                  <button
                    type="button"
                    disabled={favoriteGroupSelectDisabled}
                    onClick={() => {
                      if (favoriteGroupSelectDisabled) {
                        return
                      }
                      setFavoriteGroupDropdownOpen((prev) => !prev)
                    }}
                    className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition ${
                      favoriteGroupSelectDisabled
                        ? 'border-white/10 bg-white/5 text-white/30'
                        : 'border-white/15 bg-white/10 text-white/80 hover:border-neon-blue/60 hover:text-white'
                    }`}
                  >
                    <Folder className="h-4 w-4 text-white/60" />
                    <span className="max-w-[7rem] truncate">{currentFavoriteGroupLabel}</span>
                    {assigningFavoriteGroup ? (
                      <Loader2 className="h-4 w-4 animate-spin text-neon-blue" />
                    ) : (
                      <ChevronDown
                        className={`h-4 w-4 text-white/60 transition ${favoriteGroupDropdownOpen ? 'rotate-180 text-neon-blue' : ''}`}
                      />
                    )}
                  </button>
                  {favoriteGroupDropdownOpen && !favoriteGroupSelectDisabled && (
                    <div className="absolute left-0 bottom-full z-30 mb-3 w-60 rounded-2xl border border-white/10 bg-slate-900/95 p-3 shadow-[0_25px_55px_rgba(3,7,18,0.65)] backdrop-blur-2xl">
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => handleFavoriteGroupSelect(null)}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                            selectedFavoriteGroupId === null
                              ? 'border border-neon-blue/40 bg-neon-blue/20 text-white'
                              : 'text-white/70 hover:bg-white/5'
                          }`}
                        >
                          <span>未分组</span>
                          {selectedFavoriteGroupId === null && <Check className="h-4 w-4 text-neon-blue" />}
                        </button>
                      </div>
                      <div className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
                        {favoriteGroups.length ? (
                          favoriteGroups.map((group) => {
                            const selected = selectedFavoriteGroupId === group.id
                            return (
                              <button
                                type="button"
                                key={`detail-group-option-${group.id}`}
                                onClick={() => handleFavoriteGroupSelect(group.id)}
                                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                                  selected ? 'border border-neon-blue/40 bg-neon-blue/20 text-white' : 'text-white/70 hover:bg-white/5'
                                }`}
                              >
                                <span className="truncate">{group.name}</span>
                                <div className="flex items-center gap-2 text-xs text-white/45">
                                  <span>{group.assistantCount} 个</span>
                                  {selected && <Check className="h-4 w-4 text-neon-blue" />}
                                </div>
                              </button>
                            )
                          })
                        ) : (
                          <p className="px-3 py-2 text-xs text-white/40">暂无自定义分组</p>
                        )}
                      </div>
                      {canManageFavoriteGroups && (
                        <button
                          type="button"
                          onClick={() => {
                            setFavoriteGroupDropdownOpen(false)
                            onManageFavoriteGroups?.()
                          }}
                          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 transition hover:border-neon-blue/60 hover:text-white"
                        >
                          <FolderPlus className="h-4 w-4" /> 管理分组
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {commentsSupported && (
                <button
                  type="button"
                  onClick={() => setCommentsOpen((prev) => !prev)}
                  className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition ${
                    commentsOpen ? 'border-neon-blue/60 bg-neon-blue/20 text-white' : 'border-white/15 bg-white/10 text-white/70 hover:border-neon-blue/60 hover:text-white'
                  }`}
                >
                  <MessageCircle className={`h-4 w-4 ${commentsOpen ? 'text-neon-blue' : 'text-white/60'}`} />
                  {commentButtonLabel}
                </button>
              )}
            </div>
            <button
              type="button"
              className="rounded-2xl border border-white/10 px-5 py-2 text-sm text-white/70 transition hover:border-white/40 hover:text-white"
              onClick={onClose}
            >
              返回
            </button>
            {isOwner && (
              <>
                <button
                  type="button"
                  onClick={() => onEdit?.(assistant)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-neon-blue/50 bg-neon-blue/20 px-5 py-2 text-sm font-medium text-white shadow-[0_15px_35px_rgba(14,165,233,0.35)] transition hover:bg-neon-blue/30"
                >
                  <Edit3 className="h-4 w-4 text-neon-blue" />
                  编辑配置
                </button>
                <button
                  type="button"
                  disabled={visibilityPending || !onToggleVisibility}
                  onClick={() => onToggleVisibility?.(assistant)}
                  className={`inline-flex items-center gap-2 rounded-2xl border px-5 py-2 text-sm font-medium transition ${
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
              </>
            )}
          </div>
        </div>
        {commentsSupported && commentsOpen && (
          <AssistantCommentPanel
            assistantId={assistant.id}
            onClose={() => setCommentsOpen(false)}
            currentUserCode={currentUserCode}
            onTotalChange={setCommentTotal}
            anchorRef={detailPanelRef}
          />
        )}
      </div>
    </div>
  )
}
