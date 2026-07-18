import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, LayoutList } from 'lucide-react'
import type { Metadata } from 'next'
import { getAreasContext } from './_data/areas.queries'
import { AreasManager } from './_components/AreasManager'

export const metadata: Metadata = { title: 'Áreas del builder | EVA' }

export default async function CoachAreasPage() {
    const { coachId, orgManaged, ctx } = await getAreasContext()
    if (!coachId) redirect('/login')
    if (orgManaged) redirect('/coach/dashboard')
    if (!ctx) redirect('/coach/dashboard')

    return (
        <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
            <Link
                href="/coach/workout-programs"
                className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-strong"
            >
                <ArrowLeft className="h-4 w-4" /> Programas
            </Link>

            <div className="mb-6 flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-[var(--sport-300)]/40 bg-[var(--sport-100)]">
                    <LayoutList className="h-5 w-5 text-[var(--sport-600)]" />
                </div>
                <div className="min-w-0">
                    <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em] text-strong">Áreas del builder</h1>
                    <p className="mt-1 text-sm text-muted">
                        {ctx.scope === 'team'
                            ? `Equipo "${ctx.teamName}" — todo el pool arma los días con estas áreas.`
                            : 'Organiza los días de entrenamiento con tus propias áreas (Movilidad, Core, HYROX…).'}
                    </p>
                </div>
            </div>

            <AreasManager initialAreas={ctx.areas} canEdit={ctx.canEdit} scope={ctx.scope} />
        </div>
    )
}
