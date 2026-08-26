import {
    GUIDE_PROGRESS_KEY,
    PERSONA_SCOPED_STEP_KEYS,
    applyPersonaSwitch,
    normalizePersonaProgress,
    readPersonaProgress,
    type OnboardingSignals,
    type PersonaStepProgress,
} from '@eva/onboarding'
import { PERSONAS, type Persona } from '@eva/schemas'
import type { DbClient } from '@/infrastructure/db/interfaces'
import type { Json } from '@/lib/database.types'
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
    gt(column: string, value: string): UntypedCountQuery
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

/** Margen tras el seed: todo lo que escribe el sembrador cae adentro (tarda segundos, no minutos). */
const SEED_SETTLE_MS = 120_000

/**
 * `onboarding_guide.demo.seededAt` (inventario del alumno de ejemplo, `DemoInventory`), o `null` si
 * el coach no tiene demo sembrado (rama `other`, demo borrado, coach viejo). Puro y tolerante: un
 * jsonb raro nunca rompe la guía.
 */
export function readDemoSeededAt(guide: unknown): string | null {
    if (guide == null || typeof guide !== 'object') return null
    const demo = (guide as { demo?: unknown }).demo
    if (demo == null || typeof demo !== 'object') return null
    const seededAt = (demo as { seededAt?: unknown }).seededAt
    if (typeof seededAt !== 'string') return null
    return Number.isNaN(Date.parse(seededAt)) ? null : seededAt
}

/**
 * Corte temporal para «artefacto del coach»: lo que el seed escribió queda ANTES de `seededAt + 2 min`;
 * cualquier fila con `updated_at` posterior es obra del coach — un artefacto nuevo (incluido uno para
 * el propio demo, que es lo que crea la tarea guiada «primera rutina/pauta/semana») o el sembrado
 * editado (las tres tablas tienen trigger `set_updated_at`). Sin seed no hay corte: se cuenta todo.
 */
export function artifactCutoff(seededAt: string | null | undefined): string | null {
    if (!seededAt) return null
    const t = Date.parse(seededAt)
    if (Number.isNaN(t)) return null
    return new Date(t + SEED_SETTLE_MS).toISOString()
}

/** ISO válido o `null`. Un `persona_set_at` corrupto nunca puede recortar las señales. */
function safeIso(raw: unknown): string | null {
    if (typeof raw !== 'string' || raw === '') return null
    return Number.isNaN(Date.parse(raw)) ? null : raw
}

/** El MÁS TARDÍO de los dos cortes (cualquiera puede faltar). */
function laterIso(a: string | null, b: string | null): string | null {
    if (a == null) return b
    if (b == null) return a
    return Date.parse(a) >= Date.parse(b) ? a : b
}

/**
 * Corte de las señales que dependen de la especialidad (pasos 2 y 3).
 *
 * Son DOS cortes que se suman:
 *  - el del alumno de ejemplo (`seededAt + 2 min`): lo que escribió el seed no es trabajo del coach;
 *  - el de la ESPECIALIDAD (`coaches.persona_set_at`): lo hecho en otra rama no tilda la actual.
 *    Ese es el bug del QA del owner 22-08 — la plantilla que aplicó como fuerza le tildaba «Haz el
 *    screening de Pedro» al pasarse a rehabilitación. Lo hecho ANTES no desaparece: queda archivado
 *    en `onboarding_guide.progress[persona]` y vuelve cuando el coach vuelve a esa rama.
 *
 * Coach sin demo y sin `persona_set_at` (los 48 con persona NULL, coaches viejos) ⇒ sin corte:
 * se cuenta todo, exactamente como antes.
 */
export interface PersonaArtifactScope {
    /** `updated_at` mínimo para que una fila cuente. `null` = cuenta todo. */
    cutoff: string | null
    /** Instante en que el coach entró a su especialidad actual (`coaches.persona_set_at`). */
    personaEpoch: string | null
    /** jsonb crudo de `coaches.onboarding_guide` (trae `demo` y `progress`). */
    guide: unknown
}

export async function loadPersonaArtifactScope(db: DbClient, coachId: string): Promise<PersonaArtifactScope> {
    const { data } = await db
        .from('coaches')
        .select('onboarding_guide, persona_set_at')
        .eq('id', coachId)
        .maybeSingle()
    const guide = data?.onboarding_guide ?? null
    const personaEpoch = safeIso(data?.persona_set_at)
    return {
        cutoff: laterIso(artifactCutoff(readDemoSeededAt(guide)), personaEpoch),
        personaEpoch,
        guide,
    }
}

