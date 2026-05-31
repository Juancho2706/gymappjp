import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { listUserWorkspaces } from '@/services/auth/workspace.service'
import { getOrgBySlug } from './_data/org.queries'
import { MfaBanner } from './_components/MfaBanner'
import { OrgEnterpriseNav } from './_components/OrgEnterpriseNav'

interface Props {
    children: React.ReactNode
    params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    return {
        title: {
            default: org?.name ?? 'Organizacion',
            template: `%s | ${org?.name ?? 'EVA Org'}`,
        },
    }
}

export default async function OrgAdminLayout({ children, params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)

    if (!org) {
        redirect('/coach/dashboard')
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const workspaces = user ? await listUserWorkspaces(supabase, user.id) : []

    return (
        <div className="flex min-h-dvh flex-col bg-zinc-950 text-zinc-100 md:flex-row">
            <OrgEnterpriseNav
                slug={slug}
                workspaces={workspaces}
                org={{
                    name: org.name,
                    logo_url: org.logo_url,
                    primary_color: org.primary_color,
                    myRole: org.myRole,
                    plan: org.plan,
                    status: org.status,
                }}
            />

            <div className="flex min-w-0 flex-1 flex-col">
                {(org.myRole === 'org_owner' || org.myRole === 'org_admin') && <MfaBanner orgSlug={slug} />}
                <main className="flex-1 overflow-x-clip overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    )
}
