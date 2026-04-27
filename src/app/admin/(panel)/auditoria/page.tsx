import { Suspense } from 'react'
import { getAuditLogs } from './_data/auditoria.queries'
import { AuditFilters } from './_components/AuditFilters'
import { AuditTable } from './_components/AuditTable'
import { AuditExportButton } from './_components/AuditExportButton'
import { AdminPagination } from '../_components/AdminPagination'

export const metadata = { title: 'Auditoría' }

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
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-[--admin-text-1]">Auditoría</h1>
                <p className="text-xs text-[--admin-text-3]">Historial de acciones administrativas.</p>
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
