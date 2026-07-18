/**
 * workspace-core — logica PURA de derivacion del contexto de workspace del coach en mobile (E7-01).
 * CERO react-native / expo / supabase: toma las filas CRUDAS (coaches + team_members + org meta) y
 * deriva el `WorkspaceContext` (kind / teamId / orgId / isManaged / canManageTeam / subscriptionState
 * / workspaces). Es el ESPEJO mobile de services/auth/workspace.service.ts (web) — misma nocion de
 * standalone / coach_team (owner|member) / enterprise, colapsada al enum que consume la app.
 *
 * TODOS los dominios coach (hub, suscripcion, marca, team, switcher, nav) consumen ESTE contexto:
 * nadie re-deriva. La glue de red / AsyncStorage / hook vive en `workspace.ts`; aca solo va lo puro
 * y testeable con el runner del repo (vitest colecta por `tests/**`).
 *
 * Ademas espeja el GUARD de suscripcion de la web (lib/coach-subscription-gate.ts) — `hasEffectiveAccess`
 * / `resolveReactivateRequired` — para que E7-12 gatee /coach/reactivate con la MISMA logica (incluida
 * la gracia hasta current_period_end del cancel/dunning). CONSUMIDORES: NO comparen `subscriptionState`
 * crudo (`=== 'canceled'`) para gatear — un cancelado conserva acceso hasta el corte; usen SIEMPRE
 * `resolveReactivateRequired(status, currentPeriodEnd)`.
 */

/** Contextos del coach, colapsados a un enum unico (el activo define kind/teamId/orgId). */
export type WorkspaceKind = 'standalone' | 'team_owner' | 'team_member' | 'enterprise'

/** Un workspace navegable del coach (alimenta el switcher T13). */
export interface WorkspaceRef {
    /** Key estable (React + match): `standalone:{coachId}` | `team:{teamId}` | `enterprise:{orgId}`. */
    id: string
    kind: WorkspaceKind
    label: string
    /** Set solo para team_owner/team_member. */
    teamId: string | null
    /** Set solo para enterprise. */
    orgId: string | null
    /** Team: ¿el coach puede gestionar (owner o co-gestor)? Standalone => true; enterprise => false. */
    canManage: boolean
    /** ¿Es el workspace ACTIVO (el que define kind/teamId/orgId del contexto)? */
    isActive: boolean
}

/** Contrato consumido por todos los dominios coach (E7-01). */
export interface WorkspaceContext {
    kind: WorkspaceKind
    teamId: string | null
    orgId: string | null
    /** Plan gestionado por org/team (sin billing ni marca propia): oculta suscripcion/marca personal. */
    isManaged: boolean
    /** ¿El coach puede gestionar el TEAM activo (owner o co-gestor)? false fuera de contexto team. */
    canManageTeam: boolean
    /** Estado CRUDO de suscripcion (espejo de coaches.subscription_status). Ver nota del guard. */
    subscriptionState: string
    workspaces: WorkspaceRef[]
}

/** Estados de suscripcion "managed": billing gestionado por org (enterprise) o team (pool). */
export const MANAGED_STATUSES = ['org_managed', 'team_managed'] as const

/**
 * Estados que bloquean el panel SIN gracia (espejo EXACTO de SUBSCRIPTION_BLOCKED_STATUSES de la web,
 * lib/constants.ts). `canceled` NO esta (conserva acceso hasta current_period_end). `org_managed`
 * tampoco (acceso siempre). paused/past_due caen antes en la rama de gracia de `hasEffectiveAccess`.
 */
export const SUBSCRIPTION_BLOCKED_STATUSES = ['pending_payment', 'expired', 'past_due', 'paused'] as const

/** Prioridad del workspace ACTIVO cuando el coach pertenece a varios (sin persistencia; T13 la sobreescribe). */
const ACTIVE_PRIORITY: readonly WorkspaceKind[] = ['standalone', 'enterprise', 'team_owner', 'team_member']

const WORKSPACE_KINDS: readonly WorkspaceKind[] = ['standalone', 'team_owner', 'team_member', 'enterprise']

// ── Entrada CRUDA (la resuelve `workspace.ts` via PostgREST RLS del coach) ───────────────────────

export interface RawCoachRow {
    id: string
    full_name: string | null
    brand_name: string | null
    slug: string | null
    subscription_status: string | null
    active_org_id: string | null
}

export interface RawTeamMembership {
    teamId: string
    name: string | null
    slug: string | null
    ownerCoachId: string | null
    /** team_members.can_manage del PROPIO coach en ese team. */
    canManage: boolean
    /** Kill-switch del operador: team borrado/suspendido => workspace invisible (espejo web). */
    deletedAt: string | null
    suspendedAt: string | null
}

export interface RawWorkspaceData {
    userId: string
    coach: RawCoachRow | null
    memberships: RawTeamMembership[]
    /** app_metadata.org_id (o coaches.active_org_id) — enterprise se detecta por metadata, no RLS. */
    orgId: string | null
    orgName: string | null
}

