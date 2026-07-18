'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Clock } from 'lucide-react'
import { getRecommendedTier, TIER_CONFIG } from '@/lib/constants'
import { formatStudentAccessDate, resolveStudentGraceEndsAt } from '@/lib/student-access'

interface Props {
    subscriptionStatus: string | null
    currentPeriodEnd: string | null
    trialEndsAt: string | null
    activeClientCount?: number
    /**
     * Ancla del corte cuando un flujo de expiracion NULLea current_period_end
     * (coaches.paid_access_ended_at, migracion B-datos). Opcional: sin la columna cableada la
     * gracia de alumnos ancla en currentPeriodEnd (coalesce espejo de la RLS).
     */
    paidAccessEndedAt?: string | null
}

export function BillingBanners({ subscriptionStatus, currentPeriodEnd, trialEndsAt, activeClientCount = 0, paidAccessEndedAt = null }: Props) {
    const [nowMs, setNowMs] = useState<number | null>(null)

    useEffect(() => {
        setNowMs(Date.now())
    }, [])

    if (nowMs === null) return null

    const canceledGrace =
        subscriptionStatus === 'canceled' && currentPeriodEnd && new Date(currentPeriodEnd).getTime() > nowMs
    const trialActive = trialEndsAt && new Date(trialEndsAt).getTime() > nowMs
    const blocked =
        subscriptionStatus === 'canceled' && currentPeriodEnd && new Date(currentPeriodEnd).getTime() <= nowMs

    // Politica CEO 2026-07-18: los ALUMNOS pierden acceso 7 dias despues del fin del periodo pagado
    // (coalesce(paid_access_ended_at, current_period_end) + 7d). La presion de reactivar vive AQUI,
    // en el coach — el banner del alumno es discreto y sin countdown.
    const studentsGraceEndsAt = resolveStudentGraceEndsAt(paidAccessEndedAt, currentPeriodEnd)
    const studentsPressure =
        activeClientCount > 0 && studentsGraceEndsAt ? (
            studentsGraceEndsAt.getTime() > nowMs ? (
                <span className="text-xs opacity-90">
                    Tus <strong>{activeClientCount} alumno{activeClientCount === 1 ? '' : 's'}</strong> perderán acceso el{' '}
                    <strong>{formatStudentAccessDate(studentsGraceEndsAt)}</strong>.{' '}
                    <Link href="/coach/reactivate" className="underline font-semibold">Reactivar</Link>
                </span>
            ) : (
                <span className="text-xs opacity-90">
                    Tus <strong>{activeClientCount} alumno{activeClientCount === 1 ? '' : 's'}</strong> quedaron en solo-lectura el{' '}
                    <strong>{formatStudentAccessDate(studentsGraceEndsAt)}</strong>.{' '}
                    <Link href="/coach/reactivate" className="underline font-semibold">Reactivar</Link>
                </span>
            )
        ) : null

    if (blocked) {
        return (
            <Banner tone="danger" icon={<AlertTriangle className="h-4 w-4" />}>
                <span>Tu suscripcion esta cancelada. Reactiva para recuperar acceso.</span>
                <Link href="/coach/subscription" className="underline font-semibold">Reactivar</Link>
                {studentsPressure}
            </Banner>
        )
    }

    if (canceledGrace) {
        const days = Math.max(0, Math.ceil((new Date(currentPeriodEnd!).getTime() - nowMs) / 86400000))
        const showRec = days <= 7 && activeClientCount > 0
        const recTier = showRec ? getRecommendedTier(activeClientCount) : null
        const recConfig = recTier ? TIER_CONFIG[recTier] : null
        return (
            <Banner tone="warn" icon={<Clock className="h-4 w-4" />}>
                <span>Cancelaste tu plan. Acceso hasta por {days} dia{days === 1 ? '' : 's'}.</span>
                {studentsPressure}
                {showRec && recConfig && recTier ? (
                    <span className="text-xs opacity-80">
                        Con {activeClientCount} alumnos: <strong>Plan {recConfig.label}</strong> (hasta {recConfig.maxClients}) ·{' '}
                        <Link href={`/coach/reactivate?tier=${recTier}`} className="underline font-semibold">
                            Activar {recConfig.label}
                        </Link>
                    </span>
                ) : (
                    <Link href="/coach/subscription" className="underline font-semibold">Renovar</Link>
                )}
            </Banner>
        )
    }

    if (trialActive) {
        const days = Math.max(0, Math.ceil((new Date(trialEndsAt!).getTime() - nowMs) / 86400000))
        const showRec = days <= 7 && activeClientCount > 0
        const recTier = showRec ? getRecommendedTier(activeClientCount) : null
        const recConfig = recTier ? TIER_CONFIG[recTier] : null
        return (
            <Banner tone="info" icon={<Clock className="h-4 w-4" />}>
                <span>Periodo de prueba · {days} dia{days === 1 ? '' : 's'} restantes.</span>
                {showRec && recConfig && recTier ? (
                    <span className="text-xs opacity-80">
                        Con {activeClientCount} alumnos: <strong>Plan {recConfig.label}</strong> (hasta {recConfig.maxClients}) ·{' '}
                        <Link href={`/coach/reactivate?tier=${recTier}`} className="underline font-semibold">
                            Activar {recConfig.label}
                        </Link>
                    </span>
                ) : (
                    <Link href="/coach/subscription" className="underline font-semibold">Activar plan</Link>
                )}
            </Banner>
        )
    }

    return null
}

function Banner({
    children,
    tone,
    icon,
}: {
    children: React.ReactNode
    tone: 'info' | 'warn' | 'danger'
    icon?: React.ReactNode
}) {
    const toneCls =
        tone === 'danger'
            ? 'border-[var(--danger-500)]/30 bg-[var(--danger-100)] text-[var(--danger-700)]'
            : tone === 'warn'
              ? 'border-[var(--warning-500)]/30 bg-[var(--warning-100)] text-[var(--warning-700)]'
              : 'border-[var(--sport-500)]/30 bg-[var(--sport-100)] text-[var(--sport-700)]'
    return (
        <div
            className={`flex flex-wrap items-center gap-3 rounded-card border px-4 py-3 text-sm ${toneCls}`}
            role="status"
        >
            {icon}
            {children}
        </div>
    )
}
