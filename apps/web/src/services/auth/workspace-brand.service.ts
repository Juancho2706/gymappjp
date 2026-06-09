import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActiveWorkspace, WorkspaceBrand } from '@/domain/auth/types'
import type { Database } from '@/lib/database.types'
import { BRAND_APP_ICON, BRAND_PRIMARY_COLOR, SYSTEM_PRIMARY_COLOR } from '@/lib/brand-assets'
import { findWorkspaceCoachBrand, findWorkspaceOrgBrand } from '@/infrastructure/db/workspace.repository'

type DB = SupabaseClient<Database>

export async function resolveBrandForWorkspace(db: DB, workspace: ActiveWorkspace): Promise<WorkspaceBrand> {
    if (
        workspace.type === 'enterprise_staff' ||
        workspace.type === 'enterprise_coach' ||
        workspace.type === 'student_enterprise'
    ) {
        const org = await findWorkspaceOrgBrand(db, workspace.orgId)
        const primaryColor = org?.primary_color ?? BRAND_PRIMARY_COLOR
        return {
            workspaceType: workspace.type,
            brandName: org?.name ?? 'EVA Enterprise',
            primaryColor,
            logoUrl: org?.logo_url ?? BRAND_APP_ICON,
            loaderText: (org?.use_custom_loader ? org.loader_text : null) ?? org?.name ?? 'EVA',
            useCustomLoader: org?.use_custom_loader ?? false,
            loaderIconMode: (org?.loader_icon_mode as WorkspaceBrand['loaderIconMode']) ?? 'logo',
            loaderTextColor: org?.loader_text_color ?? null,
            splashBgColor: org?.splash_bg_color ?? primaryColor,
            accentLight: org?.accent_light ?? null,
            accentDark: org?.accent_dark ?? null,
            logoUrlDark: org?.logo_url_dark ?? null,
            neutralTint: org?.neutral_tint ?? false,
            source: org ? 'organization' : 'eva_default',
        }
    }

    // Team (pool): marca del TEAM, nunca la personal del coach. source='organization' para que el
    // alumno de pool y el coach en contexto team vean la marca del equipo.
    if (workspace.type === 'coach_team' || workspace.type === 'student_team') {
        const { data: team } = await db.from('teams').select('name, primary_color, logo_url').eq('id', workspace.teamId).maybeSingle()
        const teamPrimary = team?.primary_color ?? SYSTEM_PRIMARY_COLOR
        return {
            workspaceType: workspace.type,
            brandName: team?.name ?? 'EVA',
            primaryColor: teamPrimary,
            logoUrl: team?.logo_url ?? BRAND_APP_ICON,
            loaderText: team?.name ?? 'EVA',
            loaderIconMode: 'eva',
            splashBgColor: teamPrimary,
            source: 'organization',
        }
    }

    const coachId = workspace.coachId
    const coach = await findWorkspaceCoachBrand(db, coachId)
    const coachPrimary = coach?.primary_color ?? SYSTEM_PRIMARY_COLOR

    return {
        workspaceType: workspace.type,
        brandName: coach?.brand_name || coach?.full_name || 'EVA Coach',
        primaryColor: coachPrimary,
        logoUrl: coach?.logo_url ?? BRAND_APP_ICON,
        loaderText: coach?.loader_text ?? coach?.brand_name ?? coach?.full_name ?? 'EVA',
        splashBgColor: coachPrimary,
        source: coach ? 'coach' : 'eva_default',
    }
}
