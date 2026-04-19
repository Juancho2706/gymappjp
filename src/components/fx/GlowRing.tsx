import { cn } from '@/lib/utils'

type Props = {
  children: React.ReactNode
  active?: boolean
  intensity?: 'subtle' | 'strong'
  className?: string
}

/**
 * Concept A — Kinetic Obsidian
 * Anillo de glow que usa --theme-primary-rgb. Para focus/hover/drop-zones.
 * Se monta sobre cualquier hijo sin afectar layout (pointer-events:none).
 */
export function GlowRing({ children, active = false, intensity = 'subtle', className }: Props) {
  return (
    <div className={cn('relative', className)}>
      {children}
      {active && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
          style={{
            boxShadow:
              intensity === 'strong'
                ? '0 0 0 1px rgba(var(--theme-primary-rgb), 0.5), 0 0 24px -2px rgba(var(--theme-primary-rgb), 0.55), inset 0 0 20px -8px rgba(var(--theme-primary-rgb), 0.3)'
                : '0 0 0 1px rgba(var(--theme-primary-rgb), 0.25), 0 0 16px -4px rgba(var(--theme-primary-rgb), 0.35)',
          }}
        />
      )}
    </div>
  )
}
