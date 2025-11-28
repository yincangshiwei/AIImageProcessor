import { Link, useLocation } from 'react-router-dom'
import { Wand2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ModeNavigationTab } from '../types/navigation'

type ModeNavigationPanelProps = {
  modes: ModeNavigationTab[]
  className?: string
  studioLabel?: string
  title?: string
  description?: string
  modeLabel?: string
  badgeText?: string
  titleIcon?: LucideIcon
}

export default function ModeNavigationPanel({
  modes,
  className = '',
  studioLabel = 'Aether Studio',
  title = 'AI 图像处理器',
  description = '选择模式，上传图片，输入描述，创造令人惊叹的AI图像',
  modeLabel = 'Mode Matrix',
  badgeText = 'Multi-Verse',
  titleIcon: TitleIcon = Wand2
}: ModeNavigationPanelProps) {
  const location = useLocation()

  return (
    <section className={`relative mb-10 ${className}`}>
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 rounded-[52px] bg-gradient-to-r from-[#37b7ff]/45 via-[#8f5bff]/35 to-transparent blur-[120px]" />
        <div className="absolute inset-x-10 -top-10 h-32 bg-gradient-to-r from-[#93f5ff]/35 via-transparent to-[#c084fc]/40 blur-3xl" />
        <div className="absolute inset-x-6 bottom-0 h-24 bg-gradient-to-t from-[#6d28d9]/20 via-transparent to-transparent blur-[90px]" />
      </div>
      <div className="relative overflow-hidden rounded-[42px] border border-white/10 bg-gradient-to-br from-[#070b16]/95 via-[#0d1424]/90 to-[#05070f]/95 px-6 sm:px-8 py-8 shadow-[0_35px_120px_rgba(2,8,39,0.65)]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent opacity-70" />
        <div className="absolute inset-6 rounded-[34px] border border-white/5" />
        <div className="relative flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
          <div>
            {studioLabel && (
              <p className="text-[11px] uppercase tracking-[0.75em] text-white/50 mb-4">
                {studioLabel}
              </p>
            )}
            <h1 className="text-3xl font-bold mb-2 flex items-center">
              {TitleIcon && <TitleIcon className="w-8 h-8 text-neon-blue mr-3" />}
              {title}
            </h1>
            {description && <p className="text-gray-400 max-w-xl">{description}</p>}
          </div>

          <div className="w-full lg:max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] uppercase tracking-[0.6em] text-white/50">
                {modeLabel}
              </p>
              {badgeText && (
                <span className="text-[11px] uppercase tracking-[0.45em] text-white/30">
                  {badgeText}
                </span>
              )}
            </div>
            <div className="relative">
              <div className="pointer-events-none absolute -inset-5 rounded-[38px] bg-gradient-to-r from-[#5ddcff]/35 via-[#7b61ff]/25 to-transparent blur-[80px]" />
              <div className="relative flex flex-wrap gap-3 rounded-[34px] border border-white/10 bg-white/5 px-3 py-3 backdrop-blur-3xl">
                {modes.map(mode => {
                  const Icon = mode.icon
                  const isActive = location.pathname.startsWith(mode.route)

                  return (
                    <Link
                      key={mode.key}
                      to={mode.route}
                      className="group relative flex-1 min-w-[180px]"
                    >
                      <div
                        className={`absolute inset-0 rounded-[26px] bg-gradient-to-br ${mode.accentGradient} opacity-0 transition duration-500 group-hover:opacity-80 group-hover:blur-xl`}
                      />
                      <div
                        className={`relative flex items-center gap-4 rounded-[26px] border border-white/15 bg-white/5 px-5 py-4 backdrop-blur-2xl transition-all duration-500 ${
                          isActive
                            ? 'border-white/40 shadow-[0_22px_55px_rgba(79,115,255,0.35)]'
                            : 'hover:border-white/30 hover:bg-white/10'
                        }`}
                      >
                        <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                          <span
                            className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${mode.accentGradient} blur-xl transition ${
                              isActive ? 'opacity-90' : 'opacity-0 group-hover:opacity-70'
                            }`}
                          />
                          <Icon className="relative z-10 h-5 w-5 text-white" />
                        </div>
                        <div className="text-left">
                          <p className="text-base font-semibold text-white">{mode.label}</p>
                          <p className="text-[10px] uppercase tracking-[0.45em] text-white/60">
                            {mode.description}
                          </p>
                        </div>
                      </div>
                      {isActive && (
                        <span className="pointer-events-none absolute -bottom-1 left-10 right-10 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
