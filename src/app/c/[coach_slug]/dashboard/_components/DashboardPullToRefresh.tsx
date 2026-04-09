'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

export function DashboardPullToRefresh({ children }: { children: ReactNode }) {
    const router = useRouter()
    const startY = useRef(0)
    const pulling = useRef(false)
    const [dist, setDist] = useState(0)
    const [refreshing, setRefreshing] = useState(false)

    const onTouchStart = useCallback((e: React.TouchEvent) => {
        if (window.scrollY > 0) return
        pulling.current = true
        startY.current = e.touches[0].clientY
    }, [])

    const onTouchMove = useCallback((e: React.TouchEvent) => {
        if (!pulling.current || window.scrollY > 0) return
        const y = e.touches[0].clientY
        const d = Math.max(0, y - startY.current)
        if (d > 0 && d < 140) {
            setDist(d)
            e.preventDefault()
        }
    }, [])

    const onTouchEnd = useCallback(() => {
        if (!pulling.current) return
        pulling.current = false
        if (dist >= 60 && !refreshing) {
            setRefreshing(true)
            router.refresh()
            setTimeout(() => {
                setRefreshing(false)
                setDist(0)
            }, 800)
        } else {
            setDist(0)
        }
    }, [dist, refreshing, router])

    const opacity = Math.min(dist / 60, 1)
    const scale = Math.min(dist / 60, 1)

    return (
        <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
            {(dist > 8 || refreshing) && (
                <div
                    className="fixed left-1/2 z-50 flex -translate-x-1/2 items-center justify-center"
                    style={{
                        top: 'max(16px, env(safe-area-inset-top))',
                        opacity: refreshing ? 1 : opacity,
                        transform: `scale(${refreshing ? 1 : scale})`,
                    }}
                    aria-hidden
                >
                    <Loader2 className={`h-6 w-6 text-[color:var(--theme-primary)] ${refreshing ? 'animate-spin' : ''}`} />
                </div>
            )}
            {children}
        </div>
    )
}
