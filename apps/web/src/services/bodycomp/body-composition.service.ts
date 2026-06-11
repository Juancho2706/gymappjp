import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { assertModule } from '@/services/entitlements.service'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { logTeamClientAccess } from '@/services/team/team.service'
import { computeIsak } from '@/domain/bodycomp'
import { BodyCompositionCreateSchema } from '@eva/schemas/bodycomp'
import * as repo from '@/infrastructure/db/body-composition.repository'
import {
    biaMetricsToJson,
    isakRawToDomain,
    isakRawToJson,
    isakResultToMetricsJson,
} from './body-composition.mappers'

type DB = SupabaseClient<Database>

/**
 * Service de composicion corporal (datos de salud, Ley 21.719). Orquesta, en ESTE orden:
 *   1. kill-switch de plataforma (Edge Config) — ANTES del entitlement
 *   2. validacion Zod (discriminado por metodo)
 *   3. scoping 3-vias del workspace ACTIVO + write-access al cliente
 *   4. assertModule('body_composition', ctx) — gate per-tenant/per-workspace
 *   5. consentimiento de salud activo (solo contexto team)
 *   6. si ISAK -> computeIsak (puro) -> metrics derivados; si BIA -> metrics capturados
 *   7. insert (RLS = techo) + bitacora best-effort (solo team)
 * Todas las guardas corren SERVER-SIDE antes de persistir.
 */

/** El kill-switch global esta activo -> el modulo se apaga para TODOS los tenants sin deploy. */
export class BodyCompositionKillSwitchError extends Error {
    constructor() {
        super('Modulo de composicion corporal deshabilitado temporalmente (kill-switch).')
        this.name = 'BodyCompositionKillSwitchError'
    }
}

/**
 * Kill-switch de plataforma (operador EVA), espeja `free_tier_kill_switch` de proxy.ts.
 * Lee `body_composition_kill_switch` de Vercel Edge Config. Default ausente = habilitado;
 * Edge Config no disponible = fail-open (consistente con proxy.ts). Solo el flag en `true`
 * apaga el modulo (lever del riesgo Director §3: un % grasa mal calculado expuesto a todos).
 */
export async function assertBodyCompositionEnabled(): Promise<void> {
    const edgeConfigId = process.env.EDGE_CONFIG
    if (!edgeConfigId) return
    try {
        const { get } = await import('@vercel/edge-config')
        const killed = await get<boolean>('body_composition_kill_switch')
        if (killed === true) throw new BodyCompositionKillSwitchError()
    } catch (e) {
        if (e instanceof BodyCompositionKillSwitchError) throw e
        // Edge Config inaccesible -> fail open (no bloquear por un fallo de infra de flags).
    }
}

export type CoachClientScope = { orgId: string | null; activeTeamId: string | null }

/**
 * Scope del coach por workspace ACTIVO (sin cruzar contextos). Replica la logica privada de
 * client-detail.service (no se importa para no tocar ese archivo): standalone | enterprise | team.
 */
async function getCoachClientScope(db: DB, userId: string): Promise<CoachClientScope> {
    const workspace = await resolvePreferredWorkspace(db, userId)
    if (!workspace || workspace.type === 'coach_standalone') {
        return { orgId: null, activeTeamId: null }
    }
    if (workspace.type === 'enterprise_coach') {
        return { orgId: workspace.orgId, activeTeamId: null }
    }
    if (workspace.type === 'coach_team') {
        return { orgId: null, activeTeamId: workspace.teamId }
    }
    throw new Error('Workspace not allowed for body composition operations')
}

export type WriteAccess = CoachClientScope & {
    viaTeam: boolean
    teamId: string | null
}

/**
 * Verifica que el coach autenticado puede ESCRIBIR mediciones del cliente bajo su workspace
 * activo (analogo a assertCoachClientReadAccess, sin importarlo). Devuelve el contexto resuelto.
 */
