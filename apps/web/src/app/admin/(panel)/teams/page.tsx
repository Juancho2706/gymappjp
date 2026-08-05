import { getTeamsForAdmin } from './_data/teams.queries'
import { TeamsTable } from './_components/TeamsTable'

export const metadata = { title: 'Equipos | EVA CEO' }

export default async function AdminTeamsPage() {
    const teams = await getTeamsForAdmin()

    return (
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
            <header className="mb-5">
                <h1 className="text-xl font-semibold text-strong">Equipos</h1>
                <p className="mt-0.5 text-sm text-muted">
                    Pools de coaches (modelo «team»). Crea el equipo + su owner; el owner suma al resto desde su panel.
                </p>
            </header>
            <TeamsTable teams={teams} />
        </div>
    )
}
