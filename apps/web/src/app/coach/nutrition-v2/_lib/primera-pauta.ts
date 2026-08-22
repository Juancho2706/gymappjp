/**
 * «Arma su primera pauta» — decisión de entrada del editor único en modo guiado
 * (SPEC coach-onboarding-v2 §6/§7, TASKS W4 F4.3).
 *
 * El paso 3 de la guía (rama `nutrition`) abre el editor del alumno de ejemplo con `?primera=1`.
 * Qué encuentra el coach ahí NO puede decidirlo la UI: depende de si ese alumno ya tiene una pauta
 * vigente, cosa que la base garantiza única (`nutrition_plans_v2_active_root_per_client_uniq`).
 *
 *  - CON pauta vigente → se ABRE la pauta vigente para editarla, con el aviso amable. Aplicar una
 *    plantilla encima moriría con 23505 y el coach vería un error de Postgres por una situación
 *    que no es un error.
 *  - SIN pauta vigente → se ARMA una nueva: desde la plantilla pedida en `?from=` si vino, o en
 *    blanco. El editor ya sabe hidratar los dos casos.
 *
 * Módulo PURO: recibe hechos ya resueltos server-side y devuelve una decisión. El copy final lo
 * compone quien lo pinta (`activePlanClashCopy` en `services/onboarding/templates.ts`), para que
 * este archivo no arrastre el catálogo de contenido al bundle.
 */

/** Aviso que hay que dar al entrar. `null` = no hay nada que avisar. */
export type PrimeraPautaNotice = 'plan_activo'

export interface PrimeraPautaEntry {
    /** `edit` = editar la pauta vigente; `create` = armar una nueva (plantilla o en blanco). */
    mode: 'edit' | 'create'
    notice: PrimeraPautaNotice | null
    /** El editor tiene que hidratar desde la plantilla pedida en `?from=`. */
    usesRequestedOrigin: boolean
}

/**
 * Decide la entrada guiada. `null` = no es una entrada guiada (`?primera=1` ausente): el editor se
 * comporta EXACTAMENTE como siempre, sin tarjetas ni avisos.
 */
export function resolveNutritionPrimeraEntry(input: {
    /** `?primera=1` presente. */
    primera: boolean
    /** El alumno ya tiene una pauta V2 vigente (`detail.plan.plan != null`). */
    hasActivePlan: boolean
    /** Vino un `?from=template:<uuid>` / `?from=plan:<uuid>` válido. */
    hasRequestedOrigin: boolean
}): PrimeraPautaEntry | null {
    if (!input.primera) return null
    if (input.hasActivePlan && !input.hasRequestedOrigin) {
        return { mode: 'edit', notice: 'plan_activo', usesRequestedOrigin: false }
    }
    // Con origen explícito mandan las ganas del coach (reemplazar la pauta con una plantilla es
    // legítimo: el editor lo publica con CAS). Sin pauta vigente, siempre es creación.
    return { mode: 'create', notice: null, usesRequestedOrigin: input.hasRequestedOrigin }
}

/** Primer nombre para el copy («Ana»), sin quedarse con un string vacío. */
export function firstName(fullName: string | null | undefined): string | null {
    const first = (fullName ?? '').trim().split(/\s+/)[0] ?? ''
    return first === '' ? null : first
}

export interface PrimeraPautaCardCopy {
    id: string
    title: string
    body: string
}

/**
 * Las TRES tarjetas de la pauta (SPEC: «cambia un alimento · ajusta una porción · publica»).
 * Con pauta vigente el coach EDITA lo que ya está; sin pauta, la primera tarjeta cambia de verbo
 * porque no hay nada que cambiar todavía — prometer «cambia un alimento» sobre un lienzo vacío
 * sería mentir.
 */
export function primeraPautaCards(input: {
    hasActivePlan: boolean
    /** Nombre del alumno («Ana»). `null` = se habla sin sujeto. */
    name: string | null
}): PrimeraPautaCardCopy[] {
    const subject = input.name ?? 'tu alumno'
    return [
        input.hasActivePlan
            ? {
                  id: 'cambia-alimento',
                  title: 'Cambia un alimento',
                  body: `Toca cualquier alimento de la pauta de ${subject} y elige otro. Las macros se recalculan solas.`,
              }
            : {
                  id: 'agrega-alimento',
                  title: 'Agrega el primer alimento',
                  body: `Suma una comida y su primer alimento: así arranca la pauta de ${subject}.`,
              },
        {
            id: 'ajusta-porcion',
            title: 'Ajusta una porción',
            body: 'Sube o baja la cantidad con los botones. El total del día se mueve al instante.',
        },
        {
            id: 'publica',
            title: 'Publica',
            body: `Al publicar, ${subject} la ve en su app con tu marca.`,
        },
    ]
}
