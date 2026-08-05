import { NextResponse } from 'next/server'
import { assertAdmin } from '@/lib/admin/admin-action-wrapper'
import { getFinanzasData } from '../_data/finanzas.queries'

export const dynamic = 'force-dynamic'

// Export CSV de finanzas (F2 08-05): mismo patron que /admin/coaches/export — el CSV se arma
// server-side con gate admin real (getFinanzasData corre con service-role y NUNCA es bundleable
// al browser). Un solo archivo con secciones para que el CEO lo abra en Excel sin post-proceso.

const CYCLE_LABELS: Record<string, string> = {
    monthly: 'Mensual',
    quarterly: 'Trimestral',
    annual: 'Anual',
}

const PROVIDER_LABELS: Record<string, string> = {
    mercadopago: 'MercadoPago',
    flow: 'Flow',
}

/** Escapa y entrecomilla cada celda (Excel es-CL: comas y acentos dentro del valor). */
function row(cells: (string | number)[]): string {
    return cells.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')
}

function buildCsv(data: Awaited<ReturnType<typeof getFinanzasData>>): string {
    const lines: string[] = []

    lines.push(row(['RESUMEN']))
    lines.push(row(['metrica', 'valor_clp']))
    lines.push(row(['mrr_neto', data.mrrEstimate]))
    lines.push(row(['mrr_bruto', data.mrrGross]))
    lines.push(row(['descuentos', data.mrrDiscountClp]))
    lines.push(row(['arr', data.arrEstimate]))
    lines.push(row(['arpc', data.arpc]))
    lines.push(row(['coaches_pagando', data.paidCoachCount]))
    lines.push(row(['cobrado_30d', data.charged30dClp]))
    lines.push(row(['cobrado_30d_cobros', data.charged30dCount]))

    lines.push('')
    lines.push(row(['MRR POR PASARELA']))
    lines.push(row(['proveedor', 'mrr_clp', 'coaches']))
    for (const p of data.byProvider) {
        lines.push(row([PROVIDER_LABELS[p.provider] ?? p.provider, p.mrrClp, p.coachCount]))
    }

    lines.push('')
    lines.push(row(['DESCUENTOS VIVOS']))
    lines.push(row(['coach', 'codigo', 'descuento', 'lista_clp', 'paga_clp', 'vigencia']))
    for (const d of data.liveDiscounts) {
        lines.push(row([
            d.coachLabel,
            d.code ?? '',
            d.discountLabel,
            d.listMonthlyClp,
            d.netMonthlyClp,
            // remainingCycles null = cupon forever (no vence mientras siga activo).
            d.remainingCycles === null ? 'forever' : `${d.remainingCycles} ciclos`,
        ]))
    }

    lines.push('')
    lines.push(row(['REVENUE POR TIER']))
    lines.push(row(['tier', 'mrr_clp', 'coaches']))
    for (const t of data.revenueByTier) {
        lines.push(row([t.tier, t.mrr_clp, t.coach_count]))
    }

    lines.push('')
    lines.push(row(['REVENUE POR CICLO']))
    lines.push(row(['ciclo', 'mrr_clp', 'coaches']))
    for (const c of data.revenueByCycle) {
        lines.push(row([CYCLE_LABELS[c.billing_cycle] ?? c.billing_cycle, c.mrr_clp, c.coach_count]))
    }

    return lines.join('\n')
}

export async function GET() {
    try {
        await assertAdmin()
    } catch {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const data = await getFinanzasData()

    // BOM UTF-8: sin el, Excel en Windows es-CL rompe los acentos del CSV.
    const csv = '﻿' + buildCsv(data)
    const filename = `finanzas-${new Date().toISOString().slice(0, 10)}.csv`
    return new NextResponse(csv, {
        headers: {
            'Content-Type': 'text/csv;charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-store',
        },
    })
}