/** Contexto fail-safe (sin sesion / sin cache): standalone, acceso abierto (no fuerza reactivar). */
export const DEFAULT_WORKSPACE_CONTEXT: WorkspaceContext = {
    kind: 'standalone',
    teamId: null,
    orgId: null,
    isManaged: false,
    canManageTeam: false,
    subscriptionState: 'active',
    workspaces: [],
}

// ── Guard de suscripcion (espejo de lib/coach-subscription-gate.ts de la web) ────────────────────

/** Coach "managed" (sin billing propio): plan gestionado por la org (enterprise) o el team (pool). */
export function isManagedSubscription(status: string | null | undefined): boolean {
    return status === 'org_managed' || status === 'team_managed'
}

/**
 * ¿El coach tiene acceso EFECTIVO por estado + fecha de corte? Espejo EXACTO de la web:
 *  - managed => siempre.
 *  - canceled / trialing / paused / past_due => gracia hasta current_period_end.
 *  - pending_payment / expired => bloqueo inmediato.
 *  - resto (active, ...) => acceso.
 * `now` inyectable para tests deterministas (default Date.now()).
 */
export function hasEffectiveAccess(
    subscriptionStatus: string | null | undefined,
    currentPeriodEnd: string | null | undefined,
    now: number = Date.now(),
): boolean {
    if (isManagedSubscription(subscriptionStatus)) return true
    const status = subscriptionStatus ?? ''

    if (status === 'canceled' || status === 'trialing' || status === 'paused' || status === 'past_due') {
        if (!currentPeriodEnd) return false
        return new Date(currentPeriodEnd).getTime() > now
    }

    const blocked = new Set<string>(SUBSCRIPTION_BLOCKED_STATUSES as readonly string[])
    if (blocked.has(status)) return false

    return true
}

/**
 * ¿Se debe FORZAR /coach/reactivate? (E7-12). true solo si el coach tiene billing propio y perdio el
 * acceso efectivo. managed / sin estado => nunca reactivar. Espejo de resolveCoachSubscriptionRedirect.
 */
export function resolveReactivateRequired(
    subscriptionStatus: string | null | undefined,
    currentPeriodEnd: string | null | undefined,
    now: number = Date.now(),
): boolean {
    if (!subscriptionStatus) return false
    if (isManagedSubscription(subscriptionStatus)) return false
    return !hasEffectiveAccess(subscriptionStatus, currentPeriodEnd, now)
}

// ── Derivacion del contexto ──────────────────────────────────────────────────────────────────────

/**
 * Construye la lista de workspaces navegables del coach (espejo de listUserWorkspaces, recorte coach):
 *  - standalone: solo si hay fila coach Y el estado NO es managed (org/team no tienen identidad standalone).
 *  - enterprise: si hay orgId (metadata o active_org_id).
 *  - team_owner/team_member: una por cada membresia ACTIVA no suspendida (owner por owner_coach_id).
 * Dedup por `id`.
 */
export function buildWorkspaceRefs(data: RawWorkspaceData): WorkspaceRef[] {
    const refs: WorkspaceRef[] = []
    const status = data.coach?.subscription_status ?? null
    const managed = isManagedSubscription(status)
    const orgId = data.orgId ?? data.coach?.active_org_id ?? null

    if (data.coach && !managed) {
        refs.push({
            id: `standalone:${data.coach.id}`,
            kind: 'standalone',
            label: data.coach.brand_name || data.coach.full_name || 'Mi negocio EVA',
            teamId: null,
            orgId: null,
            canManage: true,
            isActive: false,
        })
    }

    if (orgId) {
        refs.push({
            id: `enterprise:${orgId}`,
            kind: 'enterprise',
            label: data.orgName || 'Organización',
            teamId: null,
            orgId,
            canManage: false,
            isActive: false,
        })
    }

    for (const m of data.memberships) {
        if (!m.teamId || m.deletedAt || m.suspendedAt) continue
        const isOwner = m.ownerCoachId === data.userId
        refs.push({
            id: `team:${m.teamId}`,
            kind: isOwner ? 'team_owner' : 'team_member',
            label: m.name || 'Equipo',
            teamId: m.teamId,
            orgId: null,
            canManage: isOwner || m.canManage,
            isActive: false,
        })
    }

    return dedupeById(refs)
}

/**
 * Elige el workspace ACTIVO cuando hay varios. Sin preferencia persistida (T13 la aporta): default
 * determinista por prioridad (standalone es el "hogar" del coach con negocio propio). 0 => null.
 */
export function pickActiveWorkspace(refs: WorkspaceRef[], preferredId?: string | null): WorkspaceRef | null {
    if (refs.length === 0) return null
    // Preferencia persistida del switcher (T13/E7-07): si el coach eligio un workspace y sigue
    // presente (no borrado/suspendido), ese manda por sobre la prioridad determinista.
    if (preferredId) {
        const preferred = refs.find((r) => r.id === preferredId)
        if (preferred) return preferred
    }
    if (refs.length === 1) return refs[0]
    for (const kind of ACTIVE_PRIORITY) {
        const found = refs.find((r) => r.kind === kind)
        if (found) return found
    }
    return refs[0]
}

