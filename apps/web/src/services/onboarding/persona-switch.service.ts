import type { SupabaseClient } from '@supabase/supabase-js'
import {
    GUIDE_PROGRESS_KEY,
    PERSONA_SCOPED_STEP_KEYS,
    applyPersonaSwitch,
    normalizePersonaProgress,
    readProgressByPersona,
    type PersonaStepProgress,
} from '@eva/onboarding'
import { PERSONA_COPY, type Persona } from '@eva/schemas'
import type { Database, Json } from '@/lib/database.types'
import { recordOnboardingEvent } from '@/services/coach/persona.service'
import { deleteDemoStudent, getDemoClientId, seedDemoStudent } from './demo-student.service'
import { loadPersonaArtifactScope, loadPersonaScopedSignals } from './onboarding-v2.queries'

/**
 * services/onboarding/persona-switch — QUÉ PASA CON LA GUÍA cuando el coach se cambia de
 * especialidad en «Opciones › Mi panel» (SPEC §4 y §6, TASKS W8.1.3).
 *
 * Sale del QA del owner (22-08): hizo la guía como FUERZA (aplicó la plantilla a Matías), cambió a
 * REHABILITACIÓN y la guía le mostró el paso 3 «Haz el screening de 7 patrones de Pedro» tildado
 * sin haberlo hecho, y el paso 2 tildado pero apagado («Disponible cuando tengas tu alumno de
 * ejemplo»: el demo seguía siendo Matías). Pedido literal: «debería llevar memoria de qué fue lo
 * que hice aunque me cambie o vea la guía de nuevo».
 *
 * Dos mitades, deliberadamente separadas porque van a los DOS lados del guardado de la persona:
 *  1. `archivePersonaGuideProgress` — ANTES de escribir `coaches.persona`, porque mide con el
 *     `persona_set_at` viejo: archiva lo hecho en la rama que se abandona y restaura lo de la rama
 *     nueva en el `completed` global del jsonb.
 *  2. `reseedDemoForPersonaChange` — DESPUÉS: borra el alumno de ejemplo de la rama vieja y siembra
 *     el de la nueva (Matías → Pedro), para que el paso 2 y el paso 3 tengan a quién apuntar.
 *
 * Este módulo NO conoce Next.js (ni `revalidatePath`, ni sesiones): lo comparten el server action
 * de la web y `/api/mobile/coach/persona` (RN), que son las dos puertas de «Mi panel».
 */

type DB = SupabaseClient<Database>

// ── 1. Memoria de la guía por especialidad ───────────────────────────────────────────────────

export interface ArchivePersonaProgressInput {
    coachId: string
    /** Especialidad vigente hasta ahora (`null` = el coach nunca contestó). */
    from: Persona | null
    /** Especialidad nueva. */
    to: Persona
}

export interface ArchivePersonaProgressResult {
    /** ¿Hubo cambio real de rama? */
    changed: boolean
    /** Lo que quedó guardado para la rama vieja. */
    archived: PersonaStepProgress
    /** Lo que se recuperó de la rama nueva (vacío = arranca limpia). */
    restored: PersonaStepProgress
    /** `null` = se escribió (o no hacía falta escribir nada). */
    error: string | null
}

function asRecord(raw: unknown): Record<string, unknown> {
    return raw != null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
}

/**
 * Archiva / restaura los pasos 2 y 3 al cambiar de especialidad.
 *
 * Lo que se archiva es la UNIÓN de la señal viva (medida con el corte de la rama vieja) y el
 * `completed` global ya persistido: el checklist se guarda con debounce en el navegador y una
 * navegación rápida puede cancelarlo — sin la señal viva, cambiar de rama a los 3 segundos de
 * armar la rutina borraría el progreso.
 *
 * Se escribe con el cliente que reciba (en las dos superficies es el del USUARIO: `coaches` tiene
 * RLS por dueño y column-grant de `onboarding_guide`). Es un read-modify-write más sobre el jsonb,
 * como los otros cuatro que ya existen (deuda declarada en TASKS W8.1.11: falta un lock).
 */
export async function archivePersonaGuideProgress(
    db: DB,
    input: ArchivePersonaProgressInput,
): Promise<ArchivePersonaProgressResult> {
    const { coachId, from, to } = input

    const scope = await loadPersonaArtifactScope(db, coachId)
    const live = await loadPersonaScopedSignals(db, coachId, from, scope)

    const guide = asRecord(scope.guide)
    const completed = normalizePersonaProgress(guide.completed)

    const doneInFrom: PersonaStepProgress = {}
    for (const key of PERSONA_SCOPED_STEP_KEYS) {
        doneInFrom[key] = live[key] === true || completed[key] === true
    }

    const patch = applyPersonaSwitch({ guide, from, to, doneInFrom })

    const currentCompleted = asRecord(guide.completed)
    const nextCompleted = { ...currentCompleted, ...patch.completed }
    const nextGuide: Record<string, unknown> = {
        ...guide,
        [GUIDE_PROGRESS_KEY]: patch.progress,
        completed: nextCompleted,
    }

    // Nada que escribir (guardó la misma especialidad sin nada nuevo): no se gasta un UPDATE ni se
    // mueve `coaches.updated_at`. Se comparan los dos fragmentos que este servicio toca, ya
    // normalizados — un `progress` con basura vieja no cuenta como cambio.
    const untouched =
        JSON.stringify(readProgressByPersona(guide)) === JSON.stringify(patch.progress) &&
        JSON.stringify(currentCompleted) === JSON.stringify(nextCompleted)
    if (untouched) {
        return { changed: patch.changed, archived: patch.archived, restored: patch.restored, error: null }
    }

    const { error } = await db
        .from('coaches')
        .update({ onboarding_guide: nextGuide as Json, updated_at: new Date().toISOString() })
        .eq('id', coachId)

    return {
        changed: patch.changed,
        archived: patch.archived,
        restored: patch.restored,
        error: error?.message ?? null,
    }
}

