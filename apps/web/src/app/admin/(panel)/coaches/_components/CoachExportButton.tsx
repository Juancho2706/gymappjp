'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
    params: {
        search?: string
        status?: string
        tier?: string
        beta?: boolean
        provider?: string
        stage?: string
        atRisk?: boolean
        sort?: string
        dir?: string
    }
}

// El CSV se genera server-side en /admin/coaches/export (gate admin + service-role alla).
// Este boton solo arma la URL con los filtros activos y descarga el blob (SEC-2, F0 08-05).
export function CoachExportButton({ params }: Props) {
    const [loading, setLoading] = useState(false)

    async function handleExport() {
        setLoading(true)
        try {
            const qs = new URLSearchParams()
            if (params.search) qs.set('q', params.search)
            if (params.status) qs.set('status', params.status)
            if (params.tier) qs.set('tier', params.tier)
            if (params.beta) qs.set('beta', 'true')
            if (params.provider) qs.set('provider', params.provider)
            if (params.stage) qs.set('stage', params.stage)
            if (params.atRisk) qs.set('atRisk', 'true')
            if (params.sort) qs.set('sort', params.sort)
            if (params.dir) qs.set('dir', params.dir)

            const res = await fetch(`/admin/coaches/export?${qs.toString()}`)
            if (!res.ok) throw new Error(`export ${res.status}`)
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `coaches-${new Date().toISOString().slice(0, 10)}.csv`
            a.click()
            URL.revokeObjectURL(url)
            toast.success('CSV descargado')
        } catch (err) {
            toast.error(err instanceof Error ? `Error al exportar: ${err.message}` : 'Error al exportar')
        } finally {
            setLoading(false)
        }
    }

    return (
        <button
            onClick={handleExport}
            disabled={loading}
            className="flex items-center gap-1.5 rounded border border-subtle bg-surface-sunken px-3 py-1.5 text-xs text-body hover:text-strong hover:border-[var(--sport-500)] transition-colors disabled:opacity-50"
        >
            <Download className="h-3.5 w-3.5" />
            {loading ? 'Exportando...' : 'Exportar CSV'}
        </button>
    )
}
