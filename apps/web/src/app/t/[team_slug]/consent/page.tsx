import { redirect } from 'next/navigation'
import { Users } from 'lucide-react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import ConsentForm from './ConsentForm'
import { getTeamLoginInfo } from '../login/_data/login.queries'

interface Props {
    params: Promise<{ team_slug: string }>
}

/**
 * Pantalla de consentimiento del alumno de pool (Ley 21.719). El proxy /t obliga este paso
 * cuando has_pool_consent=false. Auth a nivel pagina (el proxy ya gatea pertenencia + consent).
 */
export default async function TeamConsentPage({ params }: Props) {
    const { team_slug } = await params

    const team = await getTeamLoginInfo(team_slug)
    if (!team) redirect(`/t/${team_slug}/login`)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect(`/t/${team_slug}/login`)

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
                    <h1 className="font-display text-xl font-bold tracking-tight text-foreground">Un último paso</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Tu autorización para entrenar con {team.name}</p>
                </div>

                <ConsentForm teamSlug={team_slug} primaryColor={team.primary_color} brandName={team.name} />

                <p className="mt-5 text-center text-xs text-muted-foreground/60">
                    Impulsado por <span className="font-semibold text-muted-foreground">EVA</span>
                </p>
            </div>
        </div>
    )
}
