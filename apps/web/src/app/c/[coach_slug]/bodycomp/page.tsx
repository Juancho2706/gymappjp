import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getClientBasePath } from '@/lib/client/base-path'
import { StudentBodyCompositionView } from '@/components/bodycomp/StudentBodyCompositionView'
import { getStudentBodyComposition } from './_data/bodycomp.queries'

export const metadata: Metadata = { title: 'Composición corporal | EVA' }

interface Props {
    params: Promise<{ coach_slug: string }>
}

/**
 * Vista del alumno (read-only, sus propias mediciones — RLS self-select de bcm_select).
 * Servida tambien via proxy `/t/[team_slug]/bodycomp` (x-client-base-path).
 * Gate por modulo con el contexto del PROPIO alumno: OFF => notFound() (espejo de movimiento).
 */
export default async function StudentBodyCompositionPage({ params }: Props) {
    const { coach_slug } = await params
    const base = await getClientBasePath(coach_slug)
    const { user, view } = await getStudentBodyComposition()

    if (!user) redirect(`${base}/login`)
    if (!view || !view.enabled) notFound()

    return <StudentBodyCompositionView basePath={base} bia={view.bia} isak={view.isak} />
}
