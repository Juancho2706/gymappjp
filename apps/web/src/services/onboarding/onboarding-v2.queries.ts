import type { OnboardingSignals } from '@eva/onboarding'
import { PERSONAS, type Persona } from '@eva/schemas'
import type { DbClient } from '@/infrastructure/db/interfaces'
import { BRAND_PRIMARY_COLOR } from '@/lib/brand-assets'
import { countActiveStandaloneClients } from '@/services/billing/capacity.service'
import { getDemoClientId } from '@/services/onboarding/demo-student.service'
import { shouldAskPersonaOnMobile } from '@/services/coach/persona.service'

/**
 * services/onboarding/onboarding-v2.queries — las SEÑALES del onboarding v2
 * (docs/specs/coach-onboarding-v2/SPEC.md §6) como servicio, sin Next.js.
 *
 * POR QUÉ vive acá y no en `app/coach/dashboard/_data`: desde W5 hay DOS superficies que
 * necesitan exactamente las mismas señales — la guía web (`/coach/guia`, que las pide por
 * `getCoachOnboardingV2Data`) y la app RN (que las recibe por `/api/mobile/coach/dashboard`).
 * Un `_data` es request-scoped de la web y usa el cliente de la sesión por cookies; el endpoint
 * móvil autentica por Bearer y trabaja con el cliente admin. Lo único compartible es la CONSULTA,
 * y por eso recibe el cliente por parámetro (`DbClient`) en vez de construirlo.
 *
 * Autorización: acá NO hay checks de sesión. `coachId` lo resuelve el caller desde la sesión o el
 * token (nunca del body) y todas las consultas filtran por él explícitamente.
 *
 * `dashboard.queries.ts` re-exporta `parsePersona`, `hasCustomBrand` y `SEEDED_GREEN` para no
 * romper a sus consumidores (los tests de señales del día 1 los importan desde ahí).
 */

// ── Helpers puros ────────────────────────────────────────────────────────────────────────────

/** `coaches.persona` es `text` con CHECK: se valida contra la tupla del paquete antes de usarla. */
export function parsePersona(raw: string | null | undefined): Persona | null {
    if (raw == null) return null
    return (PERSONAS as readonly string[]).includes(raw) ? (raw as Persona) : null
}

/**
 * Colores que NO cuentan como «marca elegida»: el verde `#10B981` que los caminos de alta siembran
 * (drift «todo coach nuevo nace verde») y el azul EVA por defecto. Si el coach sigue en uno de los
 * dos, el paso 1 de la guía queda pendiente aunque la columna tenga un hex.
 */
const SEEDED_BRAND_COLORS = new Set(['#10b981', BRAND_PRIMARY_COLOR.toLowerCase()])

/** Verde sembrado en el alta — la tarjeta de marca preselecciona el azul EVA cuando lo ve. */
export const SEEDED_GREEN = '#10B981'

export interface BrandSignalRow {
    logo_url: string | null
    theme_preset_key: string | null
    primary_color: string | null
}

/**
 * ¿El coach ya tocó su marca? (SPEC §6, paso 1). Puro: logo, preset o un color que NO sea uno de
 * los dos sembrados. Exportado para poder testearlo sin base.
 */
export function hasCustomBrand(row: BrandSignalRow): boolean {
    if ((row.logo_url ?? '').trim() !== '') return true
    if ((row.theme_preset_key ?? '').trim() !== '') return true
    const color = (row.primary_color ?? '').trim().toLowerCase()
    return color !== '' && !SEEDED_BRAND_COLORS.has(color)
}

// ── Conteos sobre tablas todavía sin tipar ───────────────────────────────────────────────────

/** Cliente mínimo para tablas que `database.types.ts` todavía no tipa (`nutrition_plans_v2`). */
type UntypedCountQuery = PromiseLike<{ count: number | null }> & {
    eq(column: string, value: string): UntypedCountQuery
}
export type UntypedCountClient = {
    from(table: string): {
        select(columns: string, options: { count: 'exact'; head: true }): UntypedCountQuery
    }
}

