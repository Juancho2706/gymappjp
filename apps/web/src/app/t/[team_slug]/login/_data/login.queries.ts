import { cache } from 'react'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { SYSTEM_PRIMARY_COLOR } from '@/lib/brand-assets'

export interface TeamLoginInfo {
    id: string
    slug: string
    name: string
    primary_color: string
    logo_url: string | null
}

/**
 * Branding publico del login del alumno de pool en `/t/[team_slug]/login`.
 * Team-scoped (un link de entrada por pool, ej. Movida), independiente del coach asignado.
 * Service-role read para renderizar branding antes de autenticar (teams no tiene SELECT anon).
 */
export const getTeamLoginInfo = cache(async (slug: string): Promise<TeamLoginInfo | null> => {
    const admin = createServiceRoleClient()
    const { data } = await admin
        .from('teams')
        .select('id, slug, name, primary_color, logo_url')
        .eq('slug', slug)
        .is('deleted_at', null)
        .maybeSingle()

    if (!data) return null

    const row = data as Record<string, unknown>
    return {
        id: String(row.id),
        slug: String(row.slug),
        name: String(row.name ?? 'Tu equipo'),
        primary_color: (typeof row.primary_color === 'string' && row.primary_color.trim()) || SYSTEM_PRIMARY_COLOR,
        logo_url: typeof row.logo_url === 'string' && row.logo_url.trim() ? row.logo_url : null,
    }
})
