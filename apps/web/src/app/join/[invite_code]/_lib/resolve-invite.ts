import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

type Admin = SupabaseClient<Database>

/**
 * C-KILL (2026-07-04): standalone (coaches.invite_code) auto-registration is OFF.
 * The coach adds students manually from their panel — killing the max_clients gap at
 * the root. Shown by BOTH the /join page (renders the disabled state instead of the
 * form) and the join action (defense-in-depth: never creates auth.user / clients row).
 * Team and org invites keep the self-signup flow intact.
 */
export const STANDALONE_REGISTRATION_DISABLED_MESSAGE =
    'El registro directo está desactivado — pedile a tu coach que te agregue desde su panel.'

/**
 * B-7 / A.bis2: an invite code ENCODES SCOPE.
 *  - organization_members.invite_code  → ENTERPRISE alumno (org_id set, org branding)
 *  - teams.invite_code                 → TEAM/pool alumno (team_id set, team branding, coach = owner)
 *  - coaches.invite_code               → STANDALONE alumno (org_id null, coach branding)
 *
 * Enterprise/team are checked before standalone so a (hypothetical) code shared between
 * spaces resolves to the managed context. Generation guarantees no such overlap
 * (generate_unique_invite_code checks the three spaces), but the order is defensive.
 */
export type InviteResolution =
    | {
          scope: 'standalone'
          coachId: string
          orgId: null
          teamId: null
          brandName: string
          primaryColor: string | null
          logoUrl: string | null
          welcomeMessage: string | null
          /** Where the new alumno logs in (also the "ya tienes cuenta" link). */
          loginHref: string
      }
    | {
          scope: 'enterprise'
          coachId: string
          orgId: string
          teamId: null
          brandName: string
          primaryColor: string | null
          logoUrl: string | null
          welcomeMessage: string | null
          loginHref: string
      }
    | {
          scope: 'team'
          /** Pool: the clients row is stamped with the team OWNER as coach_id (collaborative reads ignore it). */
          coachId: string
          orgId: null
          teamId: string
          brandName: string
          primaryColor: string | null
          logoUrl: string | null
          welcomeMessage: null
          loginHref: string
      }
    | null

export async function resolveInvite(admin: Admin, code: string): Promise<InviteResolution> {
    // 1) Enterprise code (active coach membership) → org-scoped, org branding.
    const { data: member } = await admin
        .from('organization_members')
        .select(
            'org_id, coach_id, organizations(name, primary_color, logo_url), coaches(slug, brand_name, welcome_message, primary_color, logo_url)'
        )
        .eq('invite_code', code)
        .eq('status', 'active')
        .is('deleted_at', null)
        .not('coach_id', 'is', null)
        .maybeSingle()

    if (member?.coach_id) {
        const org = member.organizations as unknown as
            | { name: string | null; primary_color: string | null; logo_url: string | null }
            | null
        const coach = member.coaches as unknown as
            | { slug: string | null; brand_name: string | null; welcome_message: string | null; primary_color: string | null; logo_url: string | null }
            | null
        return {
            scope: 'enterprise',
            coachId: member.coach_id,
            orgId: member.org_id,
            teamId: null,
            brandName: org?.name ?? coach?.brand_name ?? 'EVA',
            primaryColor: org?.primary_color ?? coach?.primary_color ?? null,
            logoUrl: org?.logo_url ?? coach?.logo_url ?? null,
            welcomeMessage: coach?.welcome_message ?? null,
            loginHref: `/c/${coach?.slug ?? ''}/login`,
        }
    }

    // 2) Team code → pool-scoped (team_id), TEAM branding, alumno entra por /t/[slug].
    const { data: team } = await admin
        .from('teams')
        .select('id, slug, name, primary_color, logo_url, owner_coach_id')
        .eq('invite_code', code)
        .is('deleted_at', null)
        .maybeSingle()

    if (team) {
        return {
            scope: 'team',
            coachId: team.owner_coach_id,
            orgId: null,
            teamId: team.id,
            brandName: team.name,
            primaryColor: team.primary_color ?? null,
            logoUrl: team.logo_url ?? null,
            welcomeMessage: null,
            loginHref: `/t/${team.slug}/login`,
        }
    }

    // 3) Standalone code → coach-scoped, coach branding.
    const { data: coach } = await admin
        .from('coaches')
        .select('id, slug, brand_name, primary_color, logo_url, welcome_message')
        .eq('invite_code', code)
        .maybeSingle()

    if (coach) {
        return {
            scope: 'standalone',
            coachId: coach.id,
            orgId: null,
            teamId: null,
            brandName: coach.brand_name ?? 'EVA',
            primaryColor: coach.primary_color ?? null,
            logoUrl: coach.logo_url ?? null,
            welcomeMessage: coach.welcome_message ?? null,
            loginHref: `/c/${coach.slug ?? ''}/login`,
        }
    }

    return null
}