/**
 * ¿El coach ya creó el primer artefacto DE SU ESPECIALIDAD? (SPEC §6, paso 3). Un nutricionista
 * nunca podría tildar «crea tu primer programa» — ese era el drift del checklist v1.
 *
 * Cada rama mira SU tabla, y solo la suya (QA del owner 22-08): programa para fuerza, pauta V2
 * para nutrición, screening para rehabilitación, perfil cardio para resistencia. Antes rehab y
 * endurance aceptaban además cualquier `workout_programs`, y por eso la plantilla que el owner
 * aplicó como fuerza le tildó «Haz el screening de 7 patrones de Pedro» al cambiarse de rama.
 *
 * El alumno de ejemplo NO cuenta (W8.1.1) y lo hecho en OTRA especialidad tampoco (W8.1.3): solo
 * cuentan filas con `updated_at` posterior al corte de `loadPersonaArtifactScope` — el seed más
 * la entrada a la rama actual. Sin corte (coach sin demo ni `persona_set_at`) se cuenta todo.
 *
 * `scope` es opcional: lo pasa quien ya leyó la fila del coach (`loadOnboardingSignals`) para no
 * pagar la consulta dos veces.
 */
export async function resolveFirstArtifact(
    supabase: DbClient,
    userId: string,
    persona: Persona | null,
    scope?: PersonaArtifactScope,
): Promise<boolean> {
    const { cutoff } = scope ?? (await loadPersonaArtifactScope(supabase, userId))

    const programs = () => {
        let q = supabase.from('workout_programs').select('id', { count: 'exact', head: true }).eq('coach_id', userId)
        if (cutoff) q = q.gt('updated_at', cutoff)
        return countOrZero(q)
    }
    const nutritionPlans = () => {
        let q = (supabase as unknown as UntypedCountClient)
            .from('nutrition_plans_v2')
            .select('id', { count: 'exact', head: true })
            .eq('coach_id', userId)
        if (cutoff) q = q.gt('updated_at', cutoff)
        return countOrZero(q)
    }
    const assessments = () => {
        let q = supabase
            .from('movement_assessments')
            .select('id', { count: 'exact', head: true })
            .eq('coach_id', userId)
        if (cutoff) q = q.gt('updated_at', cutoff)
        return countOrZero(q)
    }
    /**
     * Resistencia: el perfil cardio vive en columnas de `clients` (`resting_hr`, `ref_5k_time_sec`,
     * que escribe `coach/cardio/_actions`). Cuenta el de un alumno REAL o el del propio demo si el
     * coach lo TOCÓ después del corte — «Revisa las zonas de Javiera» es justamente la tarea guiada,
     * y sin esa rama el paso 3 de resistencia sería intildable haciendo lo que la guía pide.
     */
    const cardioProfiles = async () => {
        const real = countOrZero(
            supabase
                .from('clients')
                .select('id', { count: 'exact', head: true })
                .eq('coach_id', userId)
                .eq('is_archived', false)
                .eq('is_demo', false)
                .or('ref_5k_time_sec.not.is.null,resting_hr.not.is.null'),
        )
        if (cutoff == null) return (await real) > 0

        const demoTouched = countOrZero(
            supabase
                .from('clients')
                .select('id', { count: 'exact', head: true })
                .eq('coach_id', userId)
                .eq('is_archived', false)
                .eq('is_demo', true)
                .or('ref_5k_time_sec.not.is.null,resting_hr.not.is.null')
                .gt('updated_at', cutoff),
        )
        const [realCount, touchedCount] = await Promise.all([real, demoTouched])
        return realCount > 0 || touchedCount > 0
    }

    switch (persona) {
        case 'nutrition':
            return (await nutritionPlans()) > 0
        case 'rehab':
            return (await assessments()) > 0
        case 'endurance':
            return cardioProfiles()
        case 'other':
        case null: {
            // Panel completo: no hay «mundo» propio, cuenta cualquiera de los dos artefactos.
            const [programCount, planCount] = await Promise.all([programs(), nutritionPlans()])
            return programCount > 0 || planCount > 0
        }
        case 'strength':
        default:
            return (await programs()) > 0
    }
}

/**
 * Momento en que la web empezó a escribir `vive_tu_app_entered` (docs/specs/vive-tu-app-directo §2).
 *
 * ⚠️ PLACEHOLDER: W5.2 lo reemplaza por el timestamp REAL del deploy, justo antes de desplegar.
 * Mientras el valor esté en el futuro el resolver se comporta como hoy (manda `opened`), que es el
 * lado seguro del error: nadie pierde un tilde. Con el valor real, todo `opened` posterior al corte
 * deja de tildar —porque desde ahí existe la señal honesta— y los `opened` anteriores siguen
 * valiendo: son los 6 coaches que ya tenían el paso 2 tildado con el significado viejo y no se les
 * puede quitar.
 */
