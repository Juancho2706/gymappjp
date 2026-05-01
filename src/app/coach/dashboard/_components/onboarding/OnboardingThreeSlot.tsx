'use client'

import dynamic from 'next/dynamic'
import { useLayoutEffect, useState } from 'react'

const OnboardingThreeRibbonInner = dynamic(
    () =>
        import('./OnboardingThreeRibbonInner').then((m) => ({
            default: m.OnboardingThreeRibbonInner,
        })),
    {
        ssr: false,
        loading: () => (
            <div
                className="h-24 w-full animate-pulse rounded-xl border border-[color:var(--theme-primary)]/15 bg-muted/25 md:h-28"
                aria-hidden
            />
        ),
    }
)

function StaticRibbonFallback() {
    return (
        <div
            className="h-24 w-full rounded-xl border border-[color:var(--theme-primary)]/20 bg-gradient-to-r from-[color:var(--theme-primary)]/12 via-muted/25 to-[color:var(--theme-primary)]/10 md:h-28"
            aria-hidden
        />
    )
}

/**
 * V6: Three solo en `md+` y sin reduced motion; móvil / reduced → gradiente estático (§4.2 V6, §5).
 */
export function OnboardingThreeSlot() {
    const [useWebGl, setUseWebGl] = useState(false)

    useLayoutEffect(() => {
        const mqMd = window.matchMedia('(min-width: 768px)')
        const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)')
        const sync = () => {
            setUseWebGl(mqMd.matches && !mqReduce.matches)
        }
        sync()
        mqMd.addEventListener('change', sync)
        mqReduce.addEventListener('change', sync)
        return () => {
            mqMd.removeEventListener('change', sync)
            mqReduce.removeEventListener('change', sync)
        }
    }, [])

    return (
        <div className="hidden md:block" aria-hidden>
            {useWebGl ? <OnboardingThreeRibbonInner /> : <StaticRibbonFallback />}
        </div>
    )
}
