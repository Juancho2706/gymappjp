'use client'

import dynamic from 'next/dynamic'
import { useRef } from 'react'
import { useTheme } from 'next-themes'
import type { ForgeChapterRef } from './ForgeScrollChapterBridge'
import { ForgeScrollChapterBridge } from './ForgeScrollChapterBridge'
import { ForgeHeader } from './ForgeHeader'
import { ForgeCtaFooter } from './sections/ForgeCtaFooter'
import { ForgeFaq } from './sections/ForgeFaq'
import { ForgeHero } from './sections/ForgeHero'
import { ForgePricing } from './sections/ForgePricing'
import { ForgeProductSections } from './sections/ForgeProductSections'

const ForgeBackdropThree = dynamic(() => import('./ForgeBackdropThree').then((m) => ({ default: m.ForgeBackdropThree })), {
    ssr: false,
    loading: () => <div className="pointer-events-none fixed inset-0 z-0 bg-[var(--forge-bg)]" aria-hidden />,
})

export function LandingPage4Client() {
    const { resolvedTheme } = useTheme()
    const threeTheme = resolvedTheme === 'dark' ? 'dark' : 'light'
    const chapterRef = useRef<ForgeChapterRef>({ target: 0, smooth: 0 })

    return (
        <>
            <a
                href="#contenido"
                className="forge-font-mono sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[300] focus:rounded-md focus:border focus:border-[var(--forge-border)] focus:bg-[var(--forge-surface)] focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:uppercase focus:text-[var(--forge-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forge-accent)]"
            >
                Saltar al contenido
            </a>
            <ForgeBackdropThree theme={threeTheme} chapterRef={chapterRef} />
            <ForgeScrollChapterBridge chapterRef={chapterRef} />
            <div className="relative z-10">
                <ForgeHeader />
                <main id="contenido" className="min-h-dvh">
                    <ForgeHero />
                    <ForgeProductSections />
                    <ForgePricing />
                    <ForgeFaq />
                    <ForgeCtaFooter />
                </main>
            </div>
        </>
    )
}
