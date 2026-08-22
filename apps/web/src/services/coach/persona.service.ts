import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import type { Persona } from '@eva/schemas'
import {
    DOMAIN_ENABLED_KEY,
    FEATURE_DOMAIN_KEYS,
    resolvePersonaPrefs,
    type FeatureDomain,
    type SectionPrefs,
} from '@eva/feature-prefs'

/**
 * services/coach/persona.service — la PERSONA del coach (onboarding v2, SPEC
 * coach-onboarding-v2 §1 y §2) como lógica de servicio, sin Next.js.
 *
 * Tres responsabilidades, en capas:
 *  1. RESOLVERS PUROS del gate de primer ingreso (`shouldRedirectToPersona` y amigos): deciden si
 *     un coach tiene que pasar por «¿A qué te dedicas?» antes de seguir. Puros = unit-testeables
 *     sin DB ni request, y con eso el gate puede vivir donde SÍ se conoce la ruta (`proxy.ts`).
 *  2. LECTURA/ESCRITURA de `coaches.persona*` y de las 5 filas de `coach_feature_prefs`
 *     (una por dominio) que la persona siembra. Reciben el cliente Supabase por parámetro: el
 *     caller decide si va con la sesión del usuario (RLS + column-grants, que es lo correcto para
 *     estas dos tablas) o con service-role.
 *  3. El SET de dominios apagados que consume `getVisibleNavItems` (@eva/coach-nav) para achicar
 *     el menú — la MISMA fuente en web y en RN.
 *
 * Autorización: acá NO hay checks de sesión. `coachId` siempre viene resuelto por el caller desde
 * la sesión (nunca del body) y la RLS/column-grants de `coaches` y `coach_feature_prefs` son el
 * gate real. La UI nunca autoriza.
 */

type DB = SupabaseClient<Database>

/** Ruta de la pantalla «¿A qué te dedicas?». Una sola definición para el gate y para los links. */
export const PERSONA_ROUTE = '/coach/onboarding/persona'

/**
 * Corte de «coach nuevo» (decisión D8 del owner): quien nace desde el lanzamiento de onboarding v2
 * ve la pantalla SIEMPRE (aunque ya tenga alumnos, cosa que no puede pasar en el primer ingreso).
 * Los anteriores solo si no tienen ni un alumno real — el resto recibe la tarjeta «Elige tu
 * especialidad» en el dashboard (W2-B), sin gate.
 *
 * Misma fecha que el índice parcial de `coach_onboarding_events` de la migración
 * `20260822002122_onboarding_v2_persona_demo.sql`.
 */
export const PERSONA_GATE_LAUNCH_ISO = '2026-08-22T00:00:00Z'

const PERSONA_GATE_LAUNCH_MS = Date.parse(PERSONA_GATE_LAUNCH_ISO)

/**
 * Rutas de /coach que el gate NUNCA intercepta:
 *  - `/coach/onboarding/*`: la pantalla misma (redirigir sobre ella sería un loop) y el
 *    `complete` del alta por OAuth.
 *  - `/coach/reactivate` y `/coach/subscription`: el coach bloqueado o vencido tiene que poder
 *    pagar. Elegir persona no puede quedar por delante de recuperar la cuenta.
 */
const PERSONA_GATE_EXEMPT_PREFIXES = ['/coach/onboarding', '/coach/reactivate', '/coach/subscription'] as const

/** ¿La ruta está exenta del gate? Match exacto o subruta (`/coach/onboarding/persona`). */
export function isPersonaGateExemptPath(pathname: string): boolean {
    return PERSONA_GATE_EXEMPT_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
    )
}

/** ¿El coach está administrado por una org o un team? Ahí el panel no es suyo: nunca se le pregunta. */
function isManagedCoach(subscriptionStatus: string | null, workspaceType: string | null): boolean {
    return (
        subscriptionStatus === 'org_managed' ||
        subscriptionStatus === 'team_managed' ||
        workspaceType === 'enterprise_coach' ||
        workspaceType === 'coach_team'
    )
}

export interface PersonaGateCheapInput {
    /** Ruta que se está sirviendo. */
    pathname: string
    /** `coaches.persona`. Cualquier valor no nulo ⇒ el coach ya contestó. */
    persona: string | null
    /** `coaches.subscription_status`. */
    subscriptionStatus: string | null
    /** Workspace ACTIVO (`WorkspaceType`). null/desconocido ⇒ standalone. */
    workspaceType: string | null
}

/**
 * Chequeos BARATOS del gate (sin tocar la base): ruta exenta, persona ya elegida, coach managed.
 * Existe separado de `shouldRedirectToPersona` para que el caller pueda saltarse la consulta de
 * alumnos cuando ya sabe que el gate no aplica (el 99% de los requests).
 */
export function personaGateApplies(input: PersonaGateCheapInput): boolean {
    if (input.persona != null && input.persona !== '') return false
    if (isPersonaGateExemptPath(input.pathname)) return false
    if (isManagedCoach(input.subscriptionStatus, input.workspaceType)) return false
    return true
}

