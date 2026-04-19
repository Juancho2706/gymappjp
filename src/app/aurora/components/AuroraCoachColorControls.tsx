'use client'

import { cn } from '@/lib/utils'
import { AURORA_COLOR_PRESETS } from '@/app/aurora/lib/aurora-brand'

export function AuroraCoachColorControls({
  value,
  onChange,
  className,
  pageTheme = 'dark',
}: {
  value: string
  onChange: (hex: string) => void
  className?: string
  pageTheme?: 'light' | 'dark'
}) {
  const isLight = pageTheme === 'light'
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center', className)}>
      <span
        className={cn(
          'font-mono text-[10px] font-semibold uppercase tracking-[0.15em]',
          isLight ? 'text-zinc-600' : 'text-[color:rgba(200,200,210,0.75)]'
        )}
      >
        Color marca coach
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {AURORA_COLOR_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            title={p.label}
            onClick={() => onChange(p.hex)}
            className={cn(
              'h-9 w-9 rounded-full border-2 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2',
              isLight ? 'focus-visible:ring-zinc-400' : 'focus-visible:ring-white/40',
              value.toUpperCase() === p.hex.toUpperCase()
                ? isLight
                  ? 'border-zinc-900 ring-2 ring-zinc-400/50'
                  : 'border-white ring-2 ring-white/30'
                : isLight
                  ? 'border-zinc-300'
                  : 'border-white/20'
            )}
            style={{ background: p.hex, boxShadow: `0 0 20px ${p.hex}55` }}
          />
        ))}
        <label
          className={cn(
            'ml-1 flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider backdrop-blur-sm',
            isLight
              ? 'border-zinc-200 bg-white/80 text-zinc-700 hover:bg-white'
              : 'border-white/15 bg-white/5 text-[color:rgba(200,200,210,0.9)] hover:bg-white/10'
          )}
        >
          <span>Otro</span>
          <input
            type="color"
            value={/^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#7B5CFF'}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
            aria-label="Elegir color personalizado"
          />
        </label>
      </div>
    </div>
  )
}
