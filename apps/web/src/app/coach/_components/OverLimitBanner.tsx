'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import {
    SALE_TIERS,
    TIER_CONFIG,
    TIER_LABELS,
    getTierPriceClp,
    type SubscriptionTier,
} from '@/lib/constants'
// Misma regla de cupo efectivo que /coach/reactivate: la columna manda en el tier actual, la
// escalera de fecha proyecta los demás. Helper puro, sin dependencias de esa ruta.
import { effectiveTierLimit } from '../_lib/effective-limit'

const clpFormatter = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
})

interface Props {
    activeCount: number
    /** Cupo EFECTIVO del tier actual: `coaches.max_clients` o, si es NULL, la escalera de fecha. */
    maxClients: number
    tierLabel: string
    /** Tier crudo del coach — sin él no se puede saber a qué plan corresponde `maxClients`. */
    currentTier: SubscriptionTier
    /**
     * `coaches.created_at` — escalera de grandfather (pre-v2 3 · v2 2 · v3 1). Solo proyecta los
     * tiers que el coach NO tiene: para el actual manda `maxClients` (la columna). Ausente/inválida
     * ⇒ fail-safe generoso (límites viejos), igual que en el resto del sistema.
     */
    coachCreatedAt?: string | null
}

/**
 * Banner global de presión cuando el coach standalone tiene MÁS alumnos activos que el cupo de
 * su plan (ej. tras vencer una cortesía Pro). No es cerrable: la única salida es pagar un plan
 * que calce o archivar alumnos. Se auto-oculta en las rutas donde estorba (pago, reactivación,
 * onboarding), donde el coach ya está resolviendo el cupo.
 */
export function OverLimitBanner({ activeCount, maxClients, tierLabel, currentTier, coachCreatedAt }: Props) {
    const pathname = usePathname()
    if (
        pathname.startsWith('/coach/subscription') ||
        pathname.startsWith('/coach/reactivate') ||
        pathname.startsWith('/coach/onboarding')
    ) {
        return null
    }

    // Cupo con el que se mide CADA plan al recomendar. Pricing v3: el tier ACTUAL vale lo que dice
    // su columna (`maxClients`, ya resuelta en el layout); los demás se proyectan con la escalera de
    // fecha, que es lo que el write-path grabará si el coach los contrata. Medirlos a todos con la
    // escalera mentía dos veces: prometía «hasta 30» a un pro cuya columna dice 25, y podía
    // recomendarle su propio plan actual como salida.
    const limitFor = (t: SubscriptionTier) =>
        effectiveTierLimit({ tier: t, currentTier, coachMaxClients: maxClients, coachCreatedAt })

    // Plan recomendado: el más barato de VENTA cuyo cupo efectivo alcanza a sus alumnos actuales.
    const paidTiers = SALE_TIERS.filter((t) => TIER_CONFIG[t].monthlyPriceClp > 0)
    const suggested = SALE_TIERS.find((t) => limitFor(t) >= activeCount) ?? 'elite'
    // El banner solo existe SOBRE el cupo ⇒ la salida jamás puede ser el gratuito (solo alcanzable
    // con un `max_clients` manual bajo el piso del tier) NI el plan que el coach ya tiene: si el
    // sugerido cae en cualquiera de esos dos, saltamos al siguiente tier de venta PAGO que sí lo
    // cubra (y si ninguno cubre, al pago más barato distinto del actual; el techo real es Teams).
    const needsPaidJump =
        TIER_CONFIG[suggested].monthlyPriceClp === 0 ||
        (suggested === currentTier && limitFor(suggested) < activeCount)
    const recommended: SubscriptionTier = needsPaidJump
        ? paidTiers.find((t) => t !== currentTier && limitFor(t) >= activeCount) ??
          paidTiers.find((t) => t !== currentTier) ??
          paidTiers[0] ??
          'elite'
        : suggested
    const recommendedLabel = TIER_LABELS[recommended]
    const recommendedPrice = clpFormatter.format(getTierPriceClp(recommended, 'monthly'))
    const recommendedMax = limitFor(recommended)

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
