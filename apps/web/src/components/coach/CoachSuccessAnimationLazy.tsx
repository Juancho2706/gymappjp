'use client'

import dynamic from 'next/dynamic'

const SuccessAnimationProvider = dynamic(
    () =>
        import('@/components/SuccessAnimationProvider').then((m) => ({
            default: m.SuccessAnimationProvider,
        })),
    { ssr: false }
)

/** Carga el overlay de nutrición solo en cliente (no usar `dynamic` + `ssr: false` en Server Components). */
export function CoachSuccessAnimationLazy() {
    return <SuccessAnimationProvider />
}
