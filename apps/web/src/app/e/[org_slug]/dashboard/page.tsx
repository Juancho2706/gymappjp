import { redirect } from 'next/navigation'
import { Building2, Clock } from 'lucide-react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getEnterpriseLoginOrg } from '../login/_data/login.queries'

interface Props {
    params: Promise<{ org_slug: string }>
}

/**
 * P1.4: enterprise alumno holding screen. Assigned alumnos are routed straight into their
 * org-branded /c app by the login action; this page is the landing for POOL/ORPHAN alumnos
 * (no active coach yet) — it shows org branding + a "contact your org" message instead of
 * leaking into a coach's white-label. Page-level auth (middleware does not gate /e/*).
 */
export default async function EnterpriseDashboardPage({ params }: Props) {
    const { org_slug } = await params

    const org = await getEnterpriseLoginOrg(org_slug)
    if (!org) redirect(`/e/${org_slug}/login`)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect(`/e/${org_slug}/login`)

    const admin = createServiceRoleClient()

    // Verify the user is an active enterprise member of THIS org; resolve assigned coach.
    const { data: membership } = await admin
        .from('client_memberships')
        .select('coach_id, coaches(slug)')
        .eq('account_id', user.id)
        .eq('org_id', org.id)
        .eq('scope', 'enterprise')
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()

    let belongsToOrg = !!membership
    let coachSlug: string | null = (membership?.coaches as unknown as { slug: string | null } | null)?.slug ?? null

    if (!membership) {
        const { data: client } = await admin
            .from('clients')
            .select('org_id, coaches(slug)')
            .eq('id', user.id)
            .maybeSingle()
        if (client?.org_id === org.id) {
            belongsToOrg = true
            coachSlug = (client.coaches as unknown as { slug: string | null } | null)?.slug ?? null
        }
    }

    if (!belongsToOrg) redirect(`/e/${org_slug}/login`)

    // Assigned alumno → org-branded client app (reused until the /e screen tree lands).
    if (coachSlug) redirect(`/c/${coachSlug}/dashboard`)

    // Pool / orphan alumno: org-branded waiting state.
    return (
        <div className="relative min-h-dvh flex flex-col items-center justify-center p-4 pt-safe pb-safe bg-background overflow-hidden">
            <div
                className="fixed inset-0 pointer-events-none"
                aria-hidden="true"
                style={{ background: `radial-gradient(ellipse 90% 55% at 50% -10%, ${org.primary_color}22, transparent 65%)` }}
            />
            <div className="relative z-10 w-full max-w-sm text-center">
                <div className="flex justify-center mb-5">
                    {org.logo_url ? (
                        <div
                            className="relative flex items-center justify-center w-20 h-20 rounded-2xl overflow-hidden border shadow-lg"
                            style={{ borderColor: `${org.primary_color}30`, boxShadow: `0 8px 32px ${org.primary_color}20` }}
                        >
                            <Image src={org.logo_url} alt={org.name} fill className="object-contain p-2" />
                        </div>
                    ) : (
                        <div
                            className="flex items-center justify-center w-20 h-20 rounded-2xl border shadow-lg"
                            style={{ backgroundColor: `${org.primary_color}15`, borderColor: `${org.primary_color}30` }}
                        >
                            <Building2 className="w-9 h-9" style={{ color: org.primary_color }} />
                        </div>
                    )}
                </div>

                <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{org.name}</h1>

                <div className="mt-6 bg-card border border-border rounded-2xl p-6 shadow-xl">
                    <div className="flex justify-center mb-3">
                        <div
                            className="flex items-center justify-center w-12 h-12 rounded-full"
                            style={{ backgroundColor: `${org.primary_color}15` }}
                        >
                            <Clock className="w-6 h-6" style={{ color: org.primary_color }} />
                        </div>
                    </div>
                    <h2 className="text-lg font-semibold text-foreground">Estamos asignándote un coach</h2>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                        Habla con <span className="font-medium text-foreground">{org.name}</span> para que te asignen
                        un coach. Cuando esté listo, podrás entrenar desde aquí.
                    </p>
                </div>

                <p className="mt-5 text-center text-xs text-muted-foreground/60">
                    Impulsado por <span className="font-semibold text-muted-foreground">EVA</span>
                </p>
            </div>
        </div>
    )
}
