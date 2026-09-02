import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getPersonaScreenContext } from './_data/persona.queries'
import { PersonaPicker } from './_components/PersonaPicker'
import { VerifyEmailBanner } from '../../dashboard/_components/banners/VerifyEmailBanner'

export const metadata: Metadata = { title: 'Primer ingreso' }

/**
 * `/coach/onboarding/persona` — la pantalla «¿A qué te dedicas?» del primer ingreso
 * (SPEC coach-onboarding-v2 §1, TASKS F2.1).
 *
 * PANTALLA COMPLETA, sin el chrome del panel. Next no permite escapar de un layout padre desde
 * una ruta hija (`app/coach/layout.tsx` envuelve todo `/coach/*`, y `onboarding/complete` tampoco
 * escapa: renderiza su tarjeta DENTRO del shell). Así que el escape es visual y explícito: un
 * contenedor `fixed inset-0` con el fondo de la app que tapa sidebar, topbar y cápsula móvil.
 * Es coherente con el gate: mientras el coach no conteste, no hay nada que navegar.
 *
 * El gate que trae al coach hasta acá vive en `proxy.ts` (es el único punto del stack que conoce
 * la ruta antes de renderizar). Estos redirects son el cinturón del lado del render: quien ya
 * contestó, o quien tiene el panel administrado por su org/team, no vuelve a ver la pregunta.
 */
export default async function CoachPersonaPage() {
    const ctx = await getPersonaScreenContext()

    if (!ctx.coachId) redirect('/login')
    // Sesión sin fila en `coaches`: es el alta por OAuth a medio terminar, no un coach sin persona.
    if (!ctx.hasCoachRow) redirect('/coach/onboarding/complete')
    if (ctx.managed) redirect('/coach/dashboard')
    // Ya contestó: la persona se cambia desde Opciones › Mi panel, no volviendo a esta URL.
    if (ctx.persona) redirect('/coach/dashboard')

    return (
        // `role="dialog" aria-modal`: para un lector de pantalla el resto del panel (que sigue
        // montado detrás del overlay) queda fuera. El foco entra en la primera tarjeta al montar.
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="persona-title"
            className="fixed inset-0 z-[150] overflow-y-auto bg-[var(--surface-app)]"
        >
            <div className="flex min-h-full w-full items-center justify-center px-5 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] sm:px-8">
                <div className="mx-auto w-full max-w-3xl">
                    {/* B9 — el aviso de correo sin verificar TAMBIÉN acá. El gate manda al coach
                        nuevo a esta pantalla ANTES del panel, y esta pantalla es un takeover sin
                        salida: si el banner viviera solo en el dashboard, quien tipeó mal su
                        dominio no se enteraría nunca (y sin correo no hay reset de clave). Mismo
                        componente que el panel: no bloquea nada y no tiene CTA de pago (regla de
                        tiendas iOS). */}
                    {!ctx.emailVerified && (
                        <div className="mb-5">
                            <VerifyEmailBanner />
                        </div>
                    )}
                    <PersonaPicker />
                </div>
            </div>
        </div>
    )
}