export const VIVE_TU_APP_ENTERED_CUTOVER = '2026-08-26T06:00:00.000Z'

/**
 * Paso 2 («Mira tu app con tu marca») acotado a la especialidad vigente: entrar como Matías no es
 * entrar como Pedro. Lo hecho en la rama anterior no se pierde — vuelve por
 * `onboarding_guide.progress[persona]`.
 *
 * DOS señales, y la diferencia es lo que arregla esta spec: `vive_tu_app_entered` lo escribe
 * `/vive-tu-app` cuando el coach ENTRÓ de verdad; `vive_tu_app_opened` solo dice que PIDIÓ el link
 * (el 23-08, 6 de 6 coaches tenían el paso tildado y solo 2 habían entrado). El viejo sigue
 * valiendo hasta el corte y nada más — grandfather por fecha, no por coach.
 *
 * PostgREST expresa el «o» con `.or(...)`: con dos `.eq('event_type', …)` la consulta sería una
 * conjunción imposible y el paso no se tildaría nunca.
 */
export async function resolveViveTuAppOpened(
    db: DbClient,
    coachId: string,
    personaEpoch: string | null,
): Promise<boolean> {
    const entered = personaEpoch
        ? `and(event_type.eq.vive_tu_app_entered,created_at.gte.${personaEpoch})`
        : 'event_type.eq.vive_tu_app_entered'
    const opened = personaEpoch
        ? `and(event_type.eq.vive_tu_app_opened,created_at.lt.${VIVE_TU_APP_ENTERED_CUTOVER},created_at.gte.${personaEpoch})`
        : `and(event_type.eq.vive_tu_app_opened,created_at.lt.${VIVE_TU_APP_ENTERED_CUTOVER})`

    const { data } = await db
        .from('coach_onboarding_events')
        .select('id')
        .eq('coach_id', coachId)
        .or(`${entered},${opened}`)
        .limit(1)
    return (data?.length ?? 0) > 0
}

/** `onboarding_guide.demo.persona`: la rama a la que pertenece el alumno de ejemplo vigente. */
export function readDemoPersona(guide: unknown): Persona | null {
    if (guide == null || typeof guide !== 'object') return null
    const demo = (guide as { demo?: unknown }).demo
    if (demo == null || typeof demo !== 'object') return null
    return parsePersona((demo as { persona?: unknown }).persona as string | null | undefined)
}

/**
 * BACKFILL de una sola vez para los coaches que ya se habían cambiado de especialidad ANTES de que
 * existiera la memoria por rama (W8.1.3, incluido el propio owner: su `completed` global dice
 * «primer artefacto hecho» por la rutina que armó como fuerza, y con eso la guía le tildaba el
 * screening de rehabilitación).
 *
 * No hay SQL de por medio: la primera vez que la guía se carga sin `onboarding_guide.progress`, lo
 * tildado se le atribuye a la rama del alumno de ejemplo vigente (`demo.persona` — el mundo en el
 * que ese trabajo se hizo) y el `completed` global pasa a ser la vista de la rama actual. Después
 * la clave `progress` existe y esto no vuelve a correr nunca.
 *
 * Conservador a propósito: sin persona actual, sin demo que atribuir o sin nada tildado NO se
 * escribe nada (no se le puede quitar un tilde a alguien de quien no sabemos en qué rama lo ganó).
 */
async function ensurePersonaProgress(
    db: DbClient,
    coachId: string,
    persona: Persona | null,
    scope: PersonaArtifactScope,
): Promise<PersonaStepProgress> {
    const guide = scope.guide
    const guideRecord = guide != null && typeof guide === 'object' && !Array.isArray(guide)
        ? (guide as Record<string, unknown>)
        : {}
    const alreadyMigrated =
        guideRecord[GUIDE_PROGRESS_KEY] != null && typeof guideRecord[GUIDE_PROGRESS_KEY] === 'object'
    if (alreadyMigrated || persona == null) return readPersonaProgress(guide, persona)

    const completed = normalizePersonaProgress(guideRecord.completed)
    const hasSomething = PERSONA_SCOPED_STEP_KEYS.some((key) => completed[key] === true)
    const demoPersona = readDemoPersona(guide)
    if (!hasSomething || demoPersona == null) return {}

    const patch = applyPersonaSwitch({ guide, from: demoPersona, to: persona, doneInFrom: completed })
    const { error } = await db
        .from('coaches')
        .update({
            onboarding_guide: {
                ...guideRecord,
                [GUIDE_PROGRESS_KEY]: patch.progress,
                completed: { ...(guideRecord.completed as Record<string, unknown> | undefined), ...patch.completed },
            } as Json,
            updated_at: new Date().toISOString(),
        })
        .eq('id', coachId)
    if (error) {
        // Que el backfill falle no puede tumbar la guía: las señales del servidor ya son correctas
        // (la memoria vacía es el estado seguro) y el intento se repite en la próxima carga.
        console.warn('[onboarding-v2] no se pudo migrar el progreso por especialidad:', error.message)
    }
    return patch.restored
}

