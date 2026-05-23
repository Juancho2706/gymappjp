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
        variant === 'default' && 'border border-amber-500/30 bg-amber-500/10 text-amber-400',
        variant === 'outline' && 'border border-amber-400/50 text-amber-400',
        variant === 'solid' && 'bg-amber-500 text-zinc-950',
        className,
      )}
    >
      {children}
    </span>
  )
}
