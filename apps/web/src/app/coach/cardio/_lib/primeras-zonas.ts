/**
 * «Calcula sus zonas» — decisión de entrada del módulo Cardio en modo guiado
 * (SPEC coach-onboarding-v2 §6/§7, TASKS W4 F4.3).
 *
 * El paso 3 de la guía (rama `endurance`) abre `/coach/cardio/{demo}` con `?primera=1`. Ahí el
 * recorrido es perfil → zonas → semana base, y lo único que decide qué se ve es el ESTADO DEL
 * PERFIL, no la UI:
 *
 *  - Sin fecha de nacimiento ni FCmax medida no hay FCmax que derivar (`resolveClientZones`
 *    devuelve null) ⇒ no hay zonas que mirar: la tarea es completar el perfil.
 *  - Con FCmax pero sin FC de reposo las zonas salen por %FCmax en vez de Karvonen; se puede
 *    seguir, pero conviene decirlo.
 *  - Sin marca de 5K no se puede prescribir por ritmo. Tampoco bloquea.
 *
 * Módulo PURO: recibe hechos ya resueltos server-side y devuelve la decisión.
 */

export interface PrimerasZonasEntry {
    /** Ya hay zonas Z1–Z5 calculables: el coach puede mirarlas y armar la semana. */
    hasZones: boolean
    /**
     * Datos que faltan para que el perfil quede redondo, en el orden en que se piden en el
     * formulario. Vacío = perfil completo.
     */
    missing: readonly CardioProfileGap[]
}

/** Cada hueco del perfil, con la consecuencia real de que falte. */
export type CardioProfileGap = 'fcmax' | 'reposo' | 'ref5k'

export function resolvePrimerasZonasEntry(input: {
    /** `?primera=1` presente. */
    primera: boolean
    /** `resolveClientZones` devolvió zonas (hay fecha de nacimiento o FCmax medida). */
    hasZones: boolean
    hasRestingHr: boolean
    hasRef5k: boolean
}): PrimerasZonasEntry | null {
    if (!input.primera) return null
    const missing: CardioProfileGap[] = []
    if (!input.hasZones) missing.push('fcmax')
    if (!input.hasRestingHr) missing.push('reposo')
    if (!input.hasRef5k) missing.push('ref5k')
    return { hasZones: input.hasZones, missing }
}

const GAP_COPY: Record<CardioProfileGap, string> = {
    fcmax: 'su fecha de nacimiento o su FCmax medida',
    reposo: 'su FC de reposo',
    ref5k: 'su marca de 5K',
}

/**
 * Bajada de la tarjeta del perfil: dice EXACTAMENTE qué falta y para qué sirve. Sin huecos, se
 * felicita en una línea y no se inventa trabajo.
 */
export function cardioProfileGapCopy(missing: readonly CardioProfileGap[]): string {
    if (missing.length === 0) return 'Ya está completo: FCmax, FC de reposo y marca de referencia.'
    const parts = missing.map((gap) => GAP_COPY[gap])
    const list =
        parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`
    return `Carga ${list}: de ahí salen las zonas y los ritmos.`
}
