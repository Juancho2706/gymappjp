import { supabase } from './supabase'

/** Espejo de web getActiveOrgAnnouncements (dashboard.queries.ts). */
export type OrgAnnouncement = {
  id: string
  title: string
  body: string
  active_until: string | null
  created_at: string
}

/** Anuncios activos de la org visibles para el alumno (audience all|clients). */
export async function getActiveOrgAnnouncements(orgId: string): Promise<OrgAnnouncement[]> {
  const now = new Date().toISOString()
  const { data } = await supabase
    .from('org_announcements')
    .select('id, title, body, active_until, created_at, audience')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .in('audience', ['all', 'clients'])
    .or('active_until.is.null,active_until.gt.' + now)
    // Solo si published_at es null (legacy) o ya llegó.
    .or('published_at.is.null,published_at.lte.' + now)
    .order('created_at', { ascending: false })
    .limit(5)
  return (data ?? []) as OrgAnnouncement[]
}
