/**
 * @eva/onboarding/persona-progress — la MEMORIA de la guía POR ESPECIALIDAD, como dato puro.
 *
 * QUÉ PROBLEMA RESUELVE (QA del owner, 22-08). El coach hizo la guía como **fuerza** (aplicó la
 * plantilla a Matías), cambió su especialidad a **rehabilitación** en «Opciones › Mi panel» y la
 * guía le mostró el paso 3 («Haz el screening de 7 patrones de Pedro») TILDADO sin haberlo hecho,
 * y el paso 2 tildado pero con el botón apagado («Disponible cuando tengas tu alumno de ejemplo»).
 * Pedido literal: «debería llevar memoria de qué fue lo que hice aunque me cambie o vea la guía de
 * nuevo».
 *
 * MODELO. De los 5 pasos, tres son GLOBALES (la marca, el primer alumno real y el aha: no cambian
 * de significado con la especialidad) y DOS dependen del mundo de la persona:
 *  - `vive_tu_app` — «entra como Matías / Ana / Pedro / Javiera»: es OTRO alumno de ejemplo.
 *  - `first_artifact` — programa / pauta V2 / screening / perfil cardio: es OTRO artefacto.
 *
 * Esos dos se archivan por persona en `coaches.onboarding_guide.progress[persona]`, y el
 * `completed` global del jsonb pasa a ser la VISTA de la especialidad vigente: al cambiar de
 * persona se archiva lo hecho en la vieja y se restaura lo de la nueva (vacío si nunca la usó).
 * Volver a fuerza recupera lo de fuerza.
 *
 * POR QUÉ acá y no en el parser de la web: RN lee exactamente el mismo jsonb por
 * `/api/mobile/coach/dashboard`. Si la regla viviera en `dashboard/_lib`, la app tendría que
 * reimplementarla y volveríamos al drift de «cinco copys de los mismos 4 pasos».
 *
 * Puro y total: sin React, sin Next, sin Supabase, sin React Native. Tolerante a jsonb basura
 * (nunca lanza: una guía rara no puede romper el panel).
 */

import { PERSONAS, type Persona } from '@eva/schemas'
// Type-only a propósito: `index.ts` re-exporta este archivo y un import de valor cerraría el ciclo
// en runtime. Los tipos se borran al compilar.
import type { OnboardingStepKey } from './index'

/**
 * Los pasos cuyo estado es POR ESPECIALIDAD. El resto (`profile_branding`, `first_client`, `aha`)
 * se guarda una sola vez para el coach: cambiar de rama no borra tu marca ni tu primer alumno.
 */
export const PERSONA_SCOPED_STEP_KEYS = ['vive_tu_app', 'first_artifact'] as const satisfies readonly OnboardingStepKey[]

export type PersonaScopedStepKey = (typeof PERSONA_SCOPED_STEP_KEYS)[number]

/** Lo hecho en UNA especialidad. Ausente = nunca se hizo (no es lo mismo que `false` explícito). */
export type PersonaStepProgress = Partial<Record<PersonaScopedStepKey, boolean>>

/** `onboarding_guide.progress`: una entrada por especialidad que el coach haya usado. */
export type ProgressByPersona = Partial<Record<Persona, PersonaStepProgress>>

/** Clave del jsonb `coaches.onboarding_guide` donde vive la memoria por especialidad. */
export const GUIDE_PROGRESS_KEY = 'progress'

export function isPersonaScopedStep(key: string): key is PersonaScopedStepKey {
    return (PERSONA_SCOPED_STEP_KEYS as readonly string[]).includes(key)
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
    return raw != null && typeof raw === 'object' && !Array.isArray(raw)
}

/** Normaliza el bloque de UNA persona: solo las 2 claves conocidas y solo booleanos. */
export function normalizePersonaProgress(raw: unknown): PersonaStepProgress {
    if (!isRecord(raw)) return {}
    const out: PersonaStepProgress = {}
    for (const key of PERSONA_SCOPED_STEP_KEYS) {
        const value = raw[key]
        if (typeof value === 'boolean') out[key] = value
    }
    return out
}

/** Lee `onboarding_guide.progress` completo. Descarta personas desconocidas y valores raros. */
export function readProgressByPersona(guide: unknown): ProgressByPersona {
    if (!isRecord(guide)) return {}
    const raw = guide[GUIDE_PROGRESS_KEY]
    if (!isRecord(raw)) return {}
    const out: ProgressByPersona = {}
    for (const persona of PERSONAS) {
        const entry = normalizePersonaProgress(raw[persona])
        if (Object.keys(entry).length > 0) out[persona] = entry
    }
    return out
}

