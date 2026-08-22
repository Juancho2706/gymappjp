import type { SupabaseClient } from '@supabase/supabase-js'
import { DEMO_PROFILES } from '@eva/onboarding'
import type { Database, Json } from '@/lib/database.types'
import type { Persona } from '@eva/schemas'
import {
    MATIAS_CHECK_INS,
    MATIAS_SESSIONS,
} from './demo-content/strength'
import { ANA_BIA, ANA_INTAKE, ANA_ISAK_DAYS_AGO, ANA_ISAK_NOTES, ANA_ISAK_RAW } from './demo-content/nutrition'
import { PEDRO_ASSESSMENT, REHAB_AREAS } from './demo-content/rehab'
import { ENDURANCE_AREAS, JAVIERA_HR_CURVES, JAVIERA_SESSIONS } from './demo-content/endurance'
import type { NutritionPlanBlueprint, ProgramBlueprint } from './demo-content/types'
import { DEMO_TEMPLATE_BY_PERSONA, resolveTemplateBlueprint } from './templates'
import {
    dateDaysAgo,
    writeBia,
    writeCheckIns,
    writeIntakeEntries,
    writeIsak,
    writeMovementAssessment,
    writeNutritionPlanV2,
    writeProgram,
    writeWorkoutLogs,
    type WrittenProgram,
} from './demo-writers'

/**
 * Alumno de ejemplo del onboarding v2 (docs/specs/coach-onboarding-v2, W3 F3.1).
 *
 * CONTRATO compartido entre W2 (quien lo llama desde la pantalla de persona y el dashboard) y W3
 * (quien lo implementa). Reglas que fija la migración `20260822002122_onboarding_v2_persona_demo`:
 *  - Se escribe SIEMPRE con el cliente ADMIN (service_role): el trigger `clients_guard_is_demo`
 *    fuerza `is_demo = false` para cualquier otro rol. Llamar esto con el cliente del coach siembra
 *    un alumno REAL que sí ocupa cupo.
 *  - El demo nunca cuenta para el cupo ni para KPIs ni recibe correos (W1 F1.3).
 *  - Idempotente: si el coach ya tiene demo, devuelve el existente (`alreadyExisted: true`).
 *  - Reversible: `deleteDemoStudent` borra TODO lo sembrado (inventario en
 *    `coaches.onboarding_guide.demo`) y deja 0 filas.
 */
export type DemoSeedResult =
    | { ok: true; demoClientId: string; alreadyExisted: boolean }
    | { ok: false; reason: 'not_implemented' | 'persona_sin_demo' | 'error'; detail?: string }

export type DemoDeleteResult = { ok: true; deleted: boolean } | { ok: false; reason: string }

export type ApplyTemplateResult =
    | { ok: true; programId?: string; planId?: string }
    | { ok: false; reason: 'not_implemented' | 'template_desconocida' | 'error'; detail?: string }

type DB = SupabaseClient<Database>

/** Dominio de las cuentas de prueba de EVA: excluido de finanzas y de los correos al alumno. */
const DEMO_EMAIL_DOMAIN = 'evatest.cl'

/** Días de antigüedad del demo: el programa arranca hace 2 semanas para que la semana esté en curso. */
const PROGRAM_START_DAYS_AGO = 13

/**
 * Inventario de TODO lo que sembró el demo, guardado en `coaches.onboarding_guide.demo`.
 * Es lo que hace reversible al sembrador: `deleteDemoStudent` borra por esta lista (y, además,
 * barre por `is_demo` como red de seguridad si el inventario se perdió).
 */
export interface DemoInventory {
    version: 1
    persona: Persona
    seededAt: string
    authUserId: string
    clientId: string
    accountId: string
    /** Plantilla que quedó aplicada al demo (`TEMPLATE_CATALOG`), para la guía y el empty state. */
    templateId: string | null
    /** Ids por tabla. Las tablas que cuelgan de `clients` se borran por cascada; van igual, para auditar. */
    tables: Record<string, string[]>
    /** Áreas del builder creadas POR EL SEED (nunca las que el coach ya tenía). */
    areaIds: string[]
    /** Nombres de catálogo que no se pudieron resolver: contenido a revisar, no un error. */
    warnings: string[]
}

// ── Helpers de inventario ────────────────────────────────────────────────────────────────────

type Guide = Record<string, unknown>

async function readCoachGuide(db: DB, coachId: string): Promise<Guide | null> {
    const { data } = await db.from('coaches').select('onboarding_guide').eq('id', coachId).maybeSingle()
    if (data == null) return null
    const guide = data.onboarding_guide
    return guide != null && typeof guide === 'object' && !Array.isArray(guide) ? (guide as Guide) : {}
}

