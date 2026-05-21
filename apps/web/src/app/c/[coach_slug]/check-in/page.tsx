import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { CheckInForm } from './CheckInForm'
import { getCheckInPageData } from './_data/check-in.queries'

export const metadata: Metadata = { title: 'Check-in Mensual | EVA' }

interface Props {
    params: Promise<{ coach_slug: string }>
}

export default async function ClientCheckInPage({ params }: Props) {
    const { coach_slug } = await params
    const { user, coachPrimaryColor, lastCheckIn } = await getCheckInPageData(coach_slug)
    if (!user) redirect(`/c/${coach_slug}/login`)
    if (!coachPrimaryColor) redirect(`/c/${coach_slug}/dashboard`)

    return (
        <div className="min-h-dvh pb-20 bg-background">
            <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-border/10 px-4 py-4 pt-safe">
                <Link
                    href={`/c/${coach_slug}/dashboard`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium mb-4 transition-colors hover:opacity-80"
                    style={{ color: coachPrimaryColor }}
                >
                    <ArrowLeft className="w-4 h-4" />
                    Volver
                </Link>
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            Check-in Mensual
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Registra tu progreso para que tu coach pueda ajustar tu plan.
                        </p>
                    </div>
                    <InfoTooltip content="Registro mensual de tu progreso: peso corporal, fotos front y back, y notas opcionales. Tu coach lo verá en tu perfil para hacer seguimiento de tu evolución." />
                </div>
                <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                    EVA no es un dispositivo medico ni sustituye el consejo de profesionales de la salud.
                </p>
            </header>

            <main className="px-4 py-6 max-w-lg mx-auto">
                <CheckInForm
                    coachSlug={coach_slug}
                    coachPrimaryColor={coachPrimaryColor}
                    lastCheckIn={lastCheckIn}
                />
            </main>
        </div>
    )
}