/** Lo que el coach ya hizo EN ESTA especialidad. `null` (coach sin persona) ⇒ sin memoria. */
export function readPersonaProgress(guide: unknown, persona: Persona | null): PersonaStepProgress {
    if (persona == null) return {}
    return readProgressByPersona(guide)[persona] ?? {}
}

/**
 * Suma lo hecho a la memoria de una persona SIN degradar: un `true` guardado no vuelve a `false`
 * porque una señal se apague (el coach borró el programa del demo y no por eso «desactivó» su
 * onboarding — misma regla sticky que el checklist).
 */
export function mergePersonaProgress(
    current: ProgressByPersona,
    persona: Persona | null,
    done: PersonaStepProgress,
): ProgressByPersona {
    if (persona == null) return current
    const previous = current[persona] ?? {}
    const next: PersonaStepProgress = { ...previous }
    for (const key of PERSONA_SCOPED_STEP_KEYS) {
        if (done[key] === true) next[key] = true
    }
    if (Object.keys(next).length === 0) return current
    return { ...current, [persona]: next }
}

export interface PersonaSwitchInput {
    /** jsonb crudo de `coaches.onboarding_guide`. */
    guide: unknown
    /** Especialidad vigente hasta ahora. `null` = el coach nunca contestó «¿A qué te dedicas?». */
    from: Persona | null
    /** Especialidad nueva. */
    to: Persona
    /** Lo hecho AHORA en la especialidad vieja (señales vivas ∪ `completed` global). */
    doneInFrom: PersonaStepProgress
}

export interface PersonaSwitchPatch {
    /** ¿Hubo cambio real de especialidad? `from` nulo o igual a `to` ⇒ `false`. */
    changed: boolean
    /** `onboarding_guide.progress` completo, listo para el merge del jsonb. */
    progress: ProgressByPersona
    /** Lo que quedó archivado en la especialidad VIEJA. */
    archived: PersonaStepProgress
    /** Lo que se recupera de la especialidad NUEVA (vacío = arranca limpia). */
    restored: PersonaStepProgress
    /**
     * Parche para `onboarding_guide.completed` (el caller lo mergea sobre lo que ya hay):
     *  - hubo cambio ⇒ los 2 pasos con booleano EXPLÍCITO (incluido `false`), porque el `completed`
     *    global es la vista de la especialidad vigente y un `false` explícito es lo único que le
     *    gana al `localStorage` del navegador, que también guarda el checklist.
     *  - no hubo cambio ⇒ solo los `true` (jamás se destilda un paso por una lectura caída).
     */
    completed: PersonaStepProgress
}

/**
 * Archiva lo hecho en la especialidad vieja y restaura lo de la nueva.
 *
 * Tres casos, a propósito:
 *  - `from === to` (guardó la misma especialidad): solo ESTAMPA la memoria. Nada se destilda.
 *  - `from == null` (primera vez que contesta): lo global se le atribuye a la especialidad nueva —
 *    es la única que ha tenido, y resetear ahí le borraría el progreso a los coaches viejos que
 *    hicieron la guía sin persona.
 *  - cambio real: archiva en `progress[from]` y el `completed` global pasa a ser lo de `progress[to]`.
 */
export function applyPersonaSwitch(input: PersonaSwitchInput): PersonaSwitchPatch {
    const { guide, from, to } = input
    const done = normalizePersonaProgress(input.doneInFrom)
    const changed = from != null && from !== to

    const base = readProgressByPersona(guide)
    // Sin cambio (o sin persona previa), lo hecho pertenece a la especialidad de destino.
    const progress = mergePersonaProgress(base, changed ? from : to, done)
    const archived = changed ? (progress[from] ?? {}) : {}
    const restored = progress[to] ?? {}

    if (!changed) {
        const completed: PersonaStepProgress = {}
        for (const key of PERSONA_SCOPED_STEP_KEYS) {
            if (restored[key] === true) completed[key] = true
        }
        return { changed, progress, archived, restored, completed }
    }

    const completed: PersonaStepProgress = {}
    for (const key of PERSONA_SCOPED_STEP_KEYS) {
        completed[key] = restored[key] === true
    }
    return { changed, progress, archived, restored, completed }
}