/**
 * MERGE del jsonb, nunca replace: `onboarding_guide` guarda además el estado de la guía
 * (`dismissed`, `completed`, `brand_tour_seen`, `invite_code_confirmed`…). Pisarlo entero
 * borraría el progreso del coach.
 */
async function writeDemoInventory(db: DB, coachId: string, inventory: DemoInventory | null): Promise<void> {
    const guide = (await readCoachGuide(db, coachId)) ?? {}
    const next: Guide = { ...guide }
    if (inventory == null) delete next.demo
    else next.demo = inventory as unknown as Json
    await db.from('coaches').update({ onboarding_guide: next as Json }).eq('id', coachId)
}

function readDemoInventory(guide: Guide | null): DemoInventory | null {
    const demo = guide?.demo
    if (demo == null || typeof demo !== 'object' || Array.isArray(demo)) return null
    const candidate = demo as Partial<DemoInventory>
    if (typeof candidate.clientId !== 'string') return null
    return {
        version: 1,
        persona: (candidate.persona ?? 'other') as Persona,
        seededAt: candidate.seededAt ?? '',
        authUserId: typeof candidate.authUserId === 'string' ? candidate.authUserId : candidate.clientId,
        clientId: candidate.clientId,
        accountId: typeof candidate.accountId === 'string' ? candidate.accountId : candidate.clientId,
        templateId: typeof candidate.templateId === 'string' ? candidate.templateId : null,
        tables: (candidate.tables ?? {}) as Record<string, string[]>,
        areaIds: Array.isArray(candidate.areaIds) ? candidate.areaIds.filter((id) => typeof id === 'string') : [],
        warnings: Array.isArray(candidate.warnings) ? candidate.warnings.filter((w) => typeof w === 'string') : [],
    }
}

/**
 * Contraseña aleatoria fuerte: el demo NUNCA nace con credenciales adivinables. Nadie la usa —
 * el coach entra a la app del alumno por magic link (`Vive tu app`, W2 F2.5), no con password.
 * `getRandomValues` (Web Crypto) y no `Math.random`: esto es una credencial.
 */
function strongRandomPassword(): string {
    const bytes = new Uint8Array(24)
    globalThis.crypto.getRandomValues(bytes)
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    return `Ev${hex}#7`
}

/** Fecha de nacimiento coherente con la edad del perfil (habilita las zonas de FC del cardio). */
function birthDateForAge(age: number): string {
    const year = new Date().getUTCFullYear() - age
    return `${year}-03-15`
}

// ── Sembrado ─────────────────────────────────────────────────────────────────────────────────

/** Siembra el alumno de ejemplo de la persona. Idempotente y reversible. */
export async function seedDemoStudent(
    admin: SupabaseClient<Database>,
    input: { coachId: string; persona: Persona }
): Promise<DemoSeedResult> {
    const { coachId, persona } = input
    const profile = DEMO_PROFILES[persona]
    // `other` deja el panel completo y no tiene «mundo» del que sacar un alumno de ejemplo (SPEC §4).
    if (profile == null) return { ok: false, reason: 'persona_sin_demo' }

    const existingDemoId = await getDemoClientId(admin, coachId)
    if (existingDemoId != null) return { ok: true, demoClientId: existingDemoId, alreadyExisted: true }

    const guide = await readCoachGuide(admin, coachId)
    if (guide == null) return { ok: false, reason: 'error', detail: 'coach_inexistente' }

    const email = `demo-${coachId}@${DEMO_EMAIL_DOMAIN}`
    const { data: created, error: authError } = await admin.auth.admin.createUser({
        email,
        password: strongRandomPassword(),
        email_confirm: true,
        user_metadata: { demo: true, coach_id: coachId, full_name: profile.name },
    })
    if (authError != null || created?.user == null) {
        return { ok: false, reason: 'error', detail: `auth.createUser: ${authError?.message ?? 'sin usuario'}` }
    }
    const authUserId = created.user.id

    try {
        const inventory = await seedContent(admin, { coachId, persona, authUserId, email })
        if ('error' in inventory) {
            await rollbackPartialSeed(admin, coachId, authUserId)
            return { ok: false, reason: 'error', detail: inventory.error }
        }
        await writeDemoInventory(admin, coachId, inventory.value)
        return { ok: true, demoClientId: authUserId, alreadyExisted: false }
    } catch (error) {
        await rollbackPartialSeed(admin, coachId, authUserId)
        return { ok: false, reason: 'error', detail: error instanceof Error ? error.message : String(error) }
    }
}

