import {
  FormEvent,
  MouseEvent as ReactMouseEvent,
  RefObject,
  TouchEvent as ReactTouchEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'
import { Loader2, Move, ThumbsUp, Trash2, X } from 'lucide-react'
import { useApi } from '../contexts/ApiContext'
import { AssistantComment } from '../types'

interface AssistantCommentPanelProps {
  assistantId: number
  onClose: () => void
  currentUserCode?: string
  onTotalChange?: (total: number | null) => void
  anchorRef?: RefObject<HTMLElement | null>
}

const COMMENT_PAGE_SIZE = 10
const PANEL_MARGIN = 24
const DEFAULT_PANEL_WIDTH = 380
const DEFAULT_PANEL_HEIGHT = 520

type PanelPosition = {
  left: number
  top: number
}

type DragState = {
  active: boolean
  startX: number
  startY: number
  initialLeft: number
  initialTop: number
}

const createInitialPosition = (): PanelPosition => ({
  left: PANEL_MARGIN,
  top: PANEL_MARGIN
})

export default function AssistantCommentPanel({
  assistantId,
  onClose,
  currentUserCode,
  onTotalChange,
  anchorRef
}: AssistantCommentPanelProps) {
  const { api } = useApi()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<DragState>({
    active: false,
    startX: 0,
    startY: 0,
    initialLeft: PANEL_MARGIN,
    initialTop: PANEL_MARGIN
  })

  const [position, setPosition] = useState<PanelPosition>(createInitialPosition)
  const [comments, setComments] = useState<AssistantComment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [composerError, setComposerError] = useState<string | null>(null)
  const [commentInput, setCommentInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [likePending, setLikePending] = useState<Record<number, boolean>>({})
  const [deletePending, setDeletePending] = useState<Record<number, boolean>>({})

  const canComment = Boolean(currentUserCode?.trim())
  const pageCount = Math.max(1, Math.ceil(total / COMMENT_PAGE_SIZE) || 1)

  const getPositionBounds = useCallback(
    (panelWidth: number, panelHeight: number) => {
      if (typeof window === 'undefined') {
        return {
          minLeft: PANEL_MARGIN,
          maxLeft: PANEL_MARGIN,
          minTop: PANEL_MARGIN,
          maxTop: PANEL_MARGIN
        }
      }
      const anchorElement = anchorRef?.current
      if (anchorElement) {
        const rect = anchorElement.getBoundingClientRect()
        const minLeft = rect.left + PANEL_MARGIN
        const maxLeft = Math.max(minLeft, rect.right - panelWidth - PANEL_MARGIN)
        const minTop = rect.top + PANEL_MARGIN
        const maxTop = Math.max(minTop, rect.bottom - panelHeight - PANEL_MARGIN)
        return { minLeft, maxLeft, minTop, maxTop }
      }
      const maxLeft = Math.max(PANEL_MARGIN, window.innerWidth - panelWidth - PANEL_MARGIN)
      const maxTop = Math.max(PANEL_MARGIN, window.innerHeight - panelHeight - PANEL_MARGIN)
      return {
        minLeft: PANEL_MARGIN,
        maxLeft,
        minTop: PANEL_MARGIN,
        maxTop
      }
    },
    [anchorRef]
  )

  const clampPosition = useCallback(
    (left: number, top: number): PanelPosition => {
      if (typeof window === 'undefined') {
        return { left, top }
      }
      const width = panelRef.current?.offsetWidth ?? DEFAULT_PANEL_WIDTH
      const height = panelRef.current?.offsetHeight ?? DEFAULT_PANEL_HEIGHT
      const bounds = getPositionBounds(width, height)
      return {
        left: Math.min(Math.max(left, bounds.minLeft), bounds.maxLeft),
        top: Math.min(Math.max(top, bounds.minTop), bounds.maxTop)
      }
    },
    [getPositionBounds]
  )

  const resetPosition = useCallback(() => {
    if (typeof window === 'undefined') {
      setPosition(createInitialPosition())
      return
    }
    const width = panelRef.current?.offsetWidth ?? DEFAULT_PANEL_WIDTH
    const height = panelRef.current?.offsetHeight ?? DEFAULT_PANEL_HEIGHT

    if (anchorRef?.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      const preferredLeft = rect.right - width - PANEL_MARGIN
      const preferredTop = rect.top + rect.height / 2 - height / 2
      setPosition(clampPosition(preferredLeft, preferredTop))
      return
    }

    const preferredLeft = window.innerWidth - width - PANEL_MARGIN
    const preferredTop = Math.max(PANEL_MARGIN, (window.innerHeight - height) / 3)
    setPosition(clampPosition(preferredLeft, preferredTop))
  }, [anchorRef, clampPosition])

  const updateDocumentCursor = useCallback((cursor: 'grabbing' | null) => {
    if (typeof document === 'undefined') {
      return
    }
    document.body.style.cursor = cursor ?? ''
  }, [])

  const startDragSession = useCallback(
    (clientX: number, clientY: number) => {
      dragStateRef.current = {
        active: true,
        startX: clientX,
        startY: clientY,
        initialLeft: position.left,
        initialTop: position.top
      }
      updateDocumentCursor('grabbing')
    },
    [position.left, position.top, updateDocumentCursor]
  )

  const endDragSession = useCallback(() => {
    if (!dragStateRef.current.active) {
      return
    }
    dragStateRef.current.active = false
    updateDocumentCursor(null)
  }, [updateDocumentCursor])

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!dragStateRef.current.active) {
        return
      }
      event.preventDefault()
      const deltaX = event.clientX - dragStateRef.current.startX
      const deltaY = event.clientY - dragStateRef.current.startY
      const nextLeft = dragStateRef.current.initialLeft + deltaX
      const nextTop = dragStateRef.current.initialTop + deltaY
      setPosition(clampPosition(nextLeft, nextTop))
    }

    const handleMouseUp = () => {
      if (!dragStateRef.current.active) {
        return
      }
      endDragSession()
    }

    const handleTouchMove = (event: TouchEvent) => {
      if (!dragStateRef.current.active) {
        return
      }
      const touch = event.touches[0]
      if (!touch) {
        return
      }
      const deltaX = touch.clientX - dragStateRef.current.startX
      const deltaY = touch.clientY - dragStateRef.current.startY
      const nextLeft = dragStateRef.current.initialLeft + deltaX
      const nextTop = dragStateRef.current.initialTop + deltaY
      setPosition(clampPosition(nextLeft, nextTop))
      event.preventDefault()
    }

    const handleTouchEnd = () => {
      if (!dragStateRef.current.active) {
        return
      }
      endDragSession()
    }

    const touchListenerOptions: AddEventListenerOptions = { passive: false }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('touchmove', handleTouchMove, touchListenerOptions)
    window.addEventListener('touchend', handleTouchEnd)
    window.addEventListener('touchcancel', handleTouchEnd)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('touchmove', handleTouchMove, touchListenerOptions)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [clampPosition, endDragSession])

  const handleMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return
      }
      event.preventDefault()
      startDragSession(event.clientX, event.clientY)
    },
    [startDragSession]
  )

  const handleTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (event.touches.length !== 1) {
        return
      }
      const touch = event.touches[0]
      startDragSession(touch.clientX, touch.clientY)
      event.preventDefault()
    },
    [startDragSession]
  )

  useEffect(() => {
    resetPosition()
  }, [assistantId, resetPosition])

  const formatTimestamp = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return '刚刚'
    }
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const loadComments = useCallback(
    async (targetPage = 1) => {
      setLoading(true)
      setError(null)
      try {
        const result = await api.getAssistantComments(assistantId, {
          page: targetPage,
          pageSize: COMMENT_PAGE_SIZE,
          authCode: currentUserCode
        })
        setComments(result.items)
        setTotal(result.total)
        setPage(result.page)
        onTotalChange?.(result.total)
      } catch (err) {
        const message = err instanceof Error ? err.message : '评论加载失败'
        setError(message)
      } finally {
        setLoading(false)
      }
    },
    [api, assistantId, currentUserCode, onTotalChange]
  )

  useEffect(() => {
    setComments([])
    setTotal(0)
    setPage(1)
    setCommentInput('')
    setComposerError(null)
    setError(null)
    setLikePending({})
    setDeletePending({})
    onTotalChange?.(null)
    loadComments(1)
  }, [assistantId, loadComments, onTotalChange])

  const handlePageChange = async (direction: 'prev' | 'next') => {
    if (direction === 'prev' && page > 1) {
      await loadComments(page - 1)
      return
    }
    if (direction === 'next' && page < pageCount) {
      await loadComments(page + 1)
    }
  }

  const handleSubmitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canComment) {
      setComposerError('请先绑定授权码后再评论')
      return
    }
    const trimmed = commentInput.trim()
    if (!trimmed) {
      setComposerError('请输入评论内容')
      return
    }
    setComposerError(null)
    setSubmitting(true)
    try {
      await api.createAssistantComment(assistantId, {
        authCode: currentUserCode ?? '',
        content: trimmed
      })
      setCommentInput('')
      await loadComments(1)
    } catch (err) {
      const message = err instanceof Error ? err.message : '评论发送失败'
      setComposerError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteComment = async (commentId: number) => {
    if (!canComment) {
      setComposerError('请先绑定授权码后再删除评论')
      return
    }
    const confirmed = window.confirm('确定要删除这条评论吗？')
    if (!confirmed) {
      return
    }
    setDeletePending((prev) => ({ ...prev, [commentId]: true }))
    try {
      await api.deleteAssistantComment(assistantId, commentId, currentUserCode ?? '')
      const nextTotal = Math.max(0, total - 1)
      const nextPage = page > 1 && (page - 1) * COMMENT_PAGE_SIZE >= nextTotal ? page - 1 : page
      await loadComments(nextPage || 1)
    } catch (err) {
      const message = err instanceof Error ? err.message : '删除失败'
      setComposerError(message)
    } finally {
      setDeletePending((prev) => {
        const next = { ...prev }
        delete next[commentId]
        return next
      })
    }
  }

  const handleToggleLike = async (commentId: number) => {
    if (!canComment) {
      setComposerError('请先绑定授权码后再点赞')
      return
    }
    setLikePending((prev) => ({ ...prev, [commentId]: true }))
    try {
      const result = await api.toggleAssistantCommentLike(assistantId, commentId, currentUserCode ?? '')
      setComments((prev) =>
        prev.map((comment) =>
          comment.id === commentId
            ? { ...comment, likeCount: result.likeCount, likedByViewer: result.liked }
            : comment
        )
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : '操作失败'
      setComposerError(message)
    } finally {
      setLikePending((prev) => {
        const next = { ...prev }
        delete next[commentId]
        return next
      })
    }
  }

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-neon-blue" />
        </div>
      )
    }
    if (!comments.length) {
      return (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-6 text-center text-sm text-white/60">
          暂无评论，抢先分享你的洞察吧。
        </div>
      )
    }
    return (
      <div className="space-y-3">
        {comments.map((comment) => (
          <div key={comment.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between text-xs text-white/50">
              <div>
                <p className="text-sm font-semibold text-white">{comment.authorDisplayName}</p>
                <p className="text-[10px] text-white/40">{comment.authorCodeMasked}</p>
              </div>
              <span>{formatTimestamp(comment.updatedAt)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-white/80">{comment.content}</p>
            <div className="mt-3 flex items-center justify-between text-xs text-white/60">
              <button
                type="button"
                onClick={() => handleToggleLike(comment.id)}
                disabled={likePending[comment.id]}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition ${
                  comment.likedByViewer ? 'border-neon-blue/60 text-neon-blue' : 'border-white/15 hover:border-neon-blue/40 hover:text-white'
                } ${likePending[comment.id] ? 'opacity-60' : ''}`}
              >
                <ThumbsUp className="h-3.5 w-3.5" />
                {comment.likeCount}
              </button>
              {comment.canDelete && (
                <button
                  type="button"
                  disabled={deletePending[comment.id]}
                  onClick={() => handleDeleteComment(comment.id)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition ${
                    deletePending[comment.id]
                      ? 'border-white/10 text-white/40'
                      : 'border-white/15 hover:border-rose-400/60 hover:text-white'
                  }`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      ref={panelRef}
      className="fixed z-[80] w-full max-w-[360px] text-white"
      style={{ left: position.left, top: position.top }}
    >
      <div className="rounded-[28px] border border-white/10 bg-[#0b1426]/90 p-4 text-white shadow-[0_25px_80px_rgba(3,7,18,0.65)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-2">
          <div
            className="flex cursor-grab select-none touch-none items-center gap-2 text-white/65 active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
          >
            <Move className="h-4 w-4 text-white/40" />
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-white/45">Comment Board</p>
              <h3 className="text-lg font-semibold text-white">评论区</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 p-1.5 text-white/60 transition hover:border-white/40 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 max-h-[420px] overflow-y-auto pr-1">
          {renderContent()}
        </div>

        {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}

        <div className="mt-3 flex items-center justify-between text-xs text-white/50">
          <span>
            第 {page} / {pageCount} 页
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading || page === 1}
              onClick={() => handlePageChange('prev')}
              className="rounded-full border border-white/15 px-3 py-1 transition hover:border-white/40 disabled:opacity-40"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={loading || page === pageCount || !comments.length}
              onClick={() => handlePageChange('next')}
              className="rounded-full border border-white/15 px-3 py-1 transition hover:border-white/40 disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmitComment} className="mt-4 space-y-2">
          <textarea
            value={commentInput}
            onChange={(event) => setCommentInput(event.target.value)}
            maxLength={800}
            disabled={!canComment || submitting}
            placeholder={canComment ? '分享你的灵感或使用体验' : '绑定授权码后可发表评论'}
            className="h-28 w-full resize-none rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-neon-blue/60 focus:bg-white/10 disabled:opacity-50"
          />
          <div className="flex items-center justify-between text-xs text-white/50">
            <span>{commentInput.length}/800</span>
            <button
              type="submit"
              disabled={!canComment || submitting || !commentInput.trim()}
              className={`inline-flex items-center gap-1 rounded-2xl border px-4 py-1.5 text-sm font-medium transition ${
                !canComment || submitting || !commentInput.trim()
                  ? 'border-white/10 text-white/40'
                  : 'border-neon-blue/50 bg-neon-blue/20 text-white hover:bg-neon-blue/30'
              }`}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              发送
            </button>
          </div>
          {composerError && <p className="text-xs text-rose-300">{composerError}</p>}
        </form>
      </div>
    </div>
  )
}
