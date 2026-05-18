'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { getAllCoachesPaginated } from '../../dashboard/_data/admin.queries'
import type { CoachListItem } from '../../dashboard/_data/types'

function toCsv(coaches: CoachListItem[]): string {
    const headers = [
        'full_name', 'brand_name', 'slug', 'email', 'tier', 'status', 'lifecycle',
        'billing_cycle', 'provider', 'max_clients', 'active_clients', 'total_clients',
        'days_until_expiry', 'mrr_clp', 'last_active', 'registered_at',
    ]
    const rows = coaches.map(c => [
        c.full_name ?? '',
        c.brand_name ?? '',
        c.slug,
        c.auth_email ?? '',
        c.subscription_tier ?? '',
        c.subscription_status ?? '',
        c.lifecycle_stage,
        c.billing_cycle ?? '',
        c.payment_provider ?? '',
        String(c.max_clients ?? ''),
        String(c.active_client_count),
        String(c.client_count),
        c.days_until_expiry !== null ? String(c.days_until_expiry) : '',
        String(c.monthly_revenue),
        c.coach_last_active_at ?? '',
        c.created_at,
    ].map(v => `"${v.replace(/"/g, '""')}"`).join(','))
    return [headers.join(','), ...rows].join('\n')
}

interface Props {
    params: {
        search?: string
        status?: string
        tier?: string
        beta?: boolean
        stage?: string
        atRisk?: boolean
        sort?: string
        dir?: string
    }
}

export function CoachExportButton({ params }: Props) {
    const [loading, setLoading] = useState(false)

    async function handleExport() {
        setLoading(true)
        try {
            const { coaches } = await getAllCoachesPaginated({ ...params, page: 1, pageSize: 1000 })
            const csv = toCsv(coaches)
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `coaches-${new Date().toISOString().slice(0, 10)}.csv`
            a.click()
            URL.revokeObjectURL(url)
        } catch {
            alert('Error al exportar')
        } finally {
            setLoading(false)
        }
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
