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
        <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
            <Link
                href={ctx.scope === 'team' ? '/coach/team' : '/coach/settings'}
                className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" /> {ctx.scope === 'team' ? 'Mi Equipo' : 'Opciones'}
            </Link>

            <div className="mb-6 flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                    <Package className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                    <h1 className="font-display text-2xl font-bold tracking-tight">Módulos</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {ctx.scope === 'team'
                            ? `Equipo "${ctx.teamName}" — el pool comparte estos módulos.`
                            : 'Activá las funciones avanzadas para tu cuenta.'}
                    </p>
                </div>
            </div>

            <ModulesForm initial={ctx.modules} canEdit={ctx.canEdit} scope={ctx.scope} />
        </div>
    )
}