/** Deja el árbol a medio sembrar en cero. El borrado del auth user cascadea `clients` y sus hijos. */
async function rollbackPartialSeed(admin: DB, coachId: string, authUserId: string): Promise<void> {
    await admin.auth.admin.deleteUser(authUserId).catch(() => undefined)
    await admin.from('client_accounts').delete().eq('id', authUserId)
    await writeDemoInventory(admin, coachId, null)
}

async function seedContent(
    admin: DB,
    input: { coachId: string; persona: Persona; authUserId: string; email: string },
): Promise<{ value: DemoInventory } | { error: string }> {
    const { coachId, persona, authUserId, email } = input
    const profile = DEMO_PROFILES[persona]
    if (profile == null) return { error: 'persona_sin_demo' }

    const tables: Record<string, string[]> = {}
    const areaIds: string[] = []
    const warnings: string[] = []
    const track = (table: string, ids: readonly string[]): void => {
        if (ids.length === 0) return
        tables[table] = [...(tables[table] ?? []), ...ids]
    }

    // 1) Identidad del alumno demo. `is_demo` solo lo acepta la base desde service_role.
    const { error: clientError } = await admin.from('clients').insert({
        id: authUserId,
        email,
        full_name: profile.name,
        coach_id: coachId,
        is_demo: true,
        is_active: true,
        is_archived: false,
        onboarding_completed: true,
        force_password_change: false,
        use_coach_brand_colors: true,
        birth_date: birthDateForAge(profile.age),
        subscription_start_date: dateDaysAgo(21),
        ...(profile.cardio != null
            ? { resting_hr: profile.cardio.resting_hr, ref_5k_time_sec: profile.cardio.ref_5k_time_sec }
            : {}),
    })
    if (clientError != null) return { error: `clients: ${clientError.message}` }
    track('clients', [authUserId])

    const { error: accountError } = await admin.from('client_accounts').insert({ id: authUserId })
    if (accountError != null) return { error: `client_accounts: ${accountError.message}` }
    track('client_accounts', [authUserId])

    const { data: membership, error: membershipError } = await admin
        .from('client_memberships')
        .insert({
            account_id: authUserId,
            client_id: authUserId,
            scope: 'standalone',
            coach_id: coachId,
            org_id: null,
            team_id: null,
            status: 'active',
        })
        .select('id')
        .single()
    if (membershipError != null || membership == null) {
        return { error: `client_memberships: ${membershipError?.message ?? 'sin fila'}` }
    }
    track('client_memberships', [membership.id])

    const { data: intake, error: intakeError } = await admin
        .from('client_intake')
        .insert({
            client_id: authUserId,
            sex: profile.sex,
            weight_kg: profile.intake.weight_kg,
            height_cm: profile.intake.height_cm,
            experience_level: profile.intake.experience_level,
            availability: profile.intake.availability,
            goals: profile.intake.goals,
            injuries: profile.intake.injuries ?? null,
            medical_conditions: profile.intake.medical_conditions ?? null,
        })
        .select('id')
        .single()
    if (intakeError != null || intake == null) {
        return { error: `client_intake: ${intakeError?.message ?? 'sin fila'}` }
    }
    track('client_intake', [intake.id])

    // 2) Contenido de la rama. Cada persona siembra SU mundo (SPEC §4).
    const templateId = DEMO_TEMPLATE_BY_PERSONA[persona]
    const blueprint = templateId != null ? resolveTemplateBlueprint(templateId) : null

    if (blueprint?.kind === 'program') {
        const written = await writeDemoProgram(admin, {
            coachId,
            clientId: authUserId,
            program: blueprint.program,
        })
        if ('error' in written) return { error: written.error }
        track('workout_programs', [written.programId])
        track('workout_plans', written.planIds)
        track('workout_blocks', written.blockIds)
        areaIds.push(...written.createdAreaIds)
        warnings.push(...written.missingExercises.map((name) => `ejercicio sin catálogo: ${name}`))

        if (persona === 'strength') {
            const logs = await writeWorkoutLogs(admin, {
                clientId: authUserId,
                blueprint: blueprint.program,
                blockIdByKey: written.blockIdByKey,
                exerciseNameByKey: written.exerciseNameByKey,
                sessions: MATIAS_SESSIONS,
            })
            if (logs.error != null) return { error: `workout_logs: ${logs.error}` }
            track('workout_logs', logs.ids)

            const checkIns = await writeCheckIns(admin, { clientId: authUserId, checkIns: MATIAS_CHECK_INS })
            if (checkIns.error != null) return { error: `check_ins: ${checkIns.error}` }
            track('check_ins', checkIns.ids)
        }

        if (persona === 'endurance') {
            const logs = await writeWorkoutLogs(admin, {
                clientId: authUserId,
                blueprint: blueprint.program,
                blockIdByKey: written.blockIdByKey,
                exerciseNameByKey: written.exerciseNameByKey,
                sessions: JAVIERA_SESSIONS,
                hrCurves: JAVIERA_HR_CURVES,
            })
            if (logs.error != null) return { error: `workout_logs: ${logs.error}` }
            track('workout_logs', logs.ids)
        }

        if (persona === 'rehab') {
            const assessment = await writeMovementAssessment(admin, {
                coachId,
                clientId: authUserId,
                blueprint: PEDRO_ASSESSMENT,
                daysAgo: 14,
            })
            if ('error' in assessment) return { error: assessment.error }
            track('movement_assessments', [assessment.assessmentId])
            track('movement_assessment_items', assessment.itemIds)
        }
    }

    if (blueprint?.kind === 'nutrition') {
        const plan = await writeNutritionPlanV2(admin, {
            coachId,
            clientId: authUserId,
            blueprint: blueprint.plan,
        })
        if ('error' in plan) return { error: plan.error }
        track('nutrition_plans_v2', [plan.planId])
        track('nutrition_plan_versions_v2', [plan.versionId])
        warnings.push(...plan.missingFoods.map((name) => `alimento sin catálogo: ${name}`))
        warnings.push(...plan.missingGroups.map((code) => `grupo de intercambio sin catálogo: ${code}`))

        const bia = await writeBia(admin, { coachId, clientId: authUserId, blueprint: ANA_BIA })
        if (bia.error != null) return { error: `body_composition_measurements (bia): ${bia.error}` }
        if (bia.id != null) track('body_composition_measurements', [bia.id])

        const isak = await writeIsak(admin, {
            coachId,
            clientId: authUserId,
            raw: ANA_ISAK_RAW,
            daysAgo: ANA_ISAK_DAYS_AGO,
            notes: ANA_ISAK_NOTES,
        })
        if (isak.error != null) return { error: `body_composition_measurements (isak): ${isak.error}` }
        if (isak.id != null) track('body_composition_measurements', [isak.id])

        const intake = await writeIntakeEntries(admin, { clientId: authUserId, entries: ANA_INTAKE })
        if (intake.error != null) return { error: `nutrition_intake_entries: ${intake.error}` }
        track('nutrition_intake_entries', intake.ids)
    }

    return {
        value: {
            version: 1,
            persona,
            seededAt: new Date().toISOString(),
            authUserId,
            clientId: authUserId,
            accountId: authUserId,
            templateId,
            tables,
            areaIds,
            warnings,
        },
    }
}