/**
 * Cambia el workspace ACTIVO dentro de un contexto YA derivado (switcher T13/E7-07) SIN refetch:
 * re-marca `isActive` y recomputa kind/teamId/orgId/canManageTeam desde el ref elegido. `id` ausente
 * de la lista => contexto intacto. isManaged/subscriptionState son del coach (no del ref) y se
 * conservan. Es el reflejo inmediato del tap; la revalidacion posterior lo reafirma via preferredId.
 */
export function applyActiveWorkspace(ctx: WorkspaceContext, id: string): WorkspaceContext {
    const target = ctx.workspaces.find((w) => w.id === id)
    if (!target) return ctx
    const workspaces = ctx.workspaces.map((w) => ({ ...w, isActive: w.id === id }))
    const isTeam = target.kind === 'team_owner' || target.kind === 'team_member'
    return {
        kind: target.kind,
        teamId: isTeam ? target.teamId : null,
        orgId: target.kind === 'enterprise' ? target.orgId : null,
        isManaged: ctx.isManaged,
        canManageTeam: isTeam ? target.canManage : false,
        subscriptionState: ctx.subscriptionState,
        workspaces,
    }
}

/** Deriva el `WorkspaceContext` completo desde las filas crudas. NUNCA lanza. */
export function deriveWorkspaceContext(data: RawWorkspaceData, preferredId?: string | null): WorkspaceContext {
    const status = data.coach?.subscription_status ?? null
    const managed = isManagedSubscription(status)
    const subscriptionState = status ?? 'active'

    const refs = buildWorkspaceRefs(data)
    const active = pickActiveWorkspace(refs, preferredId)
    const workspaces = refs.map((r) => ({ ...r, isActive: active != null && r.id === active.id }))

    if (!active) {
        // Edge: managed sin team visible (RLS/suspendido) o sin fila coach. Hub standalone reducido.
        return {
            kind: 'standalone',
            teamId: null,
            orgId: null,
            isManaged: managed,
            canManageTeam: false,
            subscriptionState,
            workspaces,
        }
    }

    const isTeam = active.kind === 'team_owner' || active.kind === 'team_member'
    return {
        kind: active.kind,
        teamId: isTeam ? active.teamId : null,
        orgId: active.kind === 'enterprise' ? active.orgId : null,
        isManaged: managed,
        canManageTeam: isTeam ? active.canManage : false,
        subscriptionState,
        workspaces,
    }
}

// ── (De)serializacion para la cache de AsyncStorage ──────────────────────────────────────────────

export function serializeWorkspaceContext(ctx: WorkspaceContext): string {
    return JSON.stringify(ctx)
}

function isWorkspaceKind(v: unknown): v is WorkspaceKind {
    return typeof v === 'string' && (WORKSPACE_KINDS as readonly string[]).includes(v)
}

function normalizeRef(v: unknown): WorkspaceRef | null {
    if (!v || typeof v !== 'object') return null
    const r = v as Record<string, unknown>
    if (typeof r.id !== 'string' || !isWorkspaceKind(r.kind)) return null
    return {
        id: r.id,
        kind: r.kind,
        label: typeof r.label === 'string' ? r.label : '',
        teamId: typeof r.teamId === 'string' ? r.teamId : null,
        orgId: typeof r.orgId === 'string' ? r.orgId : null,
        canManage: r.canManage === true,
        isActive: r.isActive === true,
    }
}

/** Normaliza (valida tipos de) un contexto cacheado. Corrupcion / forma invalida => DEFAULT. */
export function normalizeWorkspaceContext(raw: unknown): WorkspaceContext {
    if (!raw || typeof raw !== 'object') return DEFAULT_WORKSPACE_CONTEXT
    const c = raw as Record<string, unknown>
    if (!isWorkspaceKind(c.kind)) return DEFAULT_WORKSPACE_CONTEXT
    const workspaces = Array.isArray(c.workspaces)
        ? c.workspaces.map(normalizeRef).filter((r): r is WorkspaceRef => r != null)
        : []
    return {
        kind: c.kind,
        teamId: typeof c.teamId === 'string' ? c.teamId : null,
        orgId: typeof c.orgId === 'string' ? c.orgId : null,
        isManaged: c.isManaged === true,
        canManageTeam: c.canManageTeam === true,
        subscriptionState: typeof c.subscriptionState === 'string' ? c.subscriptionState : 'active',
        workspaces,
    }
}

/** Parsea el contexto cacheado; cualquier corrupcion => DEFAULT (NUNCA lanza). */
export function parseCachedWorkspaceContext(raw: string | null | undefined): WorkspaceContext {
    if (!raw) return DEFAULT_WORKSPACE_CONTEXT
    try {
        return normalizeWorkspaceContext(JSON.parse(raw))
    } catch {
        return DEFAULT_WORKSPACE_CONTEXT
    }
}

function dedupeById(refs: WorkspaceRef[]): WorkspaceRef[] {
    const seen = new Set<string>()
    const out: WorkspaceRef[] = []
    for (const r of refs) {
        if (seen.has(r.id)) continue
        seen.add(r.id)
        out.push(r)
    }
    return out
}