// ── 2. Alumno de ejemplo de la especialidad nueva ────────────────────────────────────────────

export type DemoChangeAction =
    /** Se borró el de la rama vieja y se sembró el de la nueva (Matías → Pedro). */
    | 'reseeded'
    /** Se borró y la rama nueva no trae alumno de ejemplo (`other`). */
    | 'deleted'
    /** No había nada que cambiar (el coach no tenía demo, o no cambió de rama). */
    | 'kept'
    /** Algo falló: el detalle va en `error`. */
    | 'failed'

export interface DemoChangeResult {
    action: DemoChangeAction
    /** Nombre del alumno de ejemplo de la rama NUEVA (`null` si no trae). */
    demoName: string | null
    demoClientId: string | null
    /** Copy para el coach cuando algo falló; `null` si salió bien. */
    error: string | null
}

export interface ReseedDemoInput {
    coachId: string
    /** Especialidad NUEVA (la que ya quedó guardada). */
    persona: Persona
    surface: 'web' | 'rn'
}

/**
 * Borra el alumno de ejemplo de la rama vieja y siembra el de la nueva.
 *
 * Reglas (decisión ya tomada en la auditoría: «borrar + re-sembrar con aviso»):
 *  - Sin demo (el coach tocó «Borrar ejemplo», o venía de `other`): NO se siembra nada. Resucitar
 *    lo que borró a mano sería peor que el hueco; para eso está «Volver a sembrar» en Mi panel.
 *  - Rama nueva sin alumno de ejemplo (`other`): solo se borra.
 *  - Idempotente: `seedDemoStudent` devuelve el existente si ya hay uno, y el inventario
 *    `onboarding_guide.demo` se reemplaza entero.
 *  - Si el borrado o el sembrado fallan, se informa: la persona ya quedó guardada por el caller y
 *    el coach tiene que enterarse de que su ejemplo quedó a medias.
 *
 * SIEMPRE con el cliente ADMIN: el trigger `clients_guard_is_demo` solo deja marcar `is_demo` a
 * `service_role`. La identidad del coach la resuelve el caller desde la sesión, nunca del body.
 */
export async function reseedDemoForPersonaChange(admin: DB, input: ReseedDemoInput): Promise<DemoChangeResult> {
    const { coachId, persona, surface } = input
    const demoName = PERSONA_COPY[persona].demoName

    const existingDemoId = await getDemoClientId(admin, coachId)
    if (existingDemoId == null) {
        return { action: 'kept', demoName, demoClientId: null, error: null }
    }

    const deleted = await deleteDemoStudent(admin, { coachId })
    if (!deleted.ok) {
        console.error('[persona-switch] no se pudo borrar el alumno de ejemplo', deleted.reason)
        return {
            action: 'failed',
            demoName,
            demoClientId: existingDemoId,
            error: 'Guardamos tu especialidad, pero no pudimos cambiar tu alumno de ejemplo. Inténtalo de nuevo.',
        }
    }
    await recordOnboardingEvent(admin, {
        coachId,
        eventType: 'demo_deleted',
        metadata: { source: 'persona_change', surface, deleted: deleted.deleted },
    })

    if (demoName == null) {
        // `other` deja el panel completo y no tiene «mundo» del que sacar un alumno de ejemplo.
        return { action: 'deleted', demoName: null, demoClientId: null, error: null }
    }

    const seed = await seedDemoStudent(admin, { coachId, persona })
    if (!seed.ok) {
        console.error('[persona-switch] no se pudo sembrar el alumno de ejemplo', seed.reason, seed.detail)
        return {
            action: 'failed',
            demoName,
            demoClientId: null,
            error: `Guardamos tu especialidad, pero no pudimos crear a ${demoName}, tu nuevo alumno de ejemplo. Toca «Volver a sembrar» para intentarlo de nuevo.`,
        }
    }

    await recordOnboardingEvent(admin, {
        coachId,
        eventType: 'demo_seeded',
        metadata: {
            persona,
            demoClientId: seed.demoClientId,
            alreadyExisted: seed.alreadyExisted,
            source: 'persona_change',
            surface,
        },
    })

    return { action: 'reseeded', demoName, demoClientId: seed.demoClientId, error: null }
}

/**
 * El aviso que ve el coach, pegado al mensaje de «Especialidad guardada». Vive acá para que la web
 * y la app digan LO MISMO (el server action lo devuelve en `message`; RN lo recibe en `notice`).
 */
export function demoChangeNotice(demo: DemoChangeResult): string | null {
    switch (demo.action) {
        case 'reseeded':
            return `Cambiamos tu alumno de ejemplo: ahora es ${demo.demoName}.`
        case 'deleted':
            return 'Borramos tu alumno de ejemplo: el panel completo no trae uno.'
        default:
            return null
    }
}
