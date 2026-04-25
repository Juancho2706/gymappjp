import { Suspense } from 'react'
import { getAllClients } from '../dashboard/_data/admin.queries'
import { ClientTable } from './_components/ClientTable'

export default async function AdminClientsPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string; coachId?: string }>
}) {
    const params = await searchParams
    const clients = await getAllClients(params.q, params.coachId)

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Clientes</h1>
                <p className="text-sm text-neutral-400">
                    Gestión completa de alumnos en la plataforma.
                </p>
            </div>

            <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-neutral-900" />}>
                <ClientTable clients={clients} />
            </Suspense>
        </div>
    )
}
