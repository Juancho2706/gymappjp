import { redirect } from 'next/navigation'
import { Users, ShieldCheck, ShieldOff } from 'lucide-react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getTeamLoginInfo } from '../login/_data/login.queries'
import { RevokeConsentButton } from '../consent/ConsentForm'

interface Props {
    params: Promise<{ team_slug: string }>
}

/**
 * Perfil del alumno de pool (Ley 21.719) — pantalla branded del team con el estado de su
 * consentimiento de acceso multidisciplinario y el boton para revocarlo cuando quiera.
 * Auth a nivel pagina; la pertenencia ya la gatea el proxy /t. Service-role read del consent
 * (la identidad sale de auth.uid(), nunca del body).
 */
export default async function TeamPerfilPage({ params }: Props) {
    const { team_slug } = await params

    const team = await getTeamLoginInfo(team_slug)
    if (!team) redirect(`/t/${team_slug}/login`)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect(`/t/${team_slug}/login`)

    // Estado del consentimiento de pool del alumno (activo = revoked_at IS NULL).
    const admin = createServiceRoleClient()
    const { data: activeConsent } = await admin
        .from('client_consents')
        .select('granted_at')
        .eq('client_id', user.id)
        .eq('team_id', team.id)
        .eq('purpose', 'pool_multidisciplinary_access')
        .is('revoked_at', null)
        .order('granted_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    const hasConsent = !!activeConsent
    const grantedDate = activeConsent?.granted_at
        ? new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Santiago' }).format(new Date(activeConsent.granted_at))
        : null

    return (
        <div className="relative min-h-dvh flex flex-col items-center justify-center p-4 pt-safe pb-safe bg-background overflow-hidden">
            <div
                className="fixed inset-0 pointer-events-none"
                aria-hidden="true"
                style={{ background: `radial-gradient(ellipse 90% 55% at 50% -10%, ${team.primary_color}22, transparent 65%)` }}
            />
            <div className="relative z-10 w-full max-w-sm">
                <div className="text-center mb-6">
                    <div className="flex justify-center mb-4">
                        {team.logo_url ? (
                            <div
                                className="relative flex items-center justify-center w-16 h-16 rounded-2xl overflow-hidden border shadow-lg"
                                style={{ borderColor: `${team.primary_color}30`, boxShadow: `0 8px 32px ${team.primary_color}20` }}
                            >
                                <Image src={team.logo_url} alt={team.name} fill className="object-contain p-2" />
                            </div>
                        ) : (
                            <div
                                className="flex items-center justify-center w-16 h-16 rounded-2xl border shadow-lg"
                                style={{ backgroundColor: `${team.primary_color}15`, borderColor: `${team.primary_color}30` }}
                            >
                                <Users className="w-8 h-8" style={{ color: team.primary_color }} />
                            </div>
                        )}
                    </div>
                    <h1 className="font-display text-xl font-bold tracking-tight text-foreground">Tu perfil</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Consentimiento en {team.name}</p>
                </div>

                <div className="bg-card border border-border rounded-2xl p-6 shadow-xl text-left">
                    <div className="flex items-start gap-3">
                        <div
                            className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
                            style={{ backgroundColor: hasConsent ? `${team.primary_color}15` : 'rgba(239,68,68,0.10)' }}
                        >
                            {hasConsent ? (
                                <ShieldCheck className="w-5 h-5" style={{ color: team.primary_color }} />
                            ) : (
                                <ShieldOff className="w-5 h-5 text-red-500" />
                            )}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">
                                {hasConsent ? 'Consentimiento activo' : 'Consentimiento revocado'}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                                {hasConsent
                                    ? 'Autorizaste el acceso multidisciplinario y el tratamiento de tus datos de salud (Ley 21.719).'
                                    : 'No autorizas el acceso multidisciplinario. Vuelve a otorgarlo para usar la plataforma del equipo.'}
                            </p>
                            {hasConsent && grantedDate ? (
                                <p className="mt-1 text-[11px] text-muted-foreground/70">Otorgado el {grantedDate}</p>
                            ) : null}
                        </div>
                    </div>

                    {hasConsent ? (
                        <div className="mt-6 border-t border-border pt-5">
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Puedes revocar tu consentimiento cuando quieras. Al hacerlo, el equipo dejará de tener
                                acceso a tus datos en la plataforma y deberás autorizar de nuevo para continuar usándola.
                            </p>
                            <div className="mt-4">
                                <RevokeConsentButton teamSlug={team_slug} />
                            </div>
                        </div>
                    ) : null}
                </div>

                <p className="mt-5 text-center text-xs text-muted-foreground/60">
                    Impulsado por <span className="font-semibold text-muted-foreground">EVA</span>
                </p>
            </div>
        </div>
    )
}
