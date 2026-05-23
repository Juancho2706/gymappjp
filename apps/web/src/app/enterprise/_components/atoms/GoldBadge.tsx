import { cn } from '@/lib/utils'

interface GoldBadgeProps {
  children: React.ReactNode
  className?: string
  variant?: 'default' | 'outline' | 'solid'
}

export function GoldBadge({ children, className, variant = 'default' }: GoldBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]',
        variant === 'default' && 'border border-[#007AFF]/30 bg-[#007AFF]/10 text-[#007AFF]',
        variant === 'outline' && 'border border-[#007AFF]/50 text-[#007AFF]',
        variant === 'solid' && 'bg-[#007AFF] text-white',
        className,
      )}
    >
      {children}
    </span>
  )
}
