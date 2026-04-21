'use client'

import type { MutableRefObject } from 'react'
import { useEffect, useRef } from 'react'

const SECTION_IDS = ['top', 'rutinas', 'nutricion', 'alumnos', 'marca', 'planes', 'faq'] as const

export type ForgeChapterRef = { target: number; smooth: number }

/**
 * Actualiza `chapterRef.current.target` (0..5) según la sección más relevante en viewport.
 * `smooth` lo consume ForgeBackdropThree en el loop de animación.
 */
export function ForgeScrollChapterBridge({ chapterRef }: { chapterRef: MutableRefObject<ForgeChapterRef> }) {
    const rafRef = useRef<number | null>(null)

    useEffect(() => {
        const compute = () => {
            const vh = window.innerHeight
            const focusY = vh * 0.38
            let bestIdx = 0
            let bestScore = -1e9

            SECTION_IDS.forEach((id, i) => {
                const el = document.getElementById(id)
                if (!el) return
                const r = el.getBoundingClientRect()
                const visibleH = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0))
                const visible = visibleH / Math.max(1, Math.min(vh, r.height))
                const center = (r.top + r.bottom) / 2
                const centerDist = Math.abs(center - focusY)
                const score = visible * 120 - centerDist * 0.12
                if (score > bestScore) {
                    bestScore = score
                    bestIdx = i
                }
            })

            chapterRef.current.target = Math.min(5, bestIdx)
        }

        const onScroll = () => {
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
            rafRef.current = requestAnimationFrame(compute)
        }

        window.addEventListener('scroll', onScroll, { passive: true })
        window.addEventListener('resize', onScroll, { passive: true })
        compute()

        return () => {
            window.removeEventListener('scroll', onScroll)
            window.removeEventListener('resize', onScroll)
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
        }
    }, [chapterRef])

    return null
}
