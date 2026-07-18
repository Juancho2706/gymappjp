// Logica PURA de derivacion del contexto de workspace del coach (E7-01). El modulo bajo test no
// importa react-native/expo/supabase, asi que corre con el runner del repo (vitest, glob `tests/**`).
import { describe, it, expect } from 'vitest'
import {
    DEFAULT_WORKSPACE_CONTEXT,
    applyActiveWorkspace,
    buildWorkspaceRefs,
    deriveWorkspaceContext,
    hasEffectiveAccess,
    isManagedSubscription,
    normalizeWorkspaceContext,
    parseCachedWorkspaceContext,
    pickActiveWorkspace,
    resolveReactivateRequired,
    serializeWorkspaceContext,
    type RawWorkspaceData,
    type WorkspaceRef,
} from '../../apps/mobile/lib/workspace-core'

const coach = (over: Partial<RawWorkspaceData['coach'] & object> = {}): RawWorkspaceData['coach'] => ({
    id: 'coach-1',
    full_name: 'Ana Coach',
    brand_name: 'AnaFit',
    slug: 'anafit',
    subscription_status: 'active',
    active_org_id: null,
    ...over,
})

const base = (over: Partial<RawWorkspaceData> = {}): RawWorkspaceData => ({
    userId: 'coach-1',
    coach: coach(),
    memberships: [],
    orgId: null,
    orgName: null,
    ...over,
})

const team = (over: Partial<RawWorkspaceData['memberships'][number]> = {}): RawWorkspaceData['memberships'][number] => ({
    teamId: 'team-1',
    name: 'Movida',
    slug: 'movida',
    ownerCoachId: 'other-coach',
    canManage: false,
    deletedAt: null,
    suspendedAt: null,
    ...over,
})

const NOW = Date.parse('2026-07-09T00:00:00Z')
const FUTURE = '2026-08-09T00:00:00Z'
const PAST = '2026-06-09T00:00:00Z'

// ── kind: standalone / enterprise / team_owner / team_member ─────────────────────────────────────

describe('deriveWorkspaceContext — kind', () => {
    it('coach solo (sin team ni org) => standalone', () => {
        const ctx = deriveWorkspaceContext(base())
        expect(ctx.kind).toBe('standalone')
        expect(ctx.teamId).toBeNull()
        expect(ctx.orgId).toBeNull()
        expect(ctx.canManageTeam).toBe(false)
        expect(ctx.isManaged).toBe(false)
        expect(ctx.workspaces).toHaveLength(1)
        expect(ctx.workspaces[0]).toMatchObject({ kind: 'standalone', isActive: true })
    })

    it('coach org_managed => enterprise, isManaged, sin standalone', () => {
        const ctx = deriveWorkspaceContext(
            base({ coach: coach({ subscription_status: 'org_managed' }), orgId: 'org-9', orgName: 'BigBox' }),
        )
        expect(ctx.kind).toBe('enterprise')
        expect(ctx.orgId).toBe('org-9')
        expect(ctx.teamId).toBeNull()
        expect(ctx.isManaged).toBe(true)
        expect(ctx.workspaces.map((w) => w.kind)).toEqual(['enterprise'])
    })

    it('coach team_managed miembro de pool => team_member, isManaged, sin standalone', () => {
        const ctx = deriveWorkspaceContext(
            base({
                coach: coach({ subscription_status: 'team_managed' }),
                memberships: [team({ ownerCoachId: 'other-coach', canManage: false })],
            }),
        )
        expect(ctx.kind).toBe('team_member')
        expect(ctx.teamId).toBe('team-1')
        expect(ctx.isManaged).toBe(true)
        expect(ctx.canManageTeam).toBe(false)
        expect(ctx.workspaces.map((w) => w.kind)).toEqual(['team_member'])
    })

    it('coach team_managed OWNER del pool => team_owner + canManageTeam', () => {
        const ctx = deriveWorkspaceContext(
            base({
                coach: coach({ subscription_status: 'team_managed' }),
                memberships: [team({ ownerCoachId: 'coach-1' })],
            }),
        )
        expect(ctx.kind).toBe('team_owner')
        expect(ctx.canManageTeam).toBe(true)
    })

    it('co-gestor (can_manage=true, no owner) => canManageTeam', () => {
        const ctx = deriveWorkspaceContext(
            base({
                coach: coach({ subscription_status: 'team_managed' }),
                memberships: [team({ ownerCoachId: 'other', canManage: true })],
            }),
        )
        expect(ctx.kind).toBe('team_member')
        expect(ctx.canManageTeam).toBe(true)
    })

    it('active_org_id (sin metadata) tambien detecta enterprise', () => {
        const ctx = deriveWorkspaceContext(
            base({ coach: coach({ subscription_status: 'org_managed', active_org_id: 'org-x' }), orgId: null }),
        )
        expect(ctx.orgId).toBe('org-x')
        expect(ctx.kind).toBe('enterprise')
    })
})

// ── workspaces[]: coach standalone + team a la vez, prioridad del activo ──────────────────────────

