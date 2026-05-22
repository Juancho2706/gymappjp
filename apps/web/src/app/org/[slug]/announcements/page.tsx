import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOrgBySlug } from '../_data/org.queries'
import { CreateAnnouncementForm } from './_components/CreateAnnouncementForm'
import { AnnouncementRow } from './_components/AnnouncementRow'

interface Props {
    params: Promise<{ slug: string }>
}

async function getOrgAnnouncements(orgId: string) {
    const supabase = await createClient()
    const { data } = await supabase
        .from('org_announcements')
        .select('id, title, body, is_active, active_until, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(50)
    return data ?? []
}

export default async function AnnouncementsPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/coach/dashboard')

    const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('org_id', org.id)
        .eq('user_id', user.id)
        .in('role', ['org_owner', 'org_admin'])
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!membership) redirect(`/org/${slug}`)

    const announcements = await getOrgAnnouncements(org.id)

    return (
        <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-6">
            <div>
                <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Novedades</h1>
                <p className="mt-1 text-sm text-zinc-500">Mensajes visibles en el dashboard de todos los alumnos de la org.</p>
            </div>

            <CreateAnnouncementForm orgSlug={slug} />

            {announcements.length === 0 ? (
                <p className="text-sm text-zinc-400 text-center py-8">Sin novedades publicadas</p>
            ) : (
                <div className="flex flex-col gap-3">
                    {announcements.map((a) => (
                        <AnnouncementRow key={a.id} orgSlug={slug} announcement={{ ...a, created_at: a.created_at ?? '' }} />
                    ))}
                </div>
            )}
        </div>
    )
}
