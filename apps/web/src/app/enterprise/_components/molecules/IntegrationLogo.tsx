import { cn } from '@/lib/utils'
import { GlowDot } from '../atoms/GlowDot'

interface IntegrationLogoProps {
  name: string
  desc: string
  status: 'active' | 'soon'
  className?: string
}

export function IntegrationLogo({ name, desc, status, className }: IntegrationLogoProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 text-center',
        'transition-colors duration-200 hover:border-zinc-700',
        status === 'soon' && 'opacity-50',
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <GlowDot color={status === 'active' ? 'amber' : 'zinc'} />
        <span className="text-sm font-bold text-zinc-200">{name}</span>
      </div>
      <span className="text-xs text-zinc-500">{desc}</span>
      {status === 'soon' && (
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">Próximamente</span>
      )}
    </div>
  )
}