describe('buildWorkspaceRefs / pickActiveWorkspace', () => {
    it('coach con billing propio + team ajeno => 2 workspaces, activo = standalone (default)', () => {
        const ctx = deriveWorkspaceContext(
            base({ coach: coach({ subscription_status: 'pro' }), memberships: [team({ ownerCoachId: 'coach-1' })] }),
        )
        expect(ctx.workspaces).toHaveLength(2)
        expect(ctx.kind).toBe('standalone')
        expect(ctx.teamId).toBeNull()
        // El team sigue listado (para el switcher) con canManage true, pero no es el activo.
        const teamRef = ctx.workspaces.find((w) => w.teamId === 'team-1')
        expect(teamRef).toMatchObject({ kind: 'team_owner', canManage: true, isActive: false })
    })

    it('kill-switch: team suspendido/borrado NO se lista', () => {
        expect(buildWorkspaceRefs(base({ memberships: [team({ suspendedAt: '2026-01-01' })] }))).toHaveLength(1)
        expect(buildWorkspaceRefs(base({ memberships: [team({ deletedAt: '2026-01-01' })] }))).toHaveLength(1)
        // (el 1 restante es el standalone del coach active)
    })

    it('dedup por id (misma membresia duplicada)', () => {
        const refs = buildWorkspaceRefs(
            base({ coach: coach({ subscription_status: 'team_managed' }), memberships: [team(), team()] }),
        )
        expect(refs).toHaveLength(1)
    })

    it('pickActiveWorkspace: 0 => null, 1 => ese, prioridad standalone>enterprise>owner>member', () => {
        expect(pickActiveWorkspace([])).toBeNull()
        const owner: WorkspaceRef = { id: 'team:a', kind: 'team_owner', label: 'A', teamId: 'a', orgId: null, canManage: true, isActive: false }
        const member: WorkspaceRef = { id: 'team:b', kind: 'team_member', label: 'B', teamId: 'b', orgId: null, canManage: false, isActive: false }
        const ent: WorkspaceRef = { id: 'enterprise:o', kind: 'enterprise', label: 'O', teamId: null, orgId: 'o', canManage: false, isActive: false }
        expect(pickActiveWorkspace([member])).toBe(member)
        expect(pickActiveWorkspace([owner, member, ent])?.kind).toBe('enterprise')
        expect(pickActiveWorkspace([owner, member])?.kind).toBe('team_owner')
    })

    it('pickActiveWorkspace: preferredId presente manda por sobre la prioridad; ausente => default', () => {
        const owner: WorkspaceRef = { id: 'team:a', kind: 'team_owner', label: 'A', teamId: 'a', orgId: null, canManage: true, isActive: false }
        const standalone: WorkspaceRef = { id: 'standalone:c', kind: 'standalone', label: 'C', teamId: null, orgId: null, canManage: true, isActive: false }
        // Sin preferencia => standalone (prioridad). Con preferencia al team => team.
        expect(pickActiveWorkspace([owner, standalone])?.id).toBe('standalone:c')
        expect(pickActiveWorkspace([owner, standalone], 'team:a')?.id).toBe('team:a')
        // preferredId inexistente (ej. team borrado) => cae al default determinista.
        expect(pickActiveWorkspace([owner, standalone], 'team:zzz')?.id).toBe('standalone:c')
    })

    it('deriveWorkspaceContext respeta preferredId para elegir el activo', () => {
        const data = base({ coach: coach({ subscription_status: 'pro' }), memberships: [team({ ownerCoachId: 'coach-1' })] })
        const ctx = deriveWorkspaceContext(data, 'team:team-1')
        expect(ctx.kind).toBe('team_owner')
        expect(ctx.teamId).toBe('team-1')
        expect(ctx.workspaces.find((w) => w.id === 'team:team-1')?.isActive).toBe(true)
    })

    it('applyActiveWorkspace: switch sin refetch recomputa kind/teamId/isActive; id ausente => intacto', () => {
        const ctx = deriveWorkspaceContext(
            base({ coach: coach({ subscription_status: 'pro' }), memberships: [team({ ownerCoachId: 'coach-1' })] }),
        )
        expect(ctx.kind).toBe('standalone') // default
        const switched = applyActiveWorkspace(ctx, 'team:team-1')
        expect(switched.kind).toBe('team_owner')
        expect(switched.teamId).toBe('team-1')
        expect(switched.canManageTeam).toBe(true)
        expect(switched.subscriptionState).toBe('pro') // del coach, no del ref
        expect(switched.workspaces.find((w) => w.id === 'team:team-1')?.isActive).toBe(true)
        expect(switched.workspaces.find((w) => w.kind === 'standalone')?.isActive).toBe(false)
        // id desconocido => contexto intacto (misma referencia).
        expect(applyActiveWorkspace(ctx, 'nope')).toBe(ctx)
    })

    it('edge: sin fila coach => contexto standalone por defecto (sin workspaces)', () => {
        const ctx = deriveWorkspaceContext(base({ coach: null }))
        expect(ctx.kind).toBe('standalone')
        expect(ctx.workspaces).toHaveLength(0)
        expect(ctx.subscriptionState).toBe('active')
    })

    it('edge: team_managed pero el team quedo invisible (RLS) => standalone reducido, isManaged', () => {
        const ctx = deriveWorkspaceContext(
            base({ coach: coach({ subscription_status: 'team_managed' }), memberships: [] }),
        )
        expect(ctx.kind).toBe('standalone')
        expect(ctx.isManaged).toBe(true)
        expect(ctx.workspaces).toHaveLength(0)
    })
})

