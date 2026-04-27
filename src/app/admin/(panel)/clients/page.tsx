import { Suspense } from 'react'
import { getAllClients } from '../dashboard/_data/admin.queries'
import { ClientTable } from './_components/ClientTable'
import { PageInfoButton } from '../_components/PageInfoButton'

const CLIENTS_INFO = [
    {
        heading: '¿Qué muestra esta sección?',
        body: 'Lista de todos los alumnos registrados en la plataforma EVA, de todos los coaches. Podés buscar por nombre o email, filtrar por coach, y ver o editar los datos de cada alumno.',
    },
    {
        heading: 'Columnas',
        body: 'Nombre — nombre completo del alumno.\nEmail — dirección de email con la que se registró.\nCoach — coach al que está asignado el alumno.\nEstado — activo (usa la app) o inactivo.\nOnboarding — si completó el proceso de configuración inicial.\nRegistrado — fecha de creación de la cuenta.',
    },
    {
        heading: 'Búsqueda y filtros',
        body: 'El campo de búsqueda filtra por nombre o email del alumno. El selector de coach muestra solo alumnos de ese coach específico. Los filtros se aplican en tiempo real en el servidor.',
    },
    {
        heading: 'Editar alumno',
        body: 'Click en un alumno para abrir el panel de edición. Podés modificar nombre, email y estado activo/inactivo. Los cambios quedan registrados en Auditoría.',
    },
    {
        heading: 'Fuente de datos',
        body: 'Tabla clients en Supabase con JOIN a coaches para mostrar el nombre del coach. Sin cache — siempre muestra datos actuales. Límite de 500 alumnos por consulta.',
    },
]

export default async function AdminClientsPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string; coachId?: string }>
}) {
    const params = await searchParams
    const clients = await getAllClients(params.q, params.coachId)

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[--admin-text-1]">Clientes</h1>
                    <p className="text-xs text-[--admin-text-3]">
                        {clients.length} alumno{clients.length !== 1 ? 's' : ''} registrado{clients.length !== 1 ? 's' : ''} en la plataforma.
                    </p>
                </div>
                <PageInfoButton title="Clientes — Guía completa" sections={CLIENTS_INFO} />
            </div>

            <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-[--admin-bg-surface]" />}>
                <ClientTable clients={clients} />
            </Suspense>
        </div>
    )
}