export async function countOrZero(q: PromiseLike<{ count: number | null }>): Promise<number> {
    const { count } = await q
    return count ?? 0
}

/**
 * ¿El coach ya creó su primer artefacto? La señal cambia por persona (SPEC §6, paso 3) porque un
 * nutricionista nunca podría tildar «crea tu primer programa» — ese era el drift del checklist v1.
 */
export async function resolveFirstArtifact(
    supabase: DbClient,
    userId: string,
    persona: Persona | null,
): Promise<boolean> {
    const programs = () =>
        countOrZero(
            supabase.from('workout_programs').select('id', { count: 'exact', head: true }).eq('coach_id', userId),
        )
    const nutritionPlans = () =>
        countOrZero(
            (supabase as unknown as UntypedCountClient)
                .from('nutrition_plans_v2')
                .select('id', { count: 'exact', head: true })
                .eq('coach_id', userId),
        )

    switch (persona) {
        case 'nutrition':
            return (await nutritionPlans()) > 0
        case 'rehab':
            return (
                (await countOrZero(
                    supabase
                        .from('movement_assessments')
                        .select('id', { count: 'exact', head: true })
                        .eq('coach_id', userId),
                )) > 0
            )
        case 'endurance': {
            // Perfil cardio del alumno (FC de reposo / marca de 5K) o una semana ya armada.
            const [withCardio, programCount] = await Promise.all([
                countOrZero(
                    supabase
                        .from('clients')
                        .select('id', { count: 'exact', head: true })
                        .eq('coach_id', userId)
                        .eq('is_archived', false)
                        .or('ref_5k_time_sec.not.is.null,resting_hr.not.is.null'),
                ),
                programs(),
            ])
            return withCardio > 0 || programCount > 0
        }
        case 'other':
        case null: {
            // Panel completo: cuenta cualquiera de los dos artefactos.
            const [programCount, planCount] = await Promise.all([programs(), nutritionPlans()])
            return programCount > 0 || planCount > 0
        }
        case 'strength':
        default:
            return (await programs()) > 0
    }
}

// ── Señales de la guía ───────────────────────────────────────────────────────────────────────

/**
 * Las 5 señales del día 1, en UN solo `Promise.all`. La UI nunca vuelve a preguntar nada:
 * `resolveAutoCompleted` (@eva/onboarding) las convierte en pasos tildados.
 *
 * `brand` llega ya leído porque los dos callers cargan la fila de `coaches` de todos modos (la
 * web para el borrador de «Tu marca en 60 s», el endpoint móvil para el header del panel): pedirla
 * otra vez acá sería una query de más en cada carga.
 */
export async function loadOnboardingSignals(
    db: DbClient,
    coachId: string,
    persona: Persona | null,
    brand: BrandSignalRow,
): Promise<OnboardingSignals> {
    const [viveTuAppRows, hasFirstArtifact, realClients, workoutActivity, intakeActivity] = await Promise.all([
        db
            .from('coach_onboarding_events')
            .select('id')
            .eq('coach_id', coachId)
            .eq('event_type', 'vive_tu_app_opened')
            .limit(1),
        resolveFirstArtifact(db, coachId, persona),
        countActiveStandaloneClients(db, coachId).catch(() => 0),
        // El aha pertenece al alumno REAL: el demo trae actividad sembrada y tildaría el paso 5
        // el día 1 (de ahí `clients.is_demo = false` en los dos joins).
        db
            .from('workout_logs')
            .select('id, clients!inner(coach_id, is_demo, is_archived)')
            .eq('clients.coach_id', coachId)
            .eq('clients.is_demo', false)
            .eq('clients.is_archived', false)
            .limit(1),
        db
            .from('nutrition_intake_entries')
            .select('id, clients!inner(coach_id, is_demo, is_archived)')
            .eq('clients.coach_id', coachId)
            .eq('clients.is_demo', false)
            .eq('clients.is_archived', false)
            .limit(1),
    ])

    return {
        hasBrand: hasCustomBrand(brand),
        viveTuAppOpened: (viveTuAppRows.data?.length ?? 0) > 0,
        hasFirstArtifact,
        realClients,
        realStudentActivity: (workoutActivity.data?.length ?? 0) > 0 || (intakeActivity.data?.length ?? 0) > 0,
    }
}

