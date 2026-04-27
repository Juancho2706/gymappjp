import { Suspense } from 'react'
import { getAllCoaches } from '../dashboard/_data/admin.queries'
import { CoachTable } from './_components/CoachTable'

export default async function AdminCoachesPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string }>
}) {
    const params = await searchParams
    const coaches = await getAllCoaches(params.q)

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Coaches</h1>
                <p className="text-sm text-neutral-400">
                    Gestión completa de coaches en la plataforma.
                </p>
            </div>

            <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-neutral-900" />}>
                <CoachTable coaches={coaches} total={coaches.length} />
            </Suspense>
        </div>
    )
}
