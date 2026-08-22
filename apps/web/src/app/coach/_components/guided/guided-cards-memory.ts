/**
 * Memoria POR COACH de las tarjetas guiadas embebidas (SPEC coach-onboarding-v2 §6, W4 F4.3).
 *
 * Las tarjetas son ayuda de primera vez, no un tour: se muestran mientras el coach no las haya
 * cerrado y desaparecen para siempre en cuanto las cierra. La evidencia de la spec es explícita —
 * «tarjetas contextuales embebidas rinden 1,5× más que pop-ups» y «tours largos fracasan» —, así
 * que no hay velo, ni pasos forzados, ni reaparición.
 *
 * La clave es POR COACH: con una clave global, el segundo coach que entra en el mismo navegador
 * nunca vería su ayuda (el bug ya documentado en `FreeWelcomeModal`). Y por SUPERFICIE, porque un
 * mismo coach hace la pauta, el screening y las zonas en momentos distintos.
 *
 * Módulo PURO salvo las dos funciones que tocan `localStorage`, que son fail-soft: en modo privado
 * la ayuda simplemente vuelve a aparecer, que es infinitamente mejor que romper la pantalla.
 */

/** Superficies con tarjetas guiadas. Un id nuevo entra acá, no en un string suelto. */
export type GuidedSurface = 'nutrition_plan' | 'movement_screening' | 'cardio_zones'

export interface GuidedCardsMemory {
    /** Superficies que el coach ya cerró. */
    dismissed: readonly GuidedSurface[]
}

export const EMPTY_GUIDED_CARDS_MEMORY: GuidedCardsMemory = { dismissed: [] }

const GUIDED_SURFACES: readonly GuidedSurface[] = ['nutrition_plan', 'movement_screening', 'cardio_zones']

function isGuidedSurface(value: unknown): value is GuidedSurface {
    return typeof value === 'string' && (GUIDED_SURFACES as readonly string[]).includes(value)
}

/** Clave de `localStorage`. Versionada: un cambio de forma no tiene que leer basura vieja. */
export function guidedCardsStorageKey(coachId: string): string {
    return `eva:coach-guided-cards:v1:${coachId}`
}

/**
 * Parseo defensivo del payload guardado. Cualquier cosa que no sea la forma esperada (null, un
 * array, una versión vieja, JSON corrupto ya decodificado) cae en «sin memoria»: la ayuda se
 * vuelve a mostrar, que es el default seguro.
 */
export function parseGuidedCardsMemory(raw: unknown): GuidedCardsMemory {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY_GUIDED_CARDS_MEMORY
    const dismissed = (raw as { dismissed?: unknown }).dismissed
    if (!Array.isArray(dismissed)) return EMPTY_GUIDED_CARDS_MEMORY
    return { dismissed: dismissed.filter(isGuidedSurface) }
}

/** ¿El coach ya cerró la ayuda de esta superficie? */
export function isGuidedSurfaceDismissed(memory: GuidedCardsMemory, surface: GuidedSurface): boolean {
    return memory.dismissed.includes(surface)
}

/** Memoria con una superficie más cerrada. Inmutable e idempotente (no duplica). */
export function withGuidedSurfaceDismissed(
    memory: GuidedCardsMemory,
    surface: GuidedSurface,
): GuidedCardsMemory {
    if (isGuidedSurfaceDismissed(memory, surface)) return memory
    return { dismissed: [...memory.dismissed, surface] }
}

/** Lectura fail-soft desde `localStorage`. Sin `window` (SSR) devuelve «sin memoria». */
export function readGuidedCardsMemory(coachId: string): GuidedCardsMemory {
    if (typeof window === 'undefined') return EMPTY_GUIDED_CARDS_MEMORY
    try {
        const raw = window.localStorage.getItem(guidedCardsStorageKey(coachId))
        if (raw == null) return EMPTY_GUIDED_CARDS_MEMORY
        return parseGuidedCardsMemory(JSON.parse(raw))
    } catch {
        return EMPTY_GUIDED_CARDS_MEMORY
    }
}

/** Escritura fail-soft. En modo privado la ayuda volverá a aparecer; nada más. */
export function dismissGuidedSurface(coachId: string, surface: GuidedSurface): void {
    if (typeof window === 'undefined') return
    try {
        const next = withGuidedSurfaceDismissed(readGuidedCardsMemory(coachId), surface)
        window.localStorage.setItem(guidedCardsStorageKey(coachId), JSON.stringify(next))
    } catch {
        /* modo privado / cuota llena: no es crítico */
    }
}
