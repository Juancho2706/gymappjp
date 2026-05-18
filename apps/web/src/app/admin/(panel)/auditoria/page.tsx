import { Suspense } from 'react'
import { getAuditLogs } from './_data/auditoria.queries'
import { AuditFilters } from './_components/AuditFilters'
import { AuditTable } from './_components/AuditTable'
import { AuditExportButton } from './_components/AuditExportButton'
import { AdminPagination } from '../_components/AdminPagination'
import { PageInfoButton } from '../_components/PageInfoButton'

export const metadata = { title: 'Auditoría' }

const AUDIT_INFO = [
    {
        heading: '¿Qué es esta sección?',
        body: 'Registro inmutable de todas las acciones administrativas realizadas en el panel CEO. Cada vez que modificás un coach, suspendés un trial, o cambiás un tier, queda un log aquí con el admin que lo hizo, la fecha, y los datos que cambiaron.',
    },
    {
        heading: 'Columnas',
        body: 'Timestamp — fecha y hora exacta de la acción.\nAdmin — email del administrador que ejecutó la acción.\nAcción — tipo de operación (ver filtro para lista completa).\nTabla — tabla de base de datos afectada (coaches, clients).\nTarget — UUID del registro modificado.\nPayload — datos antes/después del cambio, expandibles al hacer click.',
    },
    {
        heading: 'Tipos de acciones',
        body: 'coach.update — edición de datos del coach (nombre, tier, etc.)\ncoach.suspend — coach suspendido manualmente\ncoach.force_expire — trial forzado a expirado\ncoach.reactivate — reactivación manual por admin\ncoach.period_extend — extensión del período activo\ncoach.period_end_update — cambio de fecha de vencimiento\ncoach.bulk_status — cambio masivo de estado\ncoach.bulk_tier — cambio masivo de tier\ncoach.delete — eliminación permanente\nclient.update — edición de alumno\nclient.delete — eliminación de alumno',
    },
    {
        heading: 'Filtros',
        body: 'Podés filtrar por tipo de acción, rango de fechas (Desde / Hasta) y UUID del target para ver el historial de un coach específico. El botón "Exportar CSV" descarga hasta 5.000 filas con los filtros activos.',
    },
    {
        heading: 'Fuente de datos',
        body: 'Tabla admin_audit_logs en Supabase. Cada server action del panel escribe un registro via logAdminAction() antes de confirmar el cambio. Sin cache — siempre muestra datos en tiempo real.',
    },
]

const LIMIT = 50

interface Props {
    searchParams: Promise<{
        action?: string
        from?: string
        to?: string
        target?: string
        page?: string
    }>
}

export default async function AdminAuditoriaPage({ searchParams }: Props) {
    const sp = await searchParams
    const page = Math.max(1, parseInt(sp.page ?? '1', 10))

    const { rows, totalCount } = await getAuditLogs({
        action: sp.action,
        from: sp.from,
        to: sp.to,
        target: sp.target,
        page,
        limit: LIMIT,
    })

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[--admin-text-1]">Auditoría</h1>
                    <p className="text-xs text-[--admin-text-3]">Historial de acciones administrativas.</p>
                </div>
                <PageInfoButton title="Auditoría — Guía completa" sections={AUDIT_INFO} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <Suspense>
                    <AuditFilters />
                </Suspense>
                <Suspense>
                    <AuditExportButton />
                </Suspense>
            </div>

            <AuditTable rows={rows} totalCount={totalCount} page={page} limit={LIMIT} />

            <Suspense>
                <AdminPagination total={totalCount} pageSize={LIMIT} />
            </Suspense>
        </div>
    )
}
