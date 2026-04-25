'use client'

import { useCallback, useRef } from 'react'

export function useArrowListNav<T extends HTMLElement>() {
    const containerRef = useRef<T | null>(null)

    const onKeyDown = useCallback((e: React.KeyboardEvent<T>) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
        const container = containerRef.current
        if (!container) return
        const items = Array.from(
            container.querySelectorAll<HTMLElement>('[data-arrow-nav-item]')
        )
        if (items.length === 0) return
        const active = document.activeElement as HTMLElement | null
        const idx = items.indexOf(active as HTMLElement)
        e.preventDefault()
        const next =
            e.key === 'ArrowDown'
                ? items[Math.min(idx + 1, items.length - 1)]
                : items[Math.max(idx - 1, 0)]
        next?.focus()
    }, [])

    return { containerRef, onKeyDown }
}