export async function assertCoachClientWriteAccess(
    db: DB,
    userId: string,
    clientId: string
): Promise<WriteAccess> {
    const scope = await getCoachClientScope(db, userId)

    // TEAM: cualquier miembro del pool escribe sobre alumnos de ESE team (RLS = techo).
    if (scope.activeTeamId) {
        const { data: poolClient } = await db
            .from('clients')
            .select('id, team_id')
            .eq('id', clientId)
            .eq('team_id', scope.activeTeamId)
            .maybeSingle()
        if (poolClient) return { ...scope, viaTeam: true, teamId: scope.activeTeamId }
        throw new Error('Client not found')
    }

    // ENTERPRISE / STANDALONE: cliente propio. Standalone excluye pool (team_id NULL) y org.
    let q = db.from('clients').select('id').eq('id', clientId).eq('coach_id', userId)
    q = scope.orgId ? q.eq('org_id', scope.orgId) : q.is('org_id', null)
    if (!scope.orgId) q = q.is('team_id', null)
    const { data: client, error } = await q.maybeSingle()
    if (error) throw new Error('Client access check failed')
    if (client) return { ...scope, viaTeam: false, teamId: null }
    throw new Error('Client not found')
}

/** Consentimiento de salud activo (Ley 21.719) — exigido en contexto team antes de persistir. */
async function assertHealthConsent(db: DB, clientId: string, teamId: string): Promise<void> {
    const { data } = await db
        .from('client_consents')
        .select('id')
        .eq('client_id', clientId)
        .eq('team_id', teamId)
        .eq('purpose', 'health_data_processing')
        .is('revoked_at', null)
        .maybeSingle()
    if (!data) {
        throw new Error('El alumno no tiene consentimiento de datos de salud activo en este equipo.')
    }
}

export type SaveBodyCompositionResult = {
    row: repo.BodyCompositionRow
}

/**
 * Guarda una medicion (BIA o ISAK). `input` es el payload crudo del cliente; se valida con el
 * MISMO schema que usa el formulario. `db` es el cliente request-scoped (RLS = techo).
 */
export async function saveBodyComposition(
    db: DB,
    userId: string,
    input: unknown
): Promise<SaveBodyCompositionResult> {
    // 1) Kill-switch de plataforma — antes de cualquier entitlement.
    await assertBodyCompositionEnabled()

    // 2) Validacion Zod (discriminado por metodo). Rechaza payload desconocido.
    const parsed = BodyCompositionCreateSchema.parse(input)

    // 3) Scoping + write-access bajo el workspace activo.
    const access = await assertCoachClientWriteAccess(db, userId, parsed.clientId)
    const ctx = access.viaTeam
        ? { teamId: access.teamId }
        : { coachId: userId }

    // 4) Entitlement del modulo por contexto del recurso (team manda; si no, coach).
    await assertModule(db, 'body_composition', ctx)

    // 5) Consentimiento de salud (solo team).
    let consentConfirmedAt: string | null = null
    if (access.viaTeam && access.teamId) {
        await assertHealthConsent(db, parsed.clientId, access.teamId)
        consentConfirmedAt = new Date().toISOString()
    }

    // 6) Calculo (ISAK) / captura (BIA).
    const nowIso = new Date().toISOString()
    const common = {
        client_id: parsed.clientId,
        coach_id: userId,
        team_id: access.viaTeam ? access.teamId : null,
        org_id: null,
        measured_at: parsed.measuredAt ?? nowIso,
        device_brand: parsed.deviceBrand ?? null,
        device_model: parsed.deviceModel ?? null,
        measurement_conditions: (parsed.measurementConditions ?? {}) as repo.BodyCompositionInsert['measurement_conditions'],
        notes: parsed.notes ?? null,
        source: 'manual' as const,
        consent_confirmed_at: consentConfirmedAt,
        created_by: userId,
    }

    let values: repo.BodyCompositionInsert
    if (parsed.method === 'isak') {
        const domainRaw = isakRawToDomain(parsed.rawInput)
        const result = computeIsak(domainRaw, { bodyFatEquation: parsed.bodyFatEquation })
        values = {
            ...common,
            method: 'isak',
            weight_kg: parsed.weightKg ?? parsed.rawInput.weightKg,
            height_cm: parsed.heightCm ?? parsed.rawInput.heightCm,
            equation_used: result.equationUsed,
            raw_input: isakRawToJson(parsed.rawInput),
            metrics: isakResultToMetricsJson(result),
            is_validated: false, // SPEC AC7: label "preliminar" mientras no se valide vs ficha real
        }
    } else {
        values = {
            ...common,
            method: 'bia',
            weight_kg: parsed.weightKg ?? null,
            height_cm: parsed.heightCm ?? null,
            equation_used: null,
            raw_input: {},
            metrics: biaMetricsToJson(parsed.metrics),
            is_validated: false,
        }
    }

    // 7) Persistencia (RLS = techo) + bitacora best-effort (solo team).
    const { row, error } = await repo.insert(db, values)
    if (error || !row) {
        throw new Error(error ?? 'No se pudo guardar la medicion de composicion corporal.')
    }

    if (access.viaTeam && access.teamId) {
        await logTeamClientAccess(db, {
            teamId: access.teamId,
            actorCoachId: userId,
            clientId: parsed.clientId,
            resource: 'body_composition',
            action: 'create',
            metadata: { method: parsed.method },
        })
    }

    return { row }
}