/** Programa del demo: activo y arrancado hace dos semanas, para que la semana esté en curso. */
async function writeDemoProgram(
    admin: DB,
    input: { coachId: string; clientId: string; program: ProgramBlueprint },
): Promise<WrittenProgram | { error: string }> {
    return writeProgram(admin, {
        coachId: input.coachId,
        clientId: input.clientId,
        blueprint: input.program,
        startDaysAgo: PROGRAM_START_DAYS_AGO,
        isActive: true,
    })
}

// ── Borrado ──────────────────────────────────────────────────────────────────────────────────

/**
 * Borra el alumno de ejemplo y TODO su contenido. Dos caminos que se suman a propósito:
 * el inventario (lo que este seed anotó) y un barrido por `clients.is_demo` del coach (por si el
 * inventario se perdió o alguien re-sembró sin pasar por acá). Idempotente: llamarlo dos veces
 * deja `deleted: false` la segunda.
 */
export async function deleteDemoStudent(
    admin: SupabaseClient<Database>,
    input: { coachId: string }
): Promise<DemoDeleteResult> {
    const { coachId } = input
    const guide = await readCoachGuide(admin, coachId)
    const inventory = readDemoInventory(guide)

    const { data: demoRows } = await admin
        .from('clients')
        .select('id')
        .eq('coach_id', coachId)
        .eq('is_demo', true)
    const clientIds = [...new Set([...(demoRows ?? []).map((row) => row.id), ...(inventory ? [inventory.clientId] : [])])]

    let deleted = false

    for (const clientId of clientIds) {
        // FKs que NO cascadean desde `clients` (o que conviene borrar antes para no depender del
        // orden del planner): la raíz V2 sí cascadea por `client_id`, pero se borra explícita para
        // que el fallo, si lo hay, sea visible acá y no un 23503 opaco al borrar el auth user.
        await (admin as unknown as { from(table: string): { delete(): { eq(c: string, v: unknown): PromiseLike<unknown> } } })
            .from('nutrition_plans_v2')
            .delete()
            .eq('client_id', clientId)

        // `clients.id` referencia `auth.users(id) ON DELETE CASCADE`: borrar el usuario se lleva la
        // ficha, la cuenta, la membresía, el intake, programas, planes, bloques, logs, check-ins,
        // mediciones y screenings. Es UNA operación, no veinte deletes que pueden quedar a medias.
        const { error: authError } = await admin.auth.admin.deleteUser(clientId)
        if (authError == null) {
            deleted = true
            continue
        }
        // El usuario ya no existe (o no era un auth user): se limpia por tabla.
        const { data: removed } = await admin.from('clients').delete().eq('id', clientId).select('id')
        await admin.from('client_accounts').delete().eq('id', clientId)
        if ((removed ?? []).length > 0) deleted = true
    }

    // Áreas custom que creó el seed. Se borran DURO (no soft-delete): son del sembrado, no del coach.
    const areaIds = inventory?.areaIds ?? []
    if (areaIds.length > 0) {
        const { data: removedAreas } = await admin
            .from('workout_section_templates')
            .delete()
            .in('id', areaIds)
            .eq('coach_id', coachId)
            .eq('is_system', false)
            .select('id')
        if ((removedAreas ?? []).length > 0) deleted = true
    }

    if (inventory != null) {
        await writeDemoInventory(admin, coachId, null)
        deleted = true
    }

    return { ok: true, deleted }
}

