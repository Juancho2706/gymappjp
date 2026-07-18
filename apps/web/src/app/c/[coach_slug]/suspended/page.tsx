import { redirect } from 'next/navigation'
import { Pause, MessageCircle, CloudMoon, History, Dumbbell } from 'lucide-react'
import { getSuspendedCoachData } from '../_data/client-root.queries'
import { getClientBasePath } from '@/lib/client/base-path'
import { STUDENT_ACCESS_COPY } from '@/lib/student-access'

interface Props {
    params: Promise<{ coach_slug: string }>
    searchParams: Promise<{ reason?: string }>
}

export default async function SuspendedPage({ params, searchParams }: Props) {
    const { coach_slug } = await params
    const { reason } = await searchParams
    const base = await getClientBasePath(coach_slug)
    const { user, coach: coachData, isTeam } = await getSuspendedCoachData(coach_slug)
    if (!user) redirect(`${base}/login`)

    // Variante `?reason=coach` (politica CEO 2026-07-18): la cuenta del COACH quedo sin acceso
    // efectivo y ya paso la gracia — pantalla honesta y calmada, DISTINTA de la suspension manual
    // por-alumno de abajo. El alumno no tiene culpa: sin drama, sin WhatsApp de cobranza (la
    // presion vive en el dashboard del coach). Los CTAs apuntan a las superficies de LECTURA que
    // el proxy SI sirve en modo readonly (dashboard = plan/rachas; workout-history = historial) —
    // fix r2 'ux': antes el proxy redirigia TODO /c a esta pantalla y el CTA quedaba en loop.
    if (reason === 'coach') {
        return (
            <div className="min-h-dvh bg-surface-app flex flex-col items-center justify-center p-6 pt-safe text-center">
                <div className="w-20 h-20 bg-[var(--info-100)] text-[var(--info-600)] rounded-card flex items-center justify-center mb-6">
                    <CloudMoon className="w-10 h-10" />
                </div>
                <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em] text-text-strong mb-2">
                    {STUDENT_ACCESS_COPY.pausedTitle}
                </h1>
                <p className="text-text-muted max-w-sm leading-relaxed">
                    {STUDENT_ACCESS_COPY.pausedBody}
                </p>
                <p className="text-text-subtle text-sm mt-1.5 mb-8 max-w-sm leading-relaxed">
                    {STUDENT_ACCESS_COPY.pausedHint}
                </p>

                <div className="flex flex-col w-full max-w-xs gap-3">
                    <a
                        href={`${base}/dashboard`}
                        className="w-full py-3 rounded-control bg-primary text-primary-foreground font-bold tracking-[-0.01em] hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                        <Dumbbell className="w-4 h-4" />
                        Ver mi plan
                    </a>

                    <a
                        href={`${base}/workout-history`}
                        className="w-full py-3 rounded-control text-text-strong font-bold tracking-[-0.01em] hover:bg-surface-sunken transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                        <History className="w-4 h-4" />
                        Ver mi historial
                    </a>

                    <form action="/auth/signout" method="post" className="w-full">
                        <button type="submit" className="w-full py-3 rounded-control text-text-muted font-bold tracking-[-0.01em] hover:bg-surface-sunken hover:text-text-strong transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                            Cerrar sesión
                        </button>
                    </form>
                </div>
            </div>
        )
    }

    // Pool/team: la suspensión la gestiona el dueño del team — mostrar la marca del TEAM y no el
    // WhatsApp personal del coach (coachData.whatsapp ya viene null en contexto team).
    const brandName = coachData?.brand_name || (isTeam ? 'tu equipo' : 'tu Coach')

    return (
        <div className="min-h-dvh bg-surface-app flex flex-col items-center justify-center p-6 pt-safe text-center">
            <div className="w-20 h-20 bg-[var(--warning-100)] text-[var(--warning-700)] rounded-card flex items-center justify-center mb-6">
                <Pause className="w-10 h-10" />
            </div>
            <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em] text-text-strong mb-2">
                Acceso pausado
            </h1>
            <p className="text-text-muted max-w-sm leading-relaxed">
                {isTeam ? 'Tu equipo' : 'Tu coach'} pausó temporalmente tu acceso. Contacta a <strong className="text-text-strong">{brandName}</strong> para reactivar tu cuenta.
            </p>
            <p className="text-text-subtle text-sm mt-1.5 mb-8 max-w-sm leading-relaxed">
                Todos tus progresos y datos están a salvo.
            </p>

            <div className="flex flex-col w-full max-w-xs gap-3">
                {coachData?.whatsapp && (
                    <a
                        href={`https://wa.me/${coachData.whatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-3 rounded-control bg-primary text-primary-foreground font-bold tracking-[-0.01em] hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                        <MessageCircle className="w-4 h-4" />
                        {isTeam ? 'Contactar a mi equipo' : 'Contactar a mi Coach'}
                    </a>
                )}

                <form action="/auth/signout" method="post" className="w-full">
                    <button type="submit" className="w-full py-3 rounded-control text-text-muted font-bold tracking-[-0.01em] hover:bg-surface-sunken hover:text-text-strong transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                        Cerrar sesión
                    </button>
                </form>
            </div>
        </div>
    )
}
