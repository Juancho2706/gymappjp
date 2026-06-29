import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, SlidersHorizontal } from 'lucide-react'
import type { Metadata } from 'next'
import { getFuncionesContext } from './_data/funciones.queries'
import { FeaturePrefsPanel } from '@/components/coach/FeaturePrefsPanel'

export const metadata: Metadata = { title: 'Funciones | EVA' }

/**
 * Settings > Funciones (plan §9 Fase C) — el coach/owner elige QUE superficies de Nutricion
 * se muestran (capa ENABLED del modelo `visible = ENTITLED AND ENABLED`).
 *
 * Contexto derivado del workspace activo (separacion de flujos): standalone edita sus prefs;
 * en team solo el gestor llega (la query lo resuelve y la RLS es el gate real). Enterprise
 * redirige (no hay zona Funciones en v1).
 */
export default async function CoachFuncionesPage() {
    const { coachId, orgManaged, ctx } = await getFuncionesContext()
    if (!coachId) redirect('/login')
    if (orgManaged) redirect('/coach/dashboard')
    // Sin ctx => miembro de team sin gestion (o sin contexto valido): no hay editor que mostrar.
    if (!ctx) redirect(orgManaged ? '/coach/dashboard' : '/coach/team')

    const backHref = ctx.scope === 'team' ? '/coach/team' : '/coach/settings'
    const backLabel = ctx.scope === 'team' ? 'Mi Equipo' : 'Opciones'

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
                    <h1 className="font-display text-2xl font-black tracking-tight text-strong">Funciones</h1>
                    <p className="mt-1 text-sm text-muted">
                        {ctx.scope === 'team'
                            ? `Equipo "${ctx.teamName}" — elige qué se muestra de la nutrición.`
                            : 'Elige qué tan a fondo trabajas la nutrición y qué secciones ven tú y tus alumnos.'}
                    </p>
                </div>
            </div>

            {ctx.scope === 'team' ? (
                <FeaturePrefsPanel scope="team" teamId={ctx.teamId!} domains={ctx.domains} />
            ) : (
                <FeaturePrefsPanel scope="coach" domains={ctx.domains} />
            )}
        </div>
    )
}
