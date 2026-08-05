import { NextResponse, type NextRequest } from 'next/server'
import { assertAdmin } from '@/lib/admin/admin-action-wrapper'
import { getAllCoachesPaginated } from '../../dashboard/_data/admin.queries'
import type { CoachListItem } from '../../dashboard/_data/types'

export const dynamic = 'force-dynamic'

// Export CSV de coaches (SEC-2, F0 08-05): antes el boton cliente importaba la query
// service-role directo (la key no existe en el browser → el export moria con alert generico,
// y la cadena quedaba bundleable). Ahora el CSV se arma aca, con gate admin real.

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

export async function GET(request: NextRequest) {
    try {
        await assertAdmin()
    } catch {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const sp = request.nextUrl.searchParams
    const { coaches } = await getAllCoachesPaginated({
        search: sp.get('q') || undefined,
        status: sp.get('status') || undefined,
        tier: sp.get('tier') || undefined,
        beta: sp.get('beta') === 'true' ? true : undefined,
        provider: sp.get('provider') || undefined,
        stage: sp.get('stage') || undefined,
        atRisk: sp.get('atRisk') === 'true' ? true : undefined,
        sort: sp.get('sort') || undefined,
        dir: sp.get('dir') || undefined,
        page: 1,
        pageSize: 1000,
    })

    // BOM UTF-8: sin el, Excel en Windows es-CL rompe los acentos del CSV.
    const csv = '﻿' + toCsv(coaches)
    const filename = `coaches-${new Date().toISOString().slice(0, 10)}.csv`
    return new NextResponse(csv, {
        headers: {
            'Content-Type': 'text/csv;charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-store',
        },
    })
}
