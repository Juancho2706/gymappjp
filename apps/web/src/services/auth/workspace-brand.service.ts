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
        return {
            workspaceType: workspace.type,
            brandName: org?.name ?? 'EVA Enterprise',
            primaryColor: org?.primary_color ?? BRAND_PRIMARY_COLOR,
            logoUrl: org?.logo_url ?? BRAND_APP_ICON,
            loaderText: org?.name ?? 'EVA',
            source: org ? 'organization' : 'eva_default',
        }
    }

    const coachId = workspace.type === 'coach_standalone' ? workspace.coachId : workspace.coachId
    const coach = await findWorkspaceCoachBrand(db, coachId)

    return {
        workspaceType: workspace.type,
        brandName: coach?.brand_name || coach?.full_name || 'EVA Coach',
        primaryColor: coach?.primary_color ?? SYSTEM_PRIMARY_COLOR,
        logoUrl: coach?.logo_url ?? BRAND_APP_ICON,
        loaderText: coach?.loader_text ?? coach?.brand_name ?? coach?.full_name ?? 'EVA',
        source: coach ? 'coach' : 'eva_default',
    }
}
