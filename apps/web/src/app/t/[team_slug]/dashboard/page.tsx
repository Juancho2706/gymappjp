import { redirect } from 'next/navigation'
import { Users, Clock } from 'lucide-react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getTeamLoginInfo } from '../login/_data/login.queries'

interface Props {
    params: Promise<{ team_slug: string }>
}

/**
 * Holding del alumno de pool. Los alumnos con coach activo los reescribe el proxy /t directo a su
 * app /c con branding del team; esta pantalla es para alumnos del pool SIN coach activo (orfandad):
 * muestra la marca del team + "te estamos asignando un coach". Auth a nivel pagina (el proxy ya gatea /t).
 */
export default async function TeamDashboardPage({ params }: Props) {
    const { team_slug } = await params

    const team = await getTeamLoginInfo(team_slug)
    if (!team) redirect(`/t/${team_slug}/login`)

    const supabase = await createClient()
    // getClaims(): verificación local del JWT (ES256), sin /user. El proxy ya validó la sesión.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
    if (!user) redirect(`/t/${team_slug}/login`)

    const admin = createServiceRoleClient()

    // Verifica pertenencia al team (membership scope='team' o clients.team_id) + resuelve coach.
    const { data: membership } = await admin
        .from('client_memberships')
        .select('coach_id, coaches(slug)')
        .eq('account_id', user.id)
        .eq('team_id', team.id)
        .eq('scope', 'team')
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()

    let belongsToTeam = !!membership
    let coachSlug: string | null = (membership?.coaches as unknown as { slug: string | null } | null)?.slug ?? null

    if (!membership) {
        const { data: client } = await admin
            .from('clients')
            .select('team_id, coaches(slug)')
            .eq('id', user.id)
            .maybeSingle()
        if (client?.team_id === team.id) {
            belongsToTeam = true
            coachSlug = (client.coaches as unknown as { slug: string | null } | null)?.slug ?? null
        }
    }

    if (!belongsToTeam) redirect(`/t/${team_slug}/login`)

    // Con coach → app del alumno con branding del team (reusa /c hasta extraer el árbol /t).
    if (coachSlug) redirect(`/c/${coachSlug}/dashboard`)

    // Pool / orfandad: espera con marca del team.
    return (
        <div className="relative min-h-dvh flex flex-col items-center justify-center p-4 pt-safe pb-safe bg-background overflow-hidden">
            <div
                className="fixed inset-0 pointer-events-none"
                aria-hidden="true"
                style={{ background: `radial-gradient(ellipse 90% 55% at 50% -10%, ${team.primary_color}22, transparent 65%)` }}
            />
            <div className="relative z-10 w-full max-w-sm text-center">
                <div className="flex justify-center mb-5">
                    {team.logo_url ? (
                        <div
                            className="relative flex items-center justify-center w-20 h-20 rounded-2xl overflow-hidden border shadow-lg"
                            style={{ borderColor: `${team.primary_color}30`, boxShadow: `0 8px 32px ${team.primary_color}20` }}
                        >
                            <Image src={team.logo_url} alt={team.name} fill className="object-contain p-2" />
                        </div>
                    ) : (
                        <div
                            className="flex items-center justify-center w-20 h-20 rounded-2xl border shadow-lg"
                            style={{ backgroundColor: `${team.primary_color}15`, borderColor: `${team.primary_color}30` }}
                        >
                            <Users className="w-9 h-9" style={{ color: team.primary_color }} />
                        </div>
                    )}
                </div>

                <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{team.name}</h1>

                <div className="mt-6 bg-card border border-border rounded-2xl p-6 shadow-xl">
                    <div className="flex justify-center mb-3">
                        <div
                            className="flex items-center justify-center w-12 h-12 rounded-full"
                            style={{ backgroundColor: `${team.primary_color}15` }}
                        >
                            <Clock className="w-6 h-6" style={{ color: team.primary_color }} />
                        </div>
                    </div>
                    <h2 className="text-lg font-semibold text-foreground">Estamos asignándote un coach</h2>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                        Habla con <span className="font-medium text-foreground">{team.name}</span> para que te asignen
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