/**
 * Los DOS pasos que dependen de la especialidad, medidos EN VIVO (sin la memoria archivada). Lo
 * usa el cambio de persona para saber qué guardar en la rama que se abandona.
 */
export async function loadPersonaScopedSignals(
    db: DbClient,
    coachId: string,
    persona: Persona | null,
    scope?: PersonaArtifactScope,
): Promise<PersonaStepProgress> {
    const resolved = scope ?? (await loadPersonaArtifactScope(db, coachId))
    const [viveTuApp, firstArtifact] = await Promise.all([
        resolveViveTuAppOpened(db, coachId, resolved.personaEpoch),
        resolveFirstArtifact(db, coachId, persona, resolved),
    ])
    return { vive_tu_app: viveTuApp, first_artifact: firstArtifact }
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
    return (await loadOnboardingSignalsDetailed(db, coachId, persona, brand)).signals
}

/** Lo mismo, más la memoria archivada de la especialidad: la API móvil la publica tal cual. */
export interface OnboardingSignalsDetailed {
    signals: OnboardingSignals
    /** `onboarding_guide.progress[persona]`: lo que el coach ya hizo EN ESTA rama. */
    personaProgress: PersonaStepProgress
}

export async function loadOnboardingSignalsDetailed(
    db: DbClient,
    coachId: string,
    persona: Persona | null,
    brand: BrandSignalRow,
): Promise<OnboardingSignalsDetailed> {
    // UNA lectura de `coaches` para los dos cortes (seed + especialidad) y para la memoria; antes
    // la pagaba `resolveFirstArtifact` por dentro, así que no hay consulta de más.
    const scope = await loadPersonaArtifactScope(db, coachId)
    // Lee la memoria de la rama y, la PRIMERA vez, migra a los coaches que ya se habían cambiado de
    // especialidad antes de que la memoria existiera (una escritura por coach, nunca más).
    const memory = await ensurePersonaProgress(db, coachId, persona, scope)

    const [viveTuAppOpened, hasFirstArtifact, realClients, workoutActivity, intakeActivity] = await Promise.all([
        resolveViveTuAppOpened(db, coachId, scope.personaEpoch),
        resolveFirstArtifact(db, coachId, persona, scope),
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
        signals: {
            hasBrand: hasCustomBrand(brand),
            // Las dos señales de la especialidad se SUMAN a lo archivado: la señal viva mira la
            // rama actual y la memoria devuelve lo que el coach ya había hecho en ella.
            viveTuAppOpened: viveTuAppOpened || memory.vive_tu_app === true,
            hasFirstArtifact: hasFirstArtifact || memory.first_artifact === true,
            realClients,
            realStudentActivity: (workoutActivity.data?.length ?? 0) > 0 || (intakeActivity.data?.length ?? 0) > 0,
        },
        personaProgress: memory,
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
    /**
     * Memoria de los pasos 2 y 3 EN LA ESPECIALIDAD ACTUAL (`onboarding_guide.progress[persona]`,
     * W8.1.3). `signals` ya la trae sumada; viaja aparte para que la app pueda distinguir «lo hizo
     * en esta rama» de «lo está haciendo ahora» sin re-derivarlo del jsonb crudo.
     */
    personaProgress: PersonaStepProgress
}

export async function loadOnboardingV2ApiData(
    db: DbClient,
    coachId: string,
    coach: OnboardingV2CoachRow,
    brand: BrandSignalRow,
): Promise<OnboardingV2ApiData> {
    const persona = parsePersona(coach.persona)

    const [gate, detailed, demoClientId] = await Promise.all([
        loadPersonaGateStatus(db, coachId, coach),
        loadOnboardingSignalsDetailed(db, coachId, persona, brand),
        getDemoClientId(db, coachId),
    ])
    const { signals, personaProgress } = detailed

    let demoName: string | null = null
    if (demoClientId != null) {
        const { data } = await db.from('clients').select('full_name').eq('id', demoClientId).maybeSingle()
        demoName = data?.full_name ?? null
    }

    return { ...gate, demoClientId, demoName, signals, personaProgress }
}
