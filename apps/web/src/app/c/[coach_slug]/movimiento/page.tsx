import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getClientBasePath } from '@/lib/client/base-path'
import { StudentMovementView } from '@/components/movement/StudentMovementView'
import { getStudentMovement } from './_data/movimiento.queries'

export const metadata: Metadata = { title: 'Screening de Movimiento | EVA' }

interface Props {
    params: Promise<{ coach_slug: string }>
}

/**
 * Vista del alumno (read-only, solo evaluaciones FINALES — RLS self-select).
 * Servida tambien via proxy `/t/[team_slug]/movimiento` (x-client-base-path).
 * Gate por modulo con el contexto del PROPIO alumno: OFF => notFound() (AC6).
 */
export default async function StudentMovementPage({ params }: Props) {
    const { coach_slug } = await params
    const base = await getClientBasePath(coach_slug)
    const { user, view } = await getStudentMovement()

    if (!user) redirect(`${base}/login`)
    if (!view || !view.enabled) notFound()

    return <StudentMovementView basePath={base} finals={view.finals} />
}