/** ¿El coach nació después del corte de onboarding v2? Fecha inválida/ausente ⇒ `false` (conservador). */
export function isCoachCreatedAfterPersonaLaunch(coachCreatedAt: string | null | undefined): boolean {
    if (!coachCreatedAt) return false
    const ms = Date.parse(coachCreatedAt)
    if (Number.isNaN(ms)) return false
    return ms >= PERSONA_GATE_LAUNCH_MS
}

export interface PersonaGateInput extends PersonaGateCheapInput {
    /** `coaches.created_at`. */
    coachCreatedAt: string | null
    /**
     * Alumnos REALES del coach (el conteo de `countActiveStandaloneClients`, que ya excluye
     * `is_demo`). `null` = no se pudo/no se quiso consultar ⇒ el gate NO redirige (fail-open: una
     * lectura caída jamás puede secuestrar el panel de un coach que ya trabaja).
     */
    realClientCount: number | null
}

/**
 * Decisión del gate D8: ¿este request tiene que ir a la pantalla de persona?
 *
 * `persona IS NULL && !managed && ruta no exenta && (coach nuevo || 0 alumnos reales)`.
 *
 * PURA a propósito: el gate real corre en `proxy.ts` (el único lugar del stack que conoce el
 * pathname ANTES de renderizar; un layout de Next no lo recibe y redirigir desde él sobre la
 * propia ruta de persona sería un loop infinito).
 */
export function shouldRedirectToPersona(input: PersonaGateInput): boolean {
    if (!personaGateApplies(input)) return false
    if (isCoachCreatedAfterPersonaLaunch(input.coachCreatedAt)) return true
    return input.realClientCount === 0
}

// ── Persona del coach (tabla `coaches`) ──────────────────────────────────────────────────────

export interface CoachPersonaSnapshot {
    persona: Persona | null
    /** `coaches.persona_also_other`: la segunda pregunta de la pantalla. */
    alsoOther: boolean
    personaSetAt: string | null
}

/** Lee la persona del coach. `persona` desconocida en DB (CHECK futuro) ⇒ se devuelve tal cual. */
export async function readCoachPersona(db: DB, coachId: string): Promise<CoachPersonaSnapshot> {
    const { data } = await db
        .from('coaches')
        .select('persona, persona_also_other, persona_set_at')
        .eq('id', coachId)
        .maybeSingle()
    return {
        persona: (data?.persona as Persona | null) ?? null,
        alsoOther: data?.persona_also_other === true,
        personaSetAt: data?.persona_set_at ?? null,
    }
}

/**
 * Persiste la persona en `coaches` (columnas propias, decisión D7 — no jsonb).
 * Se escribe con el cliente del USUARIO: la migración le dio
 * `grant update (persona, persona_also_other, persona_set_at)` a `authenticated` y la RLS de
 * `coaches` acota la fila a la suya. Nunca con service-role: no hace falta y sería un privilegio
 * de más en un camino que dispara el propio coach.
 */
export async function saveCoachPersona(
    db: DB,
    coachId: string,
    persona: Persona,
    alsoOther: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
    const { error } = await db
        .from('coaches')
        .update({
            persona,
            persona_also_other: alsoOther,
            persona_set_at: new Date().toISOString(),
        })
        .eq('id', coachId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
}

// ── Preferencias por dominio (tabla `coach_feature_prefs`) ───────────────────────────────────

/** Fila cruda de `coach_feature_prefs` que le importa a esta capa. */
export interface CoachDomainPrefsRow {
    domain: string
    preset: string | null
    sections: SectionPrefs
}

function asSections(value: unknown): SectionPrefs {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as SectionPrefs) : {}
}

/**
 * TODAS las filas de preferencias del coach, en UNA query (antes se leía una por dominio).
 * Se usa para el nav (dominios apagados) y para hidratar «Opciones › Mi panel».
 */
export async function readCoachDomainPrefs(db: DB, coachId: string): Promise<CoachDomainPrefsRow[]> {
    const { data, error } = await db
        .from('coach_feature_prefs')
        .select('domain, preset, sections')
        .eq('coach_id', coachId)
    if (error) throw error
    return (data ?? []).map((row) => ({
        domain: row.domain,
        preset: row.preset ?? null,
        sections: asSections(row.sections),
    }))
}

/**
 * Dominios cuyo master switch `_enabled` está en `false` — exactamente el `disabledDomains` que
 * consume `getVisibleNavItems`.
 *
 * FAIL-OPEN por diseño: dominio sin fila, o con fila sin la key, es VISIBLE. Un coach que nunca
 * tocó nada (o que nunca eligió persona) ve el menú completo, igual que hoy.
 */
export function disabledDomainsFromPrefs(rows: readonly CoachDomainPrefsRow[]): string[] {
    const disabled: string[] = []
    for (const row of rows) {
        if (row.sections[DOMAIN_ENABLED_KEY] === false) disabled.push(row.domain)
    }
    return disabled
}

/** Fila lista para el upsert de `coach_feature_prefs`. */
export interface CoachDomainPrefsUpsert {
    coach_id: string
    domain: FeatureDomain
    preset: string
    sections: Json
    updated_at: string
}

