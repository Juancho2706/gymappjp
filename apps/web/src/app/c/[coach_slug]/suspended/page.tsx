import { redirect } from 'next/navigation'
import { Pause, MessageCircle } from 'lucide-react'
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

    // Variante `?reason=coach` — BLOQUEO TOTAL post-gracia (decision CEO #9, ejecutor V3). La cuenta
    // del COACH quedo sin acceso efectivo y ya paso la gracia: el proxy redirige TODO el arbol /c
    // aca, asi que esta es la unica superficie visible del alumno. Diseno v3.3 "habla con tu coach":
    // avatar del coach con anillo de marca + pausa calma + un solo camino (escribir al coach) +
    // cerrar sesion discreto. SIN CTAs de lectura (ya no hay dashboard/historial que ofrecer). Tono
    // cuidado: esta en pausa, no bloqueada; nunca culpa al alumno. Nivel dashboard → claro/oscuro.
    if (reason === 'coach') {
        const coachInitial = ((coachData?.brand_name ?? '').trim().charAt(0) || '·').toUpperCase()
        // Contacto del coach para "Escribir a mi coach" (mockup v3.3). Ladder: telefono (WhatsApp) →
        // email (mailto) → sin CTA (solo el texto). Hoy el branding solo expone `whatsapp`; el email
        // queda reservado para cuando exista una columna de contacto por email (el mailto se activa
        // solo con dato real, jamas con un placeholder).
        const coachPhone = coachData?.whatsapp?.replace(/\D/g, '') || ''
        const coachEmail: string | null = null
        const contactHref = coachPhone
            ? `https://wa.me/${coachPhone}`
            : coachEmail
              ? `mailto:${coachEmail}`
              : null

        return (
            <div className="min-h-dvh bg-surface-app flex flex-col items-center justify-center p-6 pt-safe text-center relative overflow-hidden">
                {/* Halo suave de marca (decorativo) — respeta ambos temas via color-mix sobre --primary. */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-1/2"
                    style={{ background: 'radial-gradient(60% 60% at 50% 0%, color-mix(in srgb, var(--primary) 12%, transparent), transparent 70%)' }}
                />

                {/* Avatar del coach (inicial) con anillo de marca. */}
                <div className="relative w-24 h-24 mb-5">
                    <div
                        className="absolute inset-0 rounded-full opacity-90"
                        style={{ background: 'conic-gradient(from 0deg, var(--primary), color-mix(in srgb, var(--primary) 22%, transparent) 130deg, var(--primary) 300deg, var(--primary) 360deg)' }}
                    />
                    <div className="absolute inset-[3px] rounded-full bg-surface-app" />
                    <div
                        className="absolute inset-[6px] rounded-full text-primary-foreground flex items-center justify-center font-display text-3xl font-black tracking-[-0.03em]"
                        style={{ background: 'linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 55%, #000))' }}
                    >
                        {coachInitial}
                    </div>
                </div>

                {/* Icono de pausa calmo. */}
                <div className="w-14 h-14 rounded-full bg-surface-sunken text-text-muted flex items-center justify-center mb-6 border border-subtle">
                    <Pause className="w-6 h-6" />
                </div>

                <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em] text-text-strong mb-2">
                    {STUDENT_ACCESS_COPY.pausedTitle}
                </h1>
                <p className="text-text-muted max-w-xs leading-relaxed mb-8">
                    {STUDENT_ACCESS_COPY.pausedBody}
                </p>

                <div className="flex flex-col items-center w-full max-w-xs gap-5">
                    {contactHref && (
                        <a
                            href={contactHref}
                            {...(coachPhone ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                            className="w-full py-3.5 rounded-control bg-primary text-primary-foreground font-bold tracking-[-0.01em] hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                            <MessageCircle className="w-5 h-5" />
                            Escribir a mi coach
                        </a>
                    )}

                    <form action="/auth/signout" method="post">
                        <button
                            type="submit"
                            className="text-text-subtle text-sm font-semibold tracking-wide hover:text-text-muted transition-colors border-b border-subtle pb-0.5"
                        >
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

    // Variante `?reason=archived`: el coach archivó al alumno (no lo pausó manualmente). Copy
    // distinto para que quede claro que el historial se conserva; resto de la pantalla igual.
    const bodyCopy =
        reason === 'archived'
            ? 'Tu coach archivó tu espacio por ahora. Tus datos y todo tu historial siguen guardados — si tu coach reactiva tu cupo, vuelves a entrar como siempre.'
            : (
                <>
                    {isTeam ? 'Tu equipo' : 'Tu coach'} pausó temporalmente tu acceso. Contacta a <strong className="text-text-strong">{brandName}</strong> para reactivar tu cuenta.
                </>
            )

    return (
        <div className="min-h-dvh bg-surface-app flex flex-col items-center justify-center p-6 pt-safe text-center">
            <div className="w-20 h-20 bg-[var(--warning-100)] text-[var(--warning-700)] rounded-card flex items-center justify-center mb-6">
                <Pause className="w-10 h-10" />
            </div>
            <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em] text-text-strong mb-2">
                Acceso pausado
            </h1>
            <p className="text-text-muted max-w-sm leading-relaxed">
                {bodyCopy}
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