// ── Plantillas ───────────────────────────────────────────────────────────────────────────────

/** Aplica una plantilla del catálogo (`TEMPLATE_CATALOG` de @eva/onboarding) a un alumno. */
export async function applyTemplate(
    admin: SupabaseClient<Database>,
    input: { coachId: string; clientId: string; templateId: string }
): Promise<ApplyTemplateResult> {
    const { coachId, clientId, templateId } = input
    if (clientId.trim() === '') return { ok: false, reason: 'error', detail: 'clientId_requerido' }

    const blueprint = resolveTemplateBlueprint(templateId)
    if (blueprint == null) return { ok: false, reason: 'template_desconocida' }

    // La autorización vive en el SERVIDOR: el alumno tiene que ser de este coach. El cliente admin
    // bypassea RLS, así que este check no es defensa en profundidad — es LA defensa.
    const { data: client } = await admin
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('coach_id', coachId)
        .maybeSingle()
    if (client == null) return { ok: false, reason: 'error', detail: 'alumno_fuera_del_coach' }

    if (blueprint.kind === 'nutrition') {
        const plan = await writeNutritionPlanV2(admin, { coachId, clientId, blueprint: blueprint.plan })
        if ('error' in plan) return { ok: false, reason: 'error', detail: plan.error }
        return { ok: true, planId: plan.planId }
    }

    const written = await writeProgram(admin, {
        coachId,
        clientId,
        blueprint: blueprint.program,
        startDaysAgo: 0,
        isActive: true,
    })
    if ('error' in written) return { ok: false, reason: 'error', detail: written.error }
    return { ok: true, programId: written.programId }
}

/** Id del alumno de ejemplo del coach (null si no hay). Funciona con cualquier cliente que pueda leer `clients`. */
export async function getDemoClientId(db: SupabaseClient<Database>, coachId: string): Promise<string | null> {
    const { data } = await db
        .from('clients')
        .select('id')
        .eq('coach_id', coachId)
        .eq('is_demo', true)
        .eq('is_archived', false)
        .limit(1)
        .maybeSingle()
    return data?.id ?? null
}

/** Áreas propias que siembra cada persona (F3.5). Lo consume `Opciones › Mi panel` en W2. */
export const PERSONA_BUILDER_AREAS: Record<Persona, readonly { name: string; slug: string }[]> = {
    strength: [],
    nutrition: [],
    rehab: REHAB_AREAS,
    endurance: ENDURANCE_AREAS,
    other: [],
}

/** Blueprint del contenido de una persona, para tests y para el empty state template-first. */
export function demoBlueprintForPersona(
    persona: Persona,
): { kind: 'program'; program: ProgramBlueprint } | { kind: 'nutrition'; plan: NutritionPlanBlueprint } | null {
    const templateId = DEMO_TEMPLATE_BY_PERSONA[persona]
    return templateId == null ? null : resolveTemplateBlueprint(templateId)
}
