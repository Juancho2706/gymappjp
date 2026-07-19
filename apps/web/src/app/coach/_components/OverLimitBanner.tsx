'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import {
    SALE_TIERS,
    TIER_CONFIG,
    TIER_LABELS,
    getTierMaxClients,
    getTierPriceClp,
    type SaleTier,
} from '@/lib/constants'

const clpFormatter = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
})

interface Props {
    activeCount: number
    maxClients: number
    tierLabel: string
}

/**
 * Banner global de presión cuando el coach standalone tiene MÁS alumnos activos que el cupo de
 * su plan (ej. tras vencer una cortesía Pro). No es cerrable: la única salida es pagar un plan
 * que calce o archivar alumnos. Se auto-oculta en las rutas donde estorba (pago, reactivación,
 * onboarding), donde el coach ya está resolviendo el cupo.
 */
export function OverLimitBanner({ activeCount, maxClients, tierLabel }: Props) {
    const pathname = usePathname()
    if (
        pathname.startsWith('/coach/subscription') ||
        pathname.startsWith('/coach/reactivate') ||
        pathname.startsWith('/coach/onboarding')
    ) {
        return null
    }

    // Plan recomendado: el pago más barato cuyo cupo alcanza a los alumnos actuales; si ninguno
    // calza (más de 100), Elite.
    const paidTiers = SALE_TIERS.filter((t) => TIER_CONFIG[t].monthlyPriceClp > 0)
    const recommended: SaleTier = paidTiers.find((t) => getTierMaxClients(t) >= activeCount) ?? 'elite'
    const recommendedLabel = TIER_LABELS[recommended]
    const recommendedPrice = clpFormatter.format(getTierPriceClp(recommended, 'monthly'))
    const recommendedMax = getTierMaxClients(recommended)

    return (
        <div className="border-b border-[var(--danger-500)]/30 bg-[var(--danger-100)] pl-safe pr-safe pt-safe">
            <div className="mx-auto flex w-full max-w-[var(--dt-read-wide)] flex-col gap-3 px-5 py-3.5 md:flex-row md:items-center md:justify-between md:px-[var(--dt-page-x)]">
                <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--danger-500)]/15 text-[var(--danger-600)]">
                        <AlertTriangle className="size-[18px]" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-[var(--text-strong)]">
                            Tienes {activeCount} alumnos activos y tu plan {tierLabel} incluye {maxClients}.
                        </p>
                        <p className="mt-0.5 text-[13px] leading-snug text-[var(--text-muted)]">
                            Con {recommendedLabel} ({recommendedPrice}/mes) sigues trabajando con hasta{' '}
                            {recommendedMax} alumnos y con los 4 módulos incluidos.
                        </p>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <Link
                        href="/coach/subscription"
                        className="inline-flex h-9 items-center justify-center rounded-control bg-[var(--danger-500)] px-4 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
                    >
                        Elegir mi plan
                    </Link>
                    <Link
                        href="/coach/clients"
                        className="inline-flex h-9 items-center justify-center rounded-control border border-border-subtle bg-surface-card px-4 text-[13px] font-bold text-[var(--text-strong)] transition-colors hover:bg-surface-sunken"
                    >
                        Archivar alumnos
                    </Link>
                </div>
            </div>
        </div>
    )
}
