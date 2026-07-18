import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Package } from 'lucide-react'
import type { Metadata } from 'next'
import { getModulesContext } from './_data/modules.queries'
import { ModulesForm } from './_components/ModulesForm'

export const metadata: Metadata = { title: 'Módulos | EVA' }

export default async function CoachModulesPage() {
    const { coachId, orgManaged, ctx } = await getModulesContext()
    if (!coachId) redirect('/login')
    if (orgManaged) redirect('/coach/dashboard')
    if (!ctx) redirect('/coach/dashboard')

    return (
        <div className="mx-auto max-w-2xl animate-fade-in px-4 py-8 sm:px-6">
            <Link
                href={ctx.scope === 'team' ? '/coach/team' : '/coach/settings'}
                className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-strong"
            >
                <ArrowLeft className="h-4 w-4" /> {ctx.scope === 'team' ? 'Mi Equipo' : 'Opciones'}
            </Link>

            <div className="mb-6 flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control" style={{ background: 'var(--sport-100)', color: 'var(--sport-600)' }}>
                    <Package className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <h1 className="font-display text-2xl font-black tracking-tight text-strong">Módulos</h1>
                    <p className="mt-1 text-sm text-muted">
                        {ctx.scope === 'team'
                            ? `Equipo "${ctx.teamName}" — herramientas profesionales incluidas en tu cuenta.`
                            : 'Herramientas profesionales incluidas en los planes pagos.'}
                    </p>
                </div>
            </div>

            <ModulesForm
                modules={ctx.modules}
                killedByOperator={ctx.killedByOperator}
                scope={ctx.scope}
                hasPaidPlan={ctx.hasPaidPlan}
                nutritionVisible={ctx.nutritionVisible}
            />
        </div>
    )
}
