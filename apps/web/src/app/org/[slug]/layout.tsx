import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
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

    return (
        <div className="flex min-h-dvh bg-zinc-950 text-zinc-100">
            <OrgEnterpriseNav
                slug={slug}
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
                {org.myRole === 'org_owner' && <MfaBanner orgSlug={slug} />}
                <main className="flex-1 overflow-auto">
                    {children}
                </main>
            </div>
        </div>
    )
}
