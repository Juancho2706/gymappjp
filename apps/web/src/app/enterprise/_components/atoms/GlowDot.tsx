import { cn } from '@/lib/utils'

interface GlowDotProps {
  className?: string
  color?: 'blue' | 'green' | 'zinc' | 'amber'
}

export function GlowDot({ className, color = 'blue' }: GlowDotProps) {
  return (
    <span
      className={cn(
        'relative inline-flex h-2 w-2 rounded-full',
        color === 'blue' && 'bg-[#007AFF]',
        color === 'amber' && 'bg-amber-400',
        color === 'green' && 'bg-emerald-400',
        color === 'zinc' && 'bg-zinc-400',
        className,
      )}
    >
      <span
        className={cn(
          'absolute inset-0 rounded-full animate-ping opacity-75',
          color === 'blue' && 'bg-[#007AFF]',
          color === 'amber' && 'bg-amber-400',
          color === 'green' && 'bg-emerald-400',
        )}
      />
    </span>
  )
}
