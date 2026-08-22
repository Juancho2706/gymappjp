'use client'

import { useEffect, useState } from 'react'

/**
 * Hide-on-scroll de la cápsula móvil del coach, como estado compartible.
 *
 * La cápsula (`CoachSidebar`) se minimiza al bajar más de 80 px y se revela al subir o cerca del
 * tope; cualquier pieza flotante que conviva con ella (la píldora de la guía) tiene que seguir ese
 * mismo ritmo o termina tapando la animación del nav. Una sola regla, un solo listener por
 * consumidor, sin contexto: el scroll móvil ocurre en `window` (el body crece), no en `<main>`.
 *
 * Misma semántica que la app (`apps/mobile/components/coach/CoachTabbarScroll.tsx`): delta > 6 px
 * para reaccionar; minimiza solo bajando y pasados los 80 px; revela al subir. Se resetea al
 * cambiar de ruta para que la pantalla nueva arranque revelada.
 */
export function useTabbarMinimized(pathname: string | null): boolean {
    const [minimized, setMinimized] = useState(false)

    useEffect(() => {
        setMinimized(false)
        let lastY = window.scrollY
        let ticking = false
        const onScroll = () => {
            if (ticking) return
            ticking = true
            requestAnimationFrame(() => {
                const y = window.scrollY
                const dy = y - lastY
                if (Math.abs(dy) > 6) {
                    // baja + más allá de 80px → minimiza; sube o cerca del top → revela
                    setMinimized(dy > 0 && y > 80)
                    lastY = y
                }
                ticking = false
            })
        }
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [pathname])

    return minimized
}