/** Soft-delete de una medicion con las mismas guardas (kill-switch + module + write-access). */
export async function deleteBodyComposition(
    db: DB,
    userId: string,
    id: string
): Promise<void> {
    await assertBodyCompositionEnabled()

    const existing = await repo.getById(db, id)
    if (!existing) throw new Error('Medicion no encontrada.')

    const access = await assertCoachClientWriteAccess(db, userId, existing.client_id)
    const ctx = access.viaTeam ? { teamId: access.teamId } : { coachId: userId }
    await assertModule(db, 'body_composition', ctx)

    const { error } = await repo.softDelete(db, id)
    if (error) throw new Error(error)

    if (access.viaTeam && access.teamId) {
        await logTeamClientAccess(db, {
            teamId: access.teamId,
            actorCoachId: userId,
            clientId: existing.client_id,
            resource: 'body_composition',
            action: 'delete',
            metadata: { method: existing.method },
        })
    }
}

export type ClientMeasurements = {
    bia: repo.BodyCompositionRow[]
    isak: repo.BodyCompositionRow[]
}

/**
 * Lectura para el RSC/_data — kill-switch + write-access + assertModule ya verificados aguas
 * arriba (se recibe el `access` resuelto). AC6 (Ley 21.719) aplica TAMBIEN a la lectura:
 * en contexto team, LEER mediciones sin consentimiento de salud activo falla server-side,
 * y la operacion queda en `team_access_logs` (resource 'body_composition', action 'view',
 * best-effort, UNA entrada por carga — mismo patron que getClientMovementDetail).
 */
export async function listClientMeasurements(
    db: DB,
    userId: string,
    access: WriteAccess,
    clientId: string
): Promise<ClientMeasurements> {
    if (access.viaTeam && access.teamId) {
        await assertHealthConsent(db, clientId, access.teamId)
    }
    const [bia, isak] = await Promise.all([
        repo.listByClientAndMethod(db, clientId, 'bia'),
        repo.listByClientAndMethod(db, clientId, 'isak'),
    ])
    if (access.viaTeam && access.teamId) {
        await logTeamClientAccess(db, {
            teamId: access.teamId,
            actorCoachId: userId,
            clientId,
            resource: 'body_composition',
            action: 'view',
            metadata: {},
        })
    }
    return { bia, isak }
}
