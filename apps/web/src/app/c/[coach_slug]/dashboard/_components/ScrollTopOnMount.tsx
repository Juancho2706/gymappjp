'use client'

import { useLayoutEffect } from 'react'

/**
 * Al MONTAR el dashboard, la vista arranca ARRIBA (decisión CEO 2026-07-25, espejo del focus-reset
 * de la home RN): volviendo del ejecutor ("Volver al inicio" / "Salir") el scroll quedaba donde el
 * alumno lo dejó — abajo, a la altura del programa — y había que subir a mano. `useLayoutEffect`
 * corre antes del primer paint del remonte; el reset cubre window y los roots documentales (Safari
 * scrollea `body`). Costo cero en la carga inicial (ya está en 0).
 */
export function ScrollTopOnMount() {
    useLayoutEffect(() => {
        window.scrollTo(0, 0)
        document.documentElement.scrollTop = 0
        document.body.scrollTop = 0
    }, [])
    return null
}
