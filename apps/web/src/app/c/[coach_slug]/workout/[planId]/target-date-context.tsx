'use client'

import { createContext, useContext } from 'react'

/**
 * Contexto de "día objetivo" del ejecutor (Ola 1, edición de un día PASADO). Cuando el ejecutor se
 * abre con `?fecha=YYYY-MM-DD` (desde el sheet de doble intención del dashboard), TODAS las series de
 * la sesión editan esa fecha en modo solo-UPDATE. En vez de pasar la fecha por props a través de
 * `SingleExerciseCard`/`StepperExecution` hasta cada `LogSetForm`, se inyecta por contexto: los forms
 * la leen y montan un `<input type="hidden" name="target_date">` que viaja en cada submit → la action
 * conmuta a solo-UPDATE (nunca inserta un día pasado). `null` = flujo normal de HOY (byte-idéntico).
 */
const TargetDateContext = createContext<string | null>(null)

export function TargetDateProvider({
    value,
    children,
}: {
    value: string | null
    children: React.ReactNode
}) {
    return <TargetDateContext.Provider value={value}>{children}</TargetDateContext.Provider>
}

/** Fecha objetivo ISO `YYYY-MM-DD` activa, o `null` si la sesión es de HOY (comportamiento clásico). */
export function useTargetDate(): string | null {
    return useContext(TargetDateContext)
}
