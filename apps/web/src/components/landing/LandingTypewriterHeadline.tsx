'use client'

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useTranslation } from '@/lib/i18n/LanguageContext'

const SPEED_MS = 52
const DELETE_MS = 34
const PAUSE_TYPED_MS = 2600
const PAUSE_EMPTY_MS = 450

const SUFFIX_KEYS = [
    'landing.typewriter.s0',
    'landing.typewriter.s1',
    'landing.typewriter.s2',
    'landing.typewriter.s4',
    'landing.typewriter.s5',
    'landing.typewriter.s6',
    'landing.typewriter.s7',
    'landing.typewriter.s8',
    'landing.typewriter.s9',
] as const

export function LandingTypewriterHeadline({ className }: { className?: string }) {
    const { t } = useTranslation()
    const reduce = useReducedMotion()
    const lines = SUFFIX_KEYS.map((k) => t(k))
    const [lineIdx, setLineIdx] = useState(0)
    const [charIdx, setCharIdx] = useState(0)
    const [deleting, setDeleting] = useState(false)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const line = lines[lineIdx % lines.length] ?? ''
    useEffect(() => {
        if (reduce) return

        const clear = () => {
            if (timerRef.current) clearTimeout(timerRef.current)
            timerRef.current = null
        }

        if (!deleting) {
            if (charIdx < line.length) {
                timerRef.current = setTimeout(() => setCharIdx((c) => c + 1), SPEED_MS)
            } else {
                timerRef.current = setTimeout(() => setDeleting(true), PAUSE_TYPED_MS)
            }
        } else {
            if (charIdx > 0) {
                timerRef.current = setTimeout(() => setCharIdx((c) => c - 1), DELETE_MS)
            } else {
                timerRef.current = setTimeout(() => {
                    setLineIdx((i) => (i + 1) % lines.length)
                    setDeleting(false)
                }, PAUSE_EMPTY_MS)
            }
        }

        return clear
    }, [reduce, deleting, charIdx, line, line.length, lines.length])

    if (reduce) {
        return (
            <span className={className}>
                <span className="text-foreground">{lines[0]}</span>
            </span>
        )
    }

    const visible = line.slice(0, charIdx)
    const fullPrefix = `${t('landing.typewriter.prefixBefore')}${t('landing.typewriter.prefixBrand')}${t('landing.typewriter.prefixAfter')}`
    const live = `${fullPrefix} ${visible}`.trim()

    return (
        <span className={className} aria-live="polite">
            <span className="text-foreground">{visible}</span>
            <span className="ml-0.5 inline-block min-w-[0.5ch] animate-pulse text-primary" aria-hidden>
                ▍
            </span>
            <span className="sr-only">{live}</span>
        </span>
    )
}
