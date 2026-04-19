/**
 * Copia local para el showcase Aurora — mismo contrato que `@/components/ui/glass-card`.
 * Permite iterar el rediseño sin tocar la app principal.
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverEffect?: boolean
}

const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, hoverEffect = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'relative overflow-hidden rounded-2xl transition-all duration-300',
          'bg-white/70 dark:bg-black/40 backdrop-blur-xl border border-border dark:border-white/10 shadow-xl dark:shadow-2xl',
          hoverEffect &&
            'hover:border-primary/30 hover:bg-white/90 dark:hover:bg-white/[0.05] hover:shadow-2xl',
          className
        )}
        {...props}
      >
        <div
          className="pointer-events-none absolute top-0 right-0 -z-10 h-32 w-32 blur-3xl opacity-20 transition-colors"
          style={{ backgroundColor: 'var(--theme-primary, currentColor)' }}
        />
        {children}
      </div>
    )
  }
)
GlassCard.displayName = 'GlassCard'

export { GlassCard }
