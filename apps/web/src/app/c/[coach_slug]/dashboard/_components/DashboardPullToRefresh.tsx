'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

export function DashboardPullToRefresh({ children }: { children: ReactNode }) {
    const router = useRouter()
    const startY = useRef(0)
    const pulling = useRef(false)
    const rootRef = useRef<HTMLDivElement | null>(null)
    const [dist, setDist] = useState(0)
    // El spinner vive atado a la transición REAL del refresh, no a un temporizador: el
    // timeout fijo de 800 ms apagaba el spinner con el RSC aún en vuelo — el alumno leía
    // "listo", veía datos viejos y el contenido saltaba después. isPending no miente.
    const [isPending, startTransition] = useTransition()

    const onTouchStart = useCallback((e: React.TouchEvent) => {
        if (window.scrollY > 0) return
        pulling.current = true
        startY.current = e.touches[0].clientY
    }, [])

    // touchmove va por addEventListener con passive:false a propósito: React registra los
    // handlers táctiles como pasivos, así que un e.preventDefault() dentro del prop
    // onTouchMove es un no-op y el gesto compite con el overscroll nativo del navegador.
    useEffect(() => {
        const node = rootRef.current
        if (!node) return
        const onMove = (e: TouchEvent) => {
            if (!pulling.current || window.scrollY > 0) return
            const y = e.touches[0].clientY
            const d = Math.max(0, y - startY.current)
            if (d > 0 && d < 140) {
                setDist(d)
                e.preventDefault()
            }
        }
        node.addEventListener('touchmove', onMove, { passive: false })
        return () => node.removeEventListener('touchmove', onMove)
    }, [])

    const onTouchEnd = useCallback(() => {
        if (!pulling.current) return
        pulling.current = false
        if (dist >= 60 && !isPending) {
            startTransition(() => {
                router.refresh()
            })
        }
        setDist(0)
    }, [dist, isPending, router])

    const opacity = Math.min(dist / 60, 1)
    const scale = Math.min(dist / 60, 1)

    return (
        <div ref={rootRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {(dist > 8 || isPending) && (
                <div
                    className="fixed left-1/2 z-50 flex -translate-x-1/2 items-center justify-center"
                    style={{
                        top: 'max(16px, env(safe-area-inset-top))',
                        opacity: isPending ? 1 : opacity,
                        transform: `scale(${isPending ? 1 : scale})`,
                    }}
                    aria-hidden
                >
                    <Loader2 className={`h-6 w-6 text-[color:var(--theme-primary)] ${isPending ? 'animate-spin' : ''}`} />
                </div>
            )}
            {children}
        </div>
    )
}
