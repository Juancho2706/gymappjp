import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, SlidersHorizontal } from 'lucide-react'
import type { Metadata } from 'next'
import { getFuncionesContext } from './_data/funciones.queries'
import { MiPanelPane } from './_components/MiPanelPane'
import { TeamFuncionesPane } from './_components/TeamFuncionesPane'

export const metadata: Metadata = { title: 'Funciones' }

/**
 * Settings › «Funciones» — la pantalla ÚNICA de la Ola de orden (W3.1, decisiones 5A y 6A). Acá
 * el coach elige su especialidad, qué áreas se ven en su panel (con la puerta de entrada a cada
 * una), el detalle fino de nutrición y qué hace con su alumno de ejemplo.
 *
 * Absorbe tres pantallas que antes vivían aparte: el catálogo `/coach/settings/modules`, el
 * launcher `/coach/tools` y el viejo «Mi panel» (las dos primeras son redirects desde W3.2).
 * Se llamaba «Mi panel» hasta W3.1; la RUTA no cambia a propósito: hay links vivos (hub móvil,
 * rail de desktop, correos) y renombrarla no le aporta nada al coach.
 *
 * Contexto derivado del workspace activo (separacion de flujos): standalone edita sus prefs y su
 * persona; en team solo el gestor llega y ve el editor de secciones del pool (la persona es
 * PERSONAL, no del equipo: ahí no se muestra). Enterprise redirige (no hay zona en v1).
 */
export default async function CoachFuncionesPage() {
    const { coachId, orgManaged, ctx } = await getFuncionesContext()
    if (!coachId) redirect('/login')
    if (orgManaged) redirect('/coach/dashboard')
    // Sin ctx => miembro de team sin gestion (o sin contexto valido): no hay editor que mostrar.
    if (!ctx) redirect(orgManaged ? '/coach/dashboard' : '/coach/team')

    const isTeam = ctx.scope === 'team'
    const backHref = isTeam ? '/coach/team' : '/coach/settings'
    const backLabel = isTeam ? 'Mi Equipo' : 'Opciones'

    return (
        <div className="mx-auto max-w-2xl animate-fade-in px-4 py-8 sm:px-6">
            <Link
                href={backHref}
                className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-strong"
            >
                <ArrowLeft className="h-4 w-4" /> {backLabel}
            </Link>

            <div className="mb-6 flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control" style={{ background: 'var(--sport-100)', color: 'var(--sport-600)' }}>
                    <SlidersHorizontal className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <h1 className="font-display text-2xl font-black tracking-tight text-strong">
                        {isTeam ? 'Funciones del equipo' : 'Funciones'}
                    </h1>
                    <p className="mt-1 text-sm text-muted">
                        {isTeam
                            ? `Equipo "${ctx.teamName}" — qué ve el equipo y sus alumnos.`
                            : 'Tu especialidad, qué ves en tu panel y tu alumno de ejemplo.'}
                    </p>
                </div>
            </div>

            {isTeam ? (
                // El equipo no tiene persona ni alumno de ejemplo: áreas + editor de secciones.
                // `navOrder` viaja igual: el orden de la barra es del coach, no del pool.
                <TeamFuncionesPane
                    teamId={ctx.teamId!}
                    domains={ctx.domains}
                    navOrder={ctx.navOrder}
                    canManage={ctx.canManage}
                />
            ) : (
                <MiPanelPane domains={ctx.domains} navOrder={ctx.navOrder} />
            )}
        </div>
    )
}
