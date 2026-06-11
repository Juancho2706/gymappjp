import { createServiceRoleClient } from '@/lib/supabase/admin-client'

/**
 * F1 — identity-split write chokepoint. Every client-creation flow (coach create, invite join,
 * org add/CSV, admin) calls this AFTER inserting the `clients` row to materialize the person's
 * identity: one `client_accounts` row (the person) + one active `client_memberships` row (the
 * context: standalone or per-org). Reads already prefer memberships with a legacy-`clients`
 * fallback (`listClientWorkspaces`), so this is purely additive and must be called NON-FATALLY —
 * a failure here still leaves a working login via the fallback.
 *
 * Uses a TRUE service-role client (no cookies): the callers' `createRawAdminClient` runs PostgREST
 * as the authenticated coach, who has no RLS write on `client_memberships` (self/org-admin/
 * service-role only). Idempotent: re-running yields the same single active row (unique-violation
 * 23505 is treated as success), so retries and double-submits are safe.
 */
export type MembershipScope = 'standalone' | 'enterprise' | 'team'

export interface CreateClientIdentityParams {
    /** auth.users.id — the person. Equals clientId in the current 1:1 model. */
    accountId: string
    /** clients.id (training data row). */
    clientId: string
    /** Assigned coach, or null for an org pool client. */
    coachId: string | null
    /** Org id for enterprise scope; null for standalone/team. Drives the scope. */
    orgId: string | null
    /** Team id for pool scope; null for standalone/enterprise. Drives the scope (org wins if both — no debería pasar: INV8). */
    teamId?: string | null
}

const UNIQUE_VIOLATION = '23505'

export async function createClientIdentity(
    params: CreateClientIdentityParams,
): Promise<{ ok: boolean; error?: string }> {
    const { accountId, clientId, coachId, orgId } = params
    const teamId = params.teamId ?? null
    const scope: MembershipScope = orgId ? 'enterprise' : teamId ? 'team' : 'standalone'

    // Defensive: this is a non-fatal side effect of client creation — it must NEVER throw and
    // break the calling flow (a failed write degrades to the legacy-clients read fallback).
    try {
        const admin = createServiceRoleClient()

        // 1) Account (one per auth user). Idempotent: ignore unique violation.
        const { error: accErr } = await admin.from('client_accounts').insert({ id: accountId })
        if (accErr && accErr.code !== UNIQUE_VIOLATION) {
            return { ok: false, error: `client_accounts: ${accErr.message}` }
        }

        // 2) Membership for this context. The partial unique indexes guarantee one active
        //    standalone per account + one active per (account, org); a duplicate (retry) surfaces
        //    as 23505 → ok.
        const { error: memErr } = await admin.from('client_memberships').insert({
            account_id: accountId,
            client_id: clientId,
            scope,
            coach_id: coachId,
            org_id: orgId,
            team_id: teamId,
            status: 'active',
        })
        if (memErr && memErr.code !== UNIQUE_VIOLATION) {
            return { ok: false, error: `client_memberships: ${memErr.message}` }
        }

        return { ok: true }
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'unknown error' }
    }
}
