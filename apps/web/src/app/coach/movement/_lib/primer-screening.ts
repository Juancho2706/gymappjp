/**
 * «Haz su primer screening» — decisión de entrada del módulo Movimiento en modo guiado
 * (SPEC coach-onboarding-v2 §6/§7, TASKS W4 F4.3).
 *
 * El paso 3 de la guía (rama `rehab`) abre `/coach/movement/{demo}` con `?primera=1`. Ahí puede
 * pasar una de tres cosas, y ninguna la decide la UI:
 *
 *  - El alumno YA tiene un screening final (el caso del alumno de ejemplo, que se siembra con los
 *    7 patrones puntuados): se muestra el semáforo y se salta a lo que sigue, la pauta para la
 *    casa. Volver a evaluar de cero al demo no le enseña nada al coach.
 *  - Hay un BORRADOR a medias: se retoma el wizard donde quedó (el borrador es único por alumno y
 *    cross-device, AC3 del módulo).
 *  - No hay nada: se va derecho al wizard, que es LA tarea.
 *
 * Módulo PURO: recibe hechos ya resueltos server-side (`getMovementClientReport`) y devuelve la
 * decisión. Sin Supabase, sin React.
 */

export type PrimerScreeningMode =
    /** Evaluar de cero: el wizard de 7 patrones. */
    | 'wizard'
    /** Retomar el borrador que quedó a medias. */
    | 'resume'
    /** Ya hay screening final: semáforo a la vista y siguiente paso = la pauta domiciliaria. */
    | 'pauta'

export interface PrimerScreeningEntry {
    mode: PrimerScreeningMode
    /** El destino es el wizard (`/new`): la página del reporte tiene que mandar allá. */
    goesToWizard: boolean
}

export function resolvePrimerScreeningEntry(input: {
    /** `?primera=1` presente. */
    primera: boolean
    /** El alumno ya tiene al menos un screening FINAL. */
    hasFinal: boolean
    /** Hay un borrador sin finalizar. */
    hasDraft: boolean
}): PrimerScreeningEntry | null {
    if (!input.primera) return null
    if (input.hasFinal) return { mode: 'pauta', goesToWizard: false }
    if (input.hasDraft) return { mode: 'resume', goesToWizard: true }
    return { mode: 'wizard', goesToWizard: true }
}

export interface GuidedCardCopy {
    id: string
    title: string
    body: string
}

/**
 * Las TRES tarjetas del wizard (SPEC: «puntúa cada patrón · marca dolor · guarda»). El screening
 * es la única tarea del onboarding que produce un DATO clínico, así que la tarjeta del dolor no es
 * decorativa: marca el patrón en 0 y cambia la banda de riesgo.
 */
export function primerScreeningCards(name: string | null): GuidedCardCopy[] {
    const subject = name ?? 'tu paciente'
    return [
        {
            id: 'puntua',
            title: 'Puntúa cada patrón',
            body: `De 0 a 3 en los 7 patrones de ${subject}. El total parcial se ve abajo, siempre.`,
        },
        {
            id: 'dolor',
            title: 'Marca el dolor',
            body: 'Si hay dolor o el descarte da positivo, el patrón queda en 0 y sube el riesgo.',
        },
        {
            id: 'guarda',
            title: 'Guarda',
            body: 'Al cerrar el screening queda el semáforo por patrón y de ahí sale su pauta.',
        },
    ]
}