// ── Contrato de la API móvil ─────────────────────────────────────────────────────────────────

/** Fila de `coaches` que necesita el gate de persona. La resuelve el caller (nunca el body). */
export interface OnboardingV2CoachRow {
    persona: string | null
    personaAlsoOther: boolean
    coachCreatedAt: string | null
    subscriptionStatus: string | null
    /** `WorkspaceType` del workspace ACTIVO (null ⇒ standalone). */
    workspaceType: string | null
}

/** Respuesta del gate de persona para RN: lo mismo que decide el `proxy.ts` en la web. */
export interface PersonaGateStatus {
    persona: Persona | null
    alsoOther: boolean
    needsPersona: boolean
}

/**
 * ¿La app tiene que mostrarle «¿A qué te dedicas?» a este coach? Mismos resolvers que el gate web
 * (`services/coach/persona.service`), con el conteo de alumnos REALES (excluye `is_demo`).
 *
 * El conteo solo se paga cuando hace falta: persona ya elegida corta antes de tocar la base.
 * Fail-open: si el conteo falla, `needsPersona` queda en `false` (una lectura caída jamás puede
 * secuestrar el panel de un coach que ya trabaja) — por eso el conteo es PROPIO y no se reusa el
 * `realClients` de las señales, que degrada a 0 ante un error y empujaría a la pantalla de persona
 * a un coach con cartera.
 */
export async function loadPersonaGateStatus(
    db: DbClient,
    coachId: string,
    coach: OnboardingV2CoachRow,
): Promise<PersonaGateStatus> {
    const persona = parsePersona(coach.persona)
    const alsoOther = coach.personaAlsoOther === true

    if (persona != null) return { persona, alsoOther, needsPersona: false }

    let realClientCount: number | null = null
    try {
        realClientCount = await countActiveStandaloneClients(db, coachId)
    } catch (error) {
        console.error('[onboarding-v2] conteo de alumnos no disponible para el gate de persona:', error)
    }

    return {
        persona,
        alsoOther,
        needsPersona: shouldAskPersonaOnMobile({
            persona: coach.persona,
            subscriptionStatus: coach.subscriptionStatus,
            workspaceType: coach.workspaceType,
            coachCreatedAt: coach.coachCreatedAt,
            realClientCount,
        }),
    }
}

/**
 * Bloque `onboardingV2` de `/api/mobile/coach/dashboard` — CONTRATO FIJO que consume la app
 * (`apps/mobile/lib/coach-dashboard.ts`, W5-B). La guía (`onboarding_guide`) NO se arma acá: la
 * parsea el route con `parseOnboardingGuide`, el mismo parser que usa la web.
 */
export interface OnboardingV2ApiData extends PersonaGateStatus {
    /** `null` cuando el coach no tiene alumno de ejemplo (rama `other` o demo borrado). */
    demoClientId: string | null
    /** Nombre REAL del alumno de ejemplo (el coach puede haberlo renombrado). */
    demoName: string | null
    signals: OnboardingSignals
}

export async function loadOnboardingV2ApiData(
    db: DbClient,
    coachId: string,
    coach: OnboardingV2CoachRow,
    brand: BrandSignalRow,
): Promise<OnboardingV2ApiData> {
    const persona = parsePersona(coach.persona)

    const [gate, signals, demoClientId] = await Promise.all([
        loadPersonaGateStatus(db, coachId, coach),
        loadOnboardingSignals(db, coachId, persona, brand),
        getDemoClientId(db, coachId),
    ])

    let demoName: string | null = null
    if (demoClientId != null) {
        const { data } = await db.from('clients').select('full_name').eq('id', demoClientId).maybeSingle()
        demoName = data?.full_name ?? null
    }

    return { ...gate, demoClientId, demoName, signals }
}
