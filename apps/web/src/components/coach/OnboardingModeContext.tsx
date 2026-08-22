'use client'

import { createContext, useContext, useMemo } from 'react'

/**
 * Modo de onboarding del área del coach — «un solo onboarding por área» (decisión del owner
 * 2026-08-22).
 *
 * Mientras la guía v2 (`/coach/guia`) está ACTIVA, la guía ES la bienvenida: ningún tour ni modal
 * de módulo se dispara solo. Todos siguen vivos detrás de su «?» — lo que muere es el
 * auto-arranque, no la ayuda.
 *
 * El valor lo calcula el layout `/coach` en el servidor con el helper puro `isGuideActive`
 * (`@eva/onboarding`), con los MISMOS datos que ya le pasa a `GuidePill`. Acá solo viaja el
 * booleano: nada de parsear el jsonb otra vez en el cliente.
 *
 * SSR-safe y con default seguro: fuera del provider `guideActive` es `false`, así que cualquier
 * superficie montada por su cuenta (harness, tests, un futuro layout sin guía) se comporta
 * exactamente como antes de este cambio.
 */

export interface OnboardingMode {
    /** `true` ⇒ la guía del coach está activa: NADA de onboarding se auto-arranca en esta área. */
    guideActive: boolean
}

const DEFAULT_MODE: OnboardingMode = { guideActive: false }

const OnboardingModeContext = createContext<OnboardingMode>(DEFAULT_MODE)

export function OnboardingModeProvider({
    guideActive,
    children,
}: {
    guideActive: boolean
    children: React.ReactNode
}) {
    // Referencia estable: el valor es un booleano, pero el objeto que viaja por el contexto no
    // debe cambiar en cada render del layout (re-renderiza a todo consumidor por nada).
    const value = useMemo<OnboardingMode>(() => ({ guideActive: guideActive === true }), [guideActive])
    return <OnboardingModeContext.Provider value={value}>{children}</OnboardingModeContext.Provider>
}

/** Modo de onboarding del área actual. Fuera del provider: `{ guideActive: false }`. */
export function useOnboardingMode(): OnboardingMode {
    return useContext(OnboardingModeContext)
}