/**
 * Arma el upsert de los 5 dominios a partir de la persona, PRESERVANDO lo que el coach ya había
 * configurado: solo se pisa la key reservada `_enabled`. Los toggles de secciones y el `preset`
 * de cada dominio quedan intactos (cambiar de persona no puede borrar la configuración fina de
 * nutrición que alguien armó a mano).
 *
 * PURA (recibe las filas existentes y devuelve el payload) para poder testear la matriz completa
 * sin base de datos.
 */
export function buildPersonaPrefsUpsert(
    coachId: string,
    persona: Persona,
    alsoOther: boolean,
    existingRows: readonly CoachDomainPrefsRow[],
    now: Date = new Date(),
): CoachDomainPrefsUpsert[] {
    const desired = resolvePersonaPrefs(persona, alsoOther)
    const existingByDomain = new Map(existingRows.map((row) => [row.domain, row]))
    const updatedAt = now.toISOString()

    return FEATURE_DOMAIN_KEYS.map((domain) => {
        const existing = existingByDomain.get(domain)
        const sections: SectionPrefs = {
            ...(existing?.sections ?? {}),
            [DOMAIN_ENABLED_KEY]: desired[domain][DOMAIN_ENABLED_KEY],
        }
        return {
            coach_id: coachId,
            domain,
            // `preset` no lo decide la persona: se conserva el guardado y, si no hay, el default
            // seguro del catálogo (`basico`, mismo que `normalizePreset`).
            preset: existing?.preset ?? 'basico',
            sections: sections as Json,
            updated_at: updatedAt,
        }
    })
}

/**
 * Siembra/actualiza las 5 filas de `coach_feature_prefs` según la persona. Un solo upsert.
 * Con el cliente del USUARIO (RLS `coach_feature_prefs_owner_all` es el gate).
 */
export async function writePersonaDomainPrefs(
    db: DB,
    coachId: string,
    persona: Persona,
    alsoOther: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
    let existingRows: CoachDomainPrefsRow[] = []
    try {
        existingRows = await readCoachDomainPrefs(db, coachId)
    } catch {
        // Sin lectura previa se siembra igual (el coach nuevo no tiene filas); lo único que se
        // pierde es la preservación de toggles finos, no la coherencia del panel.
        existingRows = []
    }

    const { error } = await db
        .from('coach_feature_prefs')
        .upsert(buildPersonaPrefsUpsert(coachId, persona, alsoOther, existingRows), {
            onConflict: 'coach_id,domain',
        })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
}

/**
 * Master switch de UN dominio desde «Mi panel», sin tocar el resto de la fila (secciones + preset)
 * ni los otros dominios. Es el toggle manual: no re-ejecuta la matriz de la persona.
 */
export async function setCoachDomainEnabled(
    db: DB,
    coachId: string,
    domain: FeatureDomain,
    enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
    let existing: CoachDomainPrefsRow | undefined
    try {
        existing = (await readCoachDomainPrefs(db, coachId)).find((row) => row.domain === domain)
    } catch {
        existing = undefined
    }

    const sections: SectionPrefs = {
        ...(existing?.sections ?? {}),
        [DOMAIN_ENABLED_KEY]: enabled,
    }

    const { error } = await db.from('coach_feature_prefs').upsert(
        {
            coach_id: coachId,
            domain,
            preset: existing?.preset ?? 'basico',
            sections: sections as Json,
            updated_at: new Date().toISOString(),
        },
        { onConflict: 'coach_id,domain' },
    )
    if (error) return { ok: false, error: error.message }
    return { ok: true }
}

// ── Telemetría ───────────────────────────────────────────────────────────────────────────────

/**
 * `step_key` de los eventos que NO son un paso de la guía (`persona_selected`, `demo_seeded`,
 * `demo_deleted`). La columna es `text NOT NULL` sin CHECK, y el índice único parcial solo aplica
 * a `event_type = 'step_completed'`, así que un valor propio no colisiona con la guía.
 */
export const PERSONA_EVENT_STEP_KEY = 'persona'

export interface OnboardingEventInput {
    coachId: string
    eventType: string
    stepKey?: string
    metadata?: Record<string, string | number | boolean | null>
}

/**
 * Inserta un evento en `coach_onboarding_events` con el cliente ADMIN (la tabla no tiene grants de
 * INSERT para `authenticated`: el endpoint `/api/coach/onboarding-events` también escribe con
 * service-role). Best-effort: la telemetría NUNCA rompe la acción que la dispara.
 */
export async function recordOnboardingEvent(admin: DB, input: OnboardingEventInput): Promise<void> {
    try {
        const { error } = await admin.from('coach_onboarding_events').insert({
            coach_id: input.coachId,
            step_key: input.stepKey ?? PERSONA_EVENT_STEP_KEY,
            event_type: input.eventType,
            metadata: (input.metadata ?? null) as Json | null,
        })
        // supabase-js NO lanza: el error viaja en la respuesta. El try/catch cubre lo otro
        // (red caída, cliente mal construido).
        if (error) console.warn('[persona] evento rechazado', input.eventType, error.message)
    } catch (error) {
        console.warn('[persona] no se pudo registrar el evento', input.eventType, error)
    }
}
