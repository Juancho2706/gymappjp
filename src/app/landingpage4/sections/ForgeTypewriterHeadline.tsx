'use client'

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { FORGE_TYPEWRITER_SUFFIXES } from '../forge-typewriter-copy'

const SPEED_MS = 52
const DELETE_MS = 34
const PAUSE_TYPED_MS = 2600
const PAUSE_EMPTY_MS = 450

export function ForgeTypewriterHeadline({ className }: { className?: string }) {
    const reduce = useReducedMotion()
    const [lineIdx, setLineIdx] = useState(0)
    const [charIdx, setCharIdx] = useState(0)
    const [deleting, setDeleting] = useState(false)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const lines = FORGE_TYPEWRITER_SUFFIXES
    const line = lines[lineIdx % lines.length]

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
        return <span className={className}><span className="text-[var(--forge-ink)]">{lines[0]}</span></span>
    }

    const visible = line.slice(0, charIdx)

    return (
        <span className={className}>
            <span className="text-[var(--forge-ink)]">{visible}</span>
            <span
                className="forge-font-mono ml-0.5 inline-block min-w-[0.5ch] animate-pulse text-[var(--forge-accent)]"
                aria-hidden
            >
                ▍
            </span>
        </span>
    )
}
