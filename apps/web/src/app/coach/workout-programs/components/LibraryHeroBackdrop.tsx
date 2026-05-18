'use client'

/**
 * Decorative layer for the program library hero (coach theme via --theme-primary-rgb).
 * Softer and more section-local than the global coach layout blobs.
 */
export function LibraryHeroBackdrop() {
    return (
        <div
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
            aria-hidden
        >
            {/* Primary wash — biased to upper area, not same corner weight as layout glow */}
            <div
                className="absolute left-[35%] top-[-55%] h-[min(420px,100vw)] w-[min(480px,110vw)] -translate-x-1/2 rounded-full opacity-[0.12] blur-3xl dark:opacity-[0.07]"
                style={{
                    background:
                        'radial-gradient(ellipse at center, rgb(var(--theme-primary-rgb) / 0.55) 0%, transparent 68%)',
                }}
            />
            <div
                className="absolute -right-[5%] top-[-35%] h-[min(360px,85vw)] w-[min(400px,90vw)] rounded-full opacity-[0.09] blur-3xl dark:opacity-[0.05]"
                style={{
                    background:
                        'radial-gradient(ellipse at 30% 40%, rgb(var(--theme-primary-rgb) / 0.35) 0%, transparent 65%)',
                }}
            />
            {/* Cool secondary hint (theme-agnostic, very low) */}
            <div className="absolute right-[10%] top-[-20%] h-[200px] w-[280px] rounded-full bg-violet-500/10 blur-3xl dark:bg-violet-400/5" />
        </div>
    )
}
