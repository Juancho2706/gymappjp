import { cn } from '@/lib/utils'

interface GlowDotProps {
  className?: string
  color?: 'amber' | 'green' | 'zinc'
}

export function GlowDot({ className, color = 'amber' }: GlowDotProps) {
  return (
    <span
      className={cn(
        'relative inline-flex h-2 w-2 rounded-full',
        color === 'amber' && 'bg-amber-400',
        color === 'green' && 'bg-emerald-400',
        color === 'zinc' && 'bg-zinc-500',
        className,
      )}
    >
      <span
        className={cn(
          'absolute inset-0 rounded-full animate-ping opacity-75',
          color === 'amber' && 'bg-amber-400',
          color === 'green' && 'bg-emerald-400',
        )}
      />
    </span>
  )
}
