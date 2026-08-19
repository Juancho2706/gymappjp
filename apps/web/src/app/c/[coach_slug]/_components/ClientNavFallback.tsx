'use client'

import { usePathname } from 'next/navigation'

/**
 * Placeholder del sidebar del alumno mientras streamean los gates del nav (TTFB QW1).
 *
 * Solo reserva el ANCHO del sidebar desktop (`md:w-64`, el mismo que `ClientNav` sin colapsar):
 * el `<main>` es `flex-1`, asi que sin esto el contenido se pintaria a pantalla completa y
 * saltaria al entrar el nav. La capsula flotante mobile NO se replica: es `position: fixed`, no
 * empuja layout, y un vidrio esmerilado vacio parpadeando seria peor que su entrada tardia.
 *
 * Espeja las dos condiciones de `ClientNav` que afectan al sidebar:
 *  - rutas sin chrome (login/register/forgot/onboarding) => `null`, igual que el nav real;
 *  - `aside.client-nav-desktop`, que globals.css oculta en `body.immersive-workout-mode`.
 *
 * NO decide nada: cero tabs, cero enlaces. Los gates de autorizacion viven enteros en el
 * componente real (y el gate de verdad, en cada page).
 */
export function ClientNavFallback() {
    const pathname = usePathname()

    if (
        pathname.includes('/login') ||
        pathname.includes('/register') ||
        pathname.includes('/forgot') ||
        pathname.includes('/onboarding')
    ) {
        return null
    }

    return (
        <aside
            aria-hidden="true"
            className="client-nav-desktop hidden border-r border-subtle bg-surface-card md:sticky md:top-0 md:flex md:h-dvh md:w-64 md:flex-col"
        />
    )
}
