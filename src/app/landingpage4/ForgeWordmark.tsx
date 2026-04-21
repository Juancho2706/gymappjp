import { cn } from '@/lib/utils'

const sizeClasses = {
    header: 'text-lg font-black tracking-tight sm:text-xl',
    footer: 'text-base font-black tracking-tight',
    compact: 'text-sm font-black tracking-tight',
} as const

export function ForgeWordmark({
    size,
    className,
    withSubtitle = true,
}: {
    size: keyof typeof sizeClasses
    className?: string
    /** Subtítulo mono "FORGE" bajo EVA (solo header suele llevarlo). */
    withSubtitle?: boolean
}) {
    return (
        <span className={cn('flex flex-col leading-none', className)}>
            <span
                className={cn(
                    'forge-font-display bg-gradient-to-r from-[var(--forge-ink)] via-[var(--forge-accent)] to-[var(--forge-ink-2)] bg-clip-text text-transparent',
                    sizeClasses[size]
                )}
            >
                EVA
            </span>
            {withSubtitle ? (
                <span className="forge-font-mono mt-0.5 text-[9px] uppercase tracking-[0.22em] text-[var(--forge-muted)]">FORGE</span>
            ) : null}
        </span>
    )
}
