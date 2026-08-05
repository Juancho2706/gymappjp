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
        body: 'Registro inmutable de todas las acciones administrativas realizadas en el panel CEO. Cada vez que modificas un coach, suspendes un trial, o cambias un tier, queda un log aquí con el admin que lo hizo, la fecha, y los datos que cambiaron.',
    },
    {
        heading: 'Columnas',
        body: 'Timestamp — fecha y hora exacta de la acción.\nAdmin — email del administrador (o "cron" / "coach-self-action" cuando la escribe un proceso).\nAcción — tipo de operación, con etiqueta y color según el catálogo; una acción sin catalogar se muestra con su código crudo.\nTabla — tabla de base de datos afectada.\nTarget ID — UUID del registro modificado; si es un coach enlaza a su ficha, y el botón de copiar entrega el UUID completo.\nIP — IP de origen del admin (solo en registros nuevos; los históricos aparecen con —).\nPayload — datos del cambio, expandibles al hacer click.',
    },
    {
        heading: 'Tipos de acciones',
        body: 'El desplegable de acciones lista el catálogo completo agrupado por área (Coaches, Alumnos, Cupones, Equipos, Organizaciones, Novedades, Procesos automáticos). Además del panel CEO, acá aterrizan las acciones automáticas de los crons de vencimiento y de la conciliación de pagos.',
    },
    {
        heading: 'Filtros',
        body: 'Filtra por tipo de acción, email del admin, rango de fechas (Desde / Hasta o los presets Hoy / 7d / 30d) y UUID del target. Si "Hasta" queda antes de "Desde" se ignora en vez de vaciar la tabla. El botón "Exportar CSV" descarga hasta 5.000 filas con los filtros activos; si se alcanza el tope, el archivo lo avisa en su última fila.',
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
        admin?: string
        from?: string
        to?: string
        target?: string
        page?: string
    }>
}

export default async function AdminAuditoriaPage({ searchParams }: Props) {
    const sp = await searchParams
    const parsedPage = parseInt(sp.page ?? '1', 10)
    const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1

    const { rows, totalCount } = await getAuditLogs({
        action: sp.action,
        admin: sp.admin,
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
                    <h1 className="text-2xl font-bold tracking-tight text-strong">Auditoría</h1>
                    <p className="text-xs text-muted">Historial de acciones administrativas.</p>
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

            <AuditTable rows={rows} />

            <Suspense>
                <AdminPagination total={totalCount} pageSize={LIMIT} />
            </Suspense>
        </div>
    )
}
