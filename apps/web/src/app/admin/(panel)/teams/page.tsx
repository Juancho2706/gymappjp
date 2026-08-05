import { Suspense } from 'react'
import { getTeamsForAdmin } from './_data/teams.queries'
import { TeamsTable } from './_components/TeamsTable'
import { TeamsSearchBar } from './_components/TeamsSearchBar'

export const metadata = { title: 'Equipos | EVA CEO' }

interface Props {
    searchParams: Promise<{ q?: string }>
}

export default async function AdminTeamsPage({ searchParams }: Props) {
    const sp = await searchParams
    const search = sp.q?.trim() || undefined
    const teams = await getTeamsForAdmin({ search })

    return (
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
            <header className="mb-5">
                <h1 className="text-xl font-semibold text-strong">Equipos</h1>
                <p className="mt-0.5 text-sm text-muted">
                    Pools de coaches (modelo «team»). Crea el equipo + su owner; el owner suma al resto desde su panel.
                </p>
            </header>

            <div className="mb-4">
                <Suspense fallback={<div className="h-8" />}>
                    <TeamsSearchBar />
                </Suspense>
            </div>

            <TeamsTable teams={teams} search={search} />
        </div>
    )
}
