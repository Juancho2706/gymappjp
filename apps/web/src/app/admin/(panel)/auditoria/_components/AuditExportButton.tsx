'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Download } from 'lucide-react'
import { exportAuditCsvAction } from '../_actions/export-audit'

export function AuditExportButton() {
    const sp = useSearchParams()
    const [loading, setLoading] = useState(false)

    async function handleExport() {
        setLoading(true)
        const res = await exportAuditCsvAction({
            action: sp.get('action') ?? undefined,
            from: sp.get('from') ?? undefined,
            to: sp.get('to') ?? undefined,
            target: sp.get('target') ?? undefined,
        })
        setLoading(false)

        if ('error' in res) {
            alert(`Error al exportar: ${res.error}`)
            return
        }

        const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <button
            onClick={handleExport}
            disabled={loading}
            className="flex items-center gap-1.5 rounded border border-[--admin-border] bg-[--admin-bg-elevated] px-3 py-1.5 text-xs text-[--admin-text-2] hover:text-[--admin-text-1] hover:border-[--admin-accent] transition-colors disabled:opacity-50"
        >
            <Download className="h-3.5 w-3.5" />
            {loading ? 'Exportando...' : 'Exportar CSV'}
        </button>
    )
}
