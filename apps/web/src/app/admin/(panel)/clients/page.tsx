import { Suspense } from 'react'
import {
    getAllClients,
    getAllCoachesBasic,
    type AdminClientsEstado,
    type AdminClientsOnboarding,
} from '../dashboard/_data/admin.queries'
import { ClientTable } from './_components/ClientTable'
import { PageInfoButton } from '../_components/PageInfoButton'

const ESTADO_VALUES: AdminClientsEstado[] = ['activo', 'inactivo', 'archivado']
const ONBOARDING_VALUES: AdminClientsOnboarding[] = ['completo', 'pendiente']

const CLIENTS_INFO = [
    {
        heading: '¿Qué muestra esta sección?',
        body: 'Lista de todos los alumnos registrados en la plataforma EVA, de todos los coaches. Puedes buscar por nombre o email, filtrar por coach, y ver o editar los datos de cada alumno.',
    },
    {
        heading: 'Columnas',
        body: 'Nombre — nombre completo del alumno.\nEmail — dirección de email con la que se registró.\nCoach — coach al que está asignado el alumno.\nEstado — activo (usa la app), inactivo, o archivado (acceso suspendido por el coach, datos preservados).\nOnboarding — si completó el proceso de configuración inicial.\nRegistrado — fecha de creación de la cuenta.',
    },
    {
        heading: 'Búsqueda y filtros',
        body: 'El campo de búsqueda filtra por nombre o email del alumno. El selector de coach muestra solo alumnos de ese coach específico. Los selectores de Estado y Onboarding filtran sobre TODOS los alumnos (no solo la página visible) y quedan guardados en la URL, así que puedes compartir el link con el filtro aplicado.',
    },
    {
        heading: 'Crear alumno',
        body: 'Click en "Nuevo Alumno" para crear un alumno directamente desde el panel CEO. Selecciona el coach al que pertenece, completa los datos y se generará la cuenta al instante. Las credenciales temporales se muestran una sola vez al crear.',
    },
    {
        heading: 'Editar alumno',
        body: 'Click en el ícono de lápiz para abrir el panel de edición. Puedes modificar nombre, email y estado activo/inactivo. Los cambios quedan registrados en Auditoría.',
    },
    {
        heading: 'Fuente de datos',
        body: 'Tabla clients en Supabase con JOIN a coaches para mostrar el nombre del coach. Sin cache — siempre muestra datos actuales. Paginación de 50 alumnos por página.',
    },
]

export default async function AdminClientsPage({
    searchParams,
}: {
    searchParams: Promise<{
        q?: string
        coachId?: string
        page?: string
        estado?: string
        onboarding?: string
    }>
}) {
    const params = await searchParams
    const page = Math.max(1, parseInt(params.page ?? '1', 10))
    // Whitelist: un ?estado= inventado no debe llegar a PostgREST ni romper la vista.
    const estado = ESTADO_VALUES.find(v => v === params.estado)
    const onboarding = ONBOARDING_VALUES.find(v => v === params.onboarding)

    const [{ clients, total }, coaches] = await Promise.all([
        getAllClients(params.q, params.coachId, page, 50, estado, onboarding),
        getAllCoachesBasic(),
    ])

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-strong">Clientes</h1>
                    <p className="text-xs text-muted">
                        {total} alumno{total !== 1 ? 's' : ''} registrado{total !== 1 ? 's' : ''} en la plataforma.
                    </p>
                </div>
                <PageInfoButton title="Clientes — Guía completa" sections={CLIENTS_INFO} />
            </div>

            <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface-card" />}>
                <ClientTable clients={clients} total={total} coaches={coaches} />
            </Suspense>
        </div>
    )
}
