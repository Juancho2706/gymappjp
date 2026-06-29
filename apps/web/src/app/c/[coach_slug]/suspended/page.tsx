import { redirect } from 'next/navigation'
import { AlertCircle, LogOut } from 'lucide-react'
import { getSuspendedCoachData } from '../_data/client-root.queries'
import { getClientBasePath } from '@/lib/client/base-path'

interface Props {
    params: Promise<{ coach_slug: string }>
}

export default async function SuspendedPage({ params }: Props) {
    const { coach_slug } = await params
    const base = await getClientBasePath(coach_slug)
    const { user, coach: coachData, isTeam } = await getSuspendedCoachData(coach_slug)
    if (!user) redirect(`${base}/login`)

    // Pool/team: la suspensión la gestiona el dueño del team — mostrar la marca del TEAM y no el
    // WhatsApp personal del coach (coachData.whatsapp ya viene null en contexto team).
    const brandName = coachData?.brand_name || (isTeam ? 'tu equipo' : 'tu Coach')

    return (
        <div className="min-h-dvh bg-surface-app flex flex-col items-center justify-center p-6 pt-safe text-center">
            <div className="w-20 h-20 bg-[var(--danger-100)] text-[var(--danger-600)] rounded-full flex items-center justify-center mb-6">
                <AlertCircle className="w-10 h-10" />
            </div>
            <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em] text-text-strong mb-3">
                Acceso Pausado
            </h1>
            <p className="text-text-muted mb-8 max-w-sm leading-relaxed">
                Tu acceso a la plataforma está temporalmente suspendido. Por favor, contacta a <strong className="text-text-strong">{brandName}</strong> para reactivar tu cuenta. Todos tus progresos y datos están a salvo.
            </p>

            <div className="flex flex-col w-full max-w-xs gap-3">
                {coachData?.whatsapp && (
                    <a
                        href={`https://wa.me/${coachData.whatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-3 rounded-control bg-primary text-primary-foreground font-bold tracking-[-0.01em] hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-[0.98] flex items-center justify-center"
                    >
                        {isTeam ? 'Contactar a mi equipo' : 'Contactar a mi Coach'}
                    </a>
                )}

                <form action="/auth/signout" method="post" className="w-full">
                    <button type="submit" className="w-full py-3 rounded-control bg-surface-sunken text-text-strong font-bold tracking-[-0.01em] hover:opacity-90 transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                        <LogOut className="w-4 h-4" /> Cerrar Sesión
                    </button>
                </form>
            </div>
        </div>
    )
}