// ── subscriptionState + guard de reactivar (espejo de coach-subscription-gate.ts) ────────────────

describe('subscriptionState + guard de reactivar', () => {
    it('subscriptionState espeja el estado crudo', () => {
        expect(deriveWorkspaceContext(base({ coach: coach({ subscription_status: 'past_due' }) })).subscriptionState).toBe('past_due')
        expect(deriveWorkspaceContext(base({ coach: coach({ subscription_status: 'canceled' }) })).subscriptionState).toBe('canceled')
    })

    it('isManagedSubscription', () => {
        expect(isManagedSubscription('org_managed')).toBe(true)
        expect(isManagedSubscription('team_managed')).toBe(true)
        expect(isManagedSubscription('active')).toBe(false)
        expect(isManagedSubscription(null)).toBe(false)
    })

    it('hasEffectiveAccess: active/trialing con acceso; managed siempre', () => {
        expect(hasEffectiveAccess('active', null, NOW)).toBe(true)
        expect(hasEffectiveAccess('org_managed', null, NOW)).toBe(true)
        expect(hasEffectiveAccess('team_managed', null, NOW)).toBe(true)
    })

    it('hasEffectiveAccess: canceled/past_due/paused/trialing => gracia hasta current_period_end', () => {
        for (const st of ['canceled', 'past_due', 'paused', 'trialing']) {
            expect(hasEffectiveAccess(st, FUTURE, NOW)).toBe(true) // dentro de gracia
            expect(hasEffectiveAccess(st, PAST, NOW)).toBe(false) // gracia vencida
            expect(hasEffectiveAccess(st, null, NOW)).toBe(false) // sin fecha => sin gracia
        }
    })

    it('hasEffectiveAccess: pending_payment/expired => bloqueo inmediato (sin gracia)', () => {
        expect(hasEffectiveAccess('pending_payment', FUTURE, NOW)).toBe(false)
        expect(hasEffectiveAccess('expired', FUTURE, NOW)).toBe(false)
    })

    it('resolveReactivateRequired: fuerza reactivar solo si perdio acceso y tiene billing propio', () => {
        expect(resolveReactivateRequired('active', null, NOW)).toBe(false)
        expect(resolveReactivateRequired('canceled', FUTURE, NOW)).toBe(false) // aun con acceso
        expect(resolveReactivateRequired('canceled', PAST, NOW)).toBe(true) // gracia vencida
        expect(resolveReactivateRequired('expired', null, NOW)).toBe(true)
        expect(resolveReactivateRequired('org_managed', null, NOW)).toBe(false) // managed nunca
        expect(resolveReactivateRequired('team_managed', null, NOW)).toBe(false)
        expect(resolveReactivateRequired(null, null, NOW)).toBe(false)
    })
})

// ── (de)serializacion de la cache ────────────────────────────────────────────────────────────────

describe('serializacion de cache', () => {
    it('round-trip preserva el contexto', () => {
        const ctx = deriveWorkspaceContext(
            base({ coach: coach({ subscription_status: 'team_managed' }), memberships: [team({ ownerCoachId: 'coach-1' })] }),
        )
        expect(parseCachedWorkspaceContext(serializeWorkspaceContext(ctx))).toEqual(ctx)
    })

    it('cache corrupta / forma invalida => DEFAULT', () => {
        expect(parseCachedWorkspaceContext('{no json')).toEqual(DEFAULT_WORKSPACE_CONTEXT)
        expect(parseCachedWorkspaceContext(null)).toEqual(DEFAULT_WORKSPACE_CONTEXT)
        expect(normalizeWorkspaceContext({ kind: 'nope' })).toEqual(DEFAULT_WORKSPACE_CONTEXT)
        expect(normalizeWorkspaceContext(42)).toEqual(DEFAULT_WORKSPACE_CONTEXT)
    })

    it('normalize descarta refs invalidas pero conserva las validas', () => {
        const out = normalizeWorkspaceContext({
            kind: 'standalone',
            teamId: null,
            orgId: null,
            isManaged: false,
            canManageTeam: false,
            subscriptionState: 'active',
            workspaces: [{ id: 'standalone:c', kind: 'standalone', label: 'X', canManage: true, isActive: true }, { bad: 1 }],
        })
        expect(out.workspaces).toHaveLength(1)
        expect(out.workspaces[0].id).toBe('standalone:c')
    })
})
