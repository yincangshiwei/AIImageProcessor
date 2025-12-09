import { useState, useEffect, ChangeEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { maskAuthCode } from '../utils/authUtils'
import { apiService } from '../services/api'
import type { LucideIcon } from 'lucide-react'
import {
  Home,
  Image,
  History,
  Bot,
  LogOut,
  Coins,
  Shield,
  User2,
  Phone,
  PenSquare,
  Loader2,
  X,
  Menu
} from 'lucide-react'

interface NavBarProps {
  className?: string
}

type DetailFormState = {
  contactName: string
  creatorName: string
  phoneNumber: string
}

const TEAM_ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  member: '普通成员'
}

const getTeamRoleLabel = (role?: string | null) => {
  if (!role) {
    return '未指定'
  }
  return TEAM_ROLE_LABELS[role] ?? '普通成员'
}

export default function NavBar({ className = '' }: NavBarProps) {
  const { user, logout, refreshUserInfo } = useAuth()
  const location = useLocation()
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailForm, setDetailForm] = useState<DetailFormState>({
    contactName: '',
    creatorName: '',
    phoneNumber: ''
  })
  const [detailSaving, setDetailSaving] = useState(false)
  const [detailMessage, setDetailMessage] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [isCompactMode, setIsCompactMode] = useState(false)
  const [isNavVisible, setIsNavVisible] = useState(true)

  const totalCredits = user?.availableCredits ?? user?.credits ?? 0
  const teamCredits = user?.teamCredits ?? 0
  const personalCredits = user?.credits ?? 0

  const navigation = [
    { name: '主页', path: '/dashboard', icon: Home },
    { name: '图像', path: '/editor/multi', icon: Image },
    { name: '助手', path: '/assistants', icon: Bot },
    { name: '历史', path: '/history', icon: History }
  ]

  useEffect(() => {
    if (!user) {
      setDetailForm({ contactName: '', creatorName: '', phoneNumber: '' })
      return
    }
    setDetailForm({
      contactName: user.contactName ?? '',
      creatorName: user.creatorName ?? '',
      phoneNumber: user.phoneNumber ?? ''
    })
  }, [user?.contactName, user?.creatorName, user?.phoneNumber, user])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleResize = () => {
      const shouldCompact = window.innerWidth < 1024
      setIsCompactMode((prev) => {
        if (prev !== shouldCompact) {
          setIsNavVisible(!shouldCompact)
        }
        return shouldCompact
      })
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  const isActive = (path: string) => {
    if (path.startsWith('/editor')) {
      return location.pathname.startsWith('/editor')
    }
    return location.pathname === path
  }

  const handleDetailFieldChange = (field: keyof DetailFormState, value: string) => {
    setDetailForm((prev) => ({
      ...prev,
      [field]: value
    }))
  }

  const handleDetailOpen = () => {
    setDetailMessage(null)
    setDetailError(null)
    setDetailOpen(true)
  }

  const handleSaveDetails = async () => {
    if (!user) {
      return
    }
    setDetailSaving(true)
    setDetailMessage(null)
    setDetailError(null)
    try {
      await apiService.updateAuthCodeProfile(user.code, {
        contactName: detailForm.contactName,
        creatorName: detailForm.creatorName,
        phoneNumber: detailForm.phoneNumber
      })
      await refreshUserInfo()
      setDetailMessage('授权码信息已更新')
    } catch (error) {
      console.error('Failed to update auth profile', error)
      setDetailError(error instanceof Error ? error.message : '保存失败，请稍后重试')
    } finally {
      setDetailSaving(false)
    }
  }

  const shouldShowOverlay = isCompactMode && isNavVisible
  const toggleNavVisibility = () => setIsNavVisible((prev) => !prev)
  const closeNav = () => setIsNavVisible(false)

  if (!user) return null

  return (
    <>
      {isCompactMode && (
        <button
          type="button"
          onClick={toggleNavVisibility}
          aria-label={isNavVisible ? '收起导航栏' : '展开导航栏'}
          aria-expanded={isNavVisible}
          className={`fixed left-4 top-4 z-40 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-white shadow-[0_12px_40px_rgba(3,7,25,0.65)] backdrop-blur-xl transition-transform duration-300 ${
            isNavVisible ? 'translate-x-24' : 'translate-x-0'
          }`}
        >
          {isNavVisible ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      )}

      {shouldShowOverlay && <div className="fixed inset-0 z-20 bg-slate-950/70 backdrop-blur-sm" onClick={closeNav} />}

      <nav
        className={`fixed left-0 top-0 z-30 h-screen w-[100px] border-r border-white/5 bg-slate-950/70 px-3 py-6 backdrop-blur-2xl transition-transform duration-300 ease-out ${
          isCompactMode ? (isNavVisible ? 'translate-x-0 shadow-[0_25px_70px_rgba(3,5,23,0.65)]' : '-translate-x-full') : 'translate-x-0'
        } ${className}`}
        role="navigation"
        aria-label="侧边导航"
        data-compact={isCompactMode}
      >
      <div className="flex h-full flex-col items-center">
        <div className="text-center text-white">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-neon-blue via-neon-purple to-neon-pink text-lg font-semibold">
            AI
          </div>
          <p className="mt-3 text-[10px] uppercase tracking-[0.45em] text-gray-400">AI</p>
          <p className="text-xs font-semibold text-white">创作平台</p>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          {navigation.map((item) => {
            const Icon = item.icon
            const active = isActive(item.path)
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center text-[11px] font-medium transition-colors duration-200 ${
                  active ? 'text-white' : 'text-gray-500 hover:text-white'
                }`}
                onClick={isCompactMode ? closeNav : undefined}
              >
                <Icon
                  className={`h-5 w-5 transition-colors ${
                    active ? 'text-neon-blue drop-shadow-[0_0_8px_rgba(14,165,233,0.6)]' : 'text-gray-500'
                  }`}
                />
                <span className="mt-1">{item.name}</span>
              </Link>
            )
          })}
        </div>

        <div className="mb-6 flex flex-col items-center gap-4 text-white">
          <div className="flex flex-col items-center gap-1">
            <Coins className="h-5 w-5 text-neon-green" />
            <span className="text-sm font-semibold text-neon-green">{totalCredits}</span>
            <span className="text-[10px] text-white/60">团队 {teamCredits} · 个人 {personalCredits}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              handleDetailOpen()
              if (isCompactMode) {
                closeNav()
              }
            }}
            className="flex w-full flex-col items-center gap-1 rounded-2xl border border-white/10 bg-white/5 px-2 py-2 text-center text-white/80 transition hover:border-neon-blue/60 hover:bg-white/10"
            title="点击查看授权码详情"
          >
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.35em] text-white/45">
              <Shield className="h-4 w-4 text-neon-blue" />
              授权码
            </div>
            <div className="flex items-center gap-1 text-xs font-semibold text-white">
              <User2 className="h-3.5 w-3.5 text-white/60" />
              <span className="truncate max-w-[80px]">{user.creatorName?.trim() || '未定义'}</span>
            </div>
            <p className="text-[11px] font-mono text-gray-200">{maskAuthCode(user.code)}</p>
            <span className="text-[10px] text-neon-blue/80">点击查看详情</span>
          </button>
          <button
            onClick={logout}
            className="flex flex-col items-center text-[11px] text-gray-500 transition-colors duration-200 hover:text-red-400"
            title="退出登录"
          >
            <LogOut className="h-5 w-5" />
            <span className="mt-1">退出</span>
          </button>
        </div>
      </div>
      </nav>
      {detailOpen && user && (
        <AuthCodeDetailDialog
          open={detailOpen}
          form={detailForm}
          onClose={() => {
            setDetailOpen(false)
            setDetailMessage(null)
            setDetailError(null)
          }}
          onChange={handleDetailFieldChange}
          onSave={handleSaveDetails}
          saving={detailSaving}
          message={detailMessage}
          error={detailError}
          maskedCode={maskAuthCode(user.code)}
          creatorLabel={user.creatorName?.trim() || '未定义'}
          teamName={user.teamDisplayName ?? user.teamName ?? null}
          teamRole={user.teamRole ?? null}
          teamCredits={user.teamCredits ?? 0}
          personalCredits={user.credits ?? 0}
          availableCredits={user.availableCredits ?? user.credits ?? 0}
        />
      )}
    </>
  )
}

interface AuthCodeDetailDialogProps {
  open: boolean
  form: DetailFormState
  onClose: () => void
  onChange: (field: keyof DetailFormState, value: string) => void
  onSave: () => void
  saving: boolean
  message: string | null
  error: string | null
  maskedCode: string
  creatorLabel: string
  teamName?: string | null
  teamRole?: string | null
  teamCredits: number
  personalCredits: number
  availableCredits: number
}

function AuthCodeDetailDialog({
  open,
  form,
  onClose,
  onChange,
  onSave,
  saving,
  message,
  error,
  maskedCode,
  creatorLabel,
  teamName,
  teamRole,
  teamCredits,
  personalCredits,
  availableCredits
}: AuthCodeDetailDialogProps) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-[#050b16]/95 p-6 text-white shadow-[0_30px_120px_rgba(5,10,30,0.7)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.35em] text-white/50">授权码详情</p>
            <h3 className="mt-2 text-xl font-semibold">{creatorLabel}</h3>
            <p className="text-xs text-white/60">{maskedCode}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 p-2 text-white/70 transition hover:border-white/40 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <DetailInputField
            label="姓名"
            icon={User2}
            value={form.contactName}
            placeholder="请输入真实姓名"
            onChange={(event) => onChange('contactName', event.target.value)}
          />
          <DetailInputField
            label="创作者名称"
            icon={PenSquare}
            value={form.creatorName}
            placeholder="品牌/工作室名称"
            onChange={(event) => onChange('creatorName', event.target.value)}
          />
          <DetailInputField
            label="手机号"
            icon={Phone}
            value={form.phoneNumber}
            placeholder="用于联系的手机号"
            onChange={(event) => onChange('phoneNumber', event.target.value)}
          />
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.35em] text-white/45">可用积分</p>
            <p className="mt-2 text-2xl font-semibold text-white">{availableCredits}</p>
            <p className="text-xs text-white/60">团队 {teamCredits} · 个人 {personalCredits}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.35em] text-white/45">所属团队</p>
            <p className="mt-2 text-base font-semibold text-white">{teamName ?? '未分配团队'}</p>
            <p className="text-xs text-white/60">团队角色：{getTeamRoleLabel(teamRole)}</p>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-2xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p>
        )}
        {message && !error && (
          <p className="mt-4 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{message}</p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:border-white/40 hover:text-white"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium transition ${
              saving
                ? 'border-white/10 bg-white/10 text-white/50'
                : 'border-neon-blue/60 bg-neon-blue/20 text-white hover:bg-neon-blue/30'
            }`}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? '保存中...' : '保存详情'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface DetailInputFieldProps {
  label: string
  icon: LucideIcon
  value: string
  placeholder?: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}

function DetailInputField({ label, icon: Icon, value, placeholder, onChange }: DetailInputFieldProps) {
  return (
    <label className="space-y-2 text-sm text-white/80">
      <span className="text-[10px] uppercase tracking-[0.35em] text-white/45">{label}</span>
      <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-3 py-2 focus-within:border-neon-blue/60">
        <Icon className="h-4 w-4 text-white/50" />
        <input
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
        />
      </div>
    </label>
  )
}
