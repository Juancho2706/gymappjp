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
        'flex flex-col items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-white p-5 text-center',
        'transition-all duration-200 hover:border-[#007AFF]/20 hover:shadow-[0_4px_16px_rgba(0,122,255,0.06)]',
        status === 'soon' && 'opacity-50',
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <GlowDot color={status === 'active' ? 'green' : 'zinc'} />
        <span className="text-sm font-bold text-gray-800">{name}</span>
      </div>
      <span className="text-xs text-gray-400">{desc}</span>
      {status === 'soon' && (
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-300">Próximamente</span>
      )}
    </div>
  )
}
