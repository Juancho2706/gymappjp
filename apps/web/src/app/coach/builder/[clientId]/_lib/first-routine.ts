/**
 * «Primera rutina» — estado de las 3 tarjetas embebidas del builder (W4 F4.2).
 *
 * SPEC coach-onboarding-v2 §6: «Sin tour automático al entrar (…) tarjetas contextuales
 * embebidas rinden 1,5× más que pop-ups». Esto es la MECÁNICA (qué tarjetas hay, cuáles
 * quedan por ver, con qué clave se recuerda); el pintado vive en `components/FirstRoutineCards`.
 *
 * Módulo PURO: sin React, sin DOM, sin `localStorage`. El componente le pasa el string crudo
 * que leyó y guarda el string que devuelve — así el estado se puede testear sin jsdom.
 *
 * Memoria POR COACH. Las claves globales del builder (`builder_onboarding_seen_short_v1`,
 * `builder_onboarding_seen_help_v1`, `builder_config_hint_v1`) eran compartidas por todos los
 * coaches que usaran el mismo navegador: el segundo coach nacía con la guía «ya vista». Los
 * helpers de acá las namespacean por `coachId` (deuda F2.8, cerrada en F4.2).
 */

export type FirstRoutineCardId = 'cambia-ejercicio' | 'reordena' | 'ab-despues'

export interface FirstRoutineCard {
    id: FirstRoutineCardId
    /** Título corto, imperativo: lo que el coach puede hacer AHORA. */
    title: string
    /** Una línea: cómo se hace y qué gana. */
    body: string
    /** Texto del botón que la cierra. La última dice «Listo» (cierra la serie completa). */
    cta: string
}

/**
 * Las 3 tarjetas, en orden. Tres y no más: la evidencia de la SPEC (§Evidencia externa) mide
 * 72 % de completitud con 3 pasos contra 16 % con 7.
 */
export const FIRST_ROUTINE_CARDS: readonly FirstRoutineCard[] = [
    {
        id: 'cambia-ejercicio',
        title: 'Cambia un ejercicio',
        body: 'Toca el nombre de un ejercicio y elígele otro. Las series y las repeticiones se quedan como están.',
        cta: 'Entendido',
    },
    {
        id: 'reordena',
        title: 'Reordena',
        body: 'Arrastra el asa de la tarjeta para mover el ejercicio dentro del día o pasarlo a otro día.',
        cta: 'Entendido',
    },
    {
        id: 'ab-despues',
        title: 'A/B y fases pueden esperar',
        body: 'Las semanas alternas y las fases son para más adelante. Con esta semana ya puedes asignar.',
        cta: 'Listo',
    },
]

/** Estado persistido: qué tarjetas ya cerró el coach. */
export interface FirstRoutineState {
    dismissed: readonly FirstRoutineCardId[]
}

export const EMPTY_FIRST_ROUTINE_STATE: FirstRoutineState = { dismissed: [] }

const CARD_IDS: ReadonlySet<string> = new Set(FIRST_ROUTINE_CARDS.map((card) => card.id))

/** Coach sin sesión resuelta (no debería pasar en el builder): clave propia, nunca la global. */
const ANON_COACH = 'anon'

function coachSlot(coachId: string | null | undefined): string {
    const trimmed = (coachId ?? '').trim()
    return trimmed === '' ? ANON_COACH : trimmed
}

/** Clave de las 3 tarjetas de «Primera rutina», namespaceada por coach. */
export function firstRoutineStorageKey(coachId: string | null | undefined): string {
    return `eva.builder.primera-rutina.v1:${coachSlot(coachId)}`
}

/**
 * Claves POR COACH de la guía vieja del builder (el «?» y el hint de Configurar).
 * Reemplazan a las globales de `WeeklyPlanBuilder.tsx` (deuda declarada en TASKS F2.8).
 */
export type BuilderTourMemoryKind = 'short' | 'help' | 'config-hint'

export function builderTourStorageKey(
    coachId: string | null | undefined,
    kind: BuilderTourMemoryKind,
): string {
    return `eva.builder.guia.v1:${kind}:${coachSlot(coachId)}`
}

/** Lee el estado desde el string crudo del storage. Cualquier basura ⇒ estado vacío. */
export function parseFirstRoutineState(raw: string | null | undefined): FirstRoutineState {
    if (raw == null || raw.trim() === '') return EMPTY_FIRST_ROUTINE_STATE
    try {
        const parsed: unknown = JSON.parse(raw)
        if (parsed == null || typeof parsed !== 'object') return EMPTY_FIRST_ROUTINE_STATE
        const list = (parsed as { dismissed?: unknown }).dismissed
        if (!Array.isArray(list)) return EMPTY_FIRST_ROUTINE_STATE
        const dismissed = list.filter(
            (id): id is FirstRoutineCardId => typeof id === 'string' && CARD_IDS.has(id),
        )
        // Sin `Set` para no atar el módulo a `downlevelIteration`: el catálogo son 3 ids.
        const unique = dismissed.filter((id, index) => dismissed.indexOf(id) === index)
        return { dismissed: unique }
    } catch {
        return EMPTY_FIRST_ROUTINE_STATE
    }
}

/** String a guardar en el storage. */
export function serializeFirstRoutineState(state: FirstRoutineState): string {
    return JSON.stringify({ dismissed: state.dismissed })
}

/** Cierra una tarjeta. Idempotente: cerrar dos veces no duplica. */
export function dismissFirstRoutineCard(
    state: FirstRoutineState,
    id: FirstRoutineCardId,
): FirstRoutineState {
    if (state.dismissed.includes(id)) return state
    return { dismissed: [...state.dismissed, id] }
}

/** «Listo» de la tercera tarjeta: cierra la serie completa. */
export function dismissAllFirstRoutineCards(): FirstRoutineState {
    return { dismissed: FIRST_ROUTINE_CARDS.map((card) => card.id) }
}

/** Tarjetas que todavía se muestran, en el orden del catálogo. */
export function visibleFirstRoutineCards(state: FirstRoutineState): readonly FirstRoutineCard[] {
    return FIRST_ROUTINE_CARDS.filter((card) => !state.dismissed.includes(card.id))
}

/** ¿El coach ya cerró las 3? (la tira desaparece y no vuelve sola). */
export function isFirstRoutineDone(state: FirstRoutineState): boolean {
    return visibleFirstRoutineCards(state).length === 0
}
