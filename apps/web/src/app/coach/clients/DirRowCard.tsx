'use client'

import { useRouter } from 'next/navigation'
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar'
import 'react-circular-progressbar/dist/styles.css'
import { differenceInDays } from 'date-fns'
import { AlertOctagon, AlertTriangle, Check, Apple, Pencil } from 'lucide-react'
import type { DirectoryPulseRow } from '@/services/dashboard.service'
import { cn } from '@/lib/utils'
import { ArchiveClientButton } from './ArchiveClientButton'
import { DeleteClientButton } from './DeleteClientButton'

// ===== severidad / estado helpers (espejo del diseño coach-directory.jsx) =====
function severityMeta(score: number) {
    if (score >= 50)
        return {
            label: 'Riesgo',
            cls: 'bg-[var(--danger-100)] text-[var(--danger-700)]',
            Icon: AlertOctagon,
        }
    if (score >= 25)
        return {
            label: 'Atención',
            cls: 'bg-[var(--warning-100)] text-[var(--warning-700)]',
            Icon: AlertTriangle,
        }
    return {
        label: 'On track',
        cls: 'bg-[var(--success-100)] text-[var(--success-700)]',
        Icon: Check,
    }
}

function ringColor(adherence: number) {
    if (adherence >= 75) return 'var(--sport-500)'
    if (adherence >= 50) return 'var(--warning-500)'
    return 'var(--danger-500)'
}

function lastDot(days: number) {
    if (days < 3) return 'bg-[var(--success-500)]'
    if (days < 7) return 'bg-[var(--warning-500)]'
    return 'bg-[var(--danger-500)]'
}

function lastLabel(days: number | null) {
    if (days == null) return '—'
    if (days === 0) return 'Hoy'
    if (days === 1) return 'Ayer'
    return `Hace ${days}d`
}

function statusMeta(client: any) {
    if (client.is_archived === true)
        return { key: 'archived', label: 'Archivado', cls: 'bg-surface-sunken text-subtle' }
    if (client.is_active === false)
        return { key: 'paused', label: 'Pausado', cls: 'bg-[var(--ink-100)] text-[var(--ink-600)]' }
    if (client.force_password_change)
        return { key: 'pending_sync', label: 'Pend. sync', cls: 'bg-[var(--info-100)] text-[var(--info-700)]' }
    return { key: 'active', label: 'Activo', cls: 'bg-[var(--success-100)] text-[var(--success-700)]' }
}

interface DirRowCardProps {
    client: any
    pulse: DirectoryPulseRow | null | undefined
    loginUrl: string
    onEdit: () => void
}

export function DirRowCard({ client, pulse, loginUrl, onEdit }: DirRowCardProps) {
    const router = useRouter()
    const score = pulse?.attentionScore ?? 0
    const adherence = pulse?.percentage ?? 0
    const sev = severityMeta(score)
    const SevIcon = sev.Icon

    const last = pulse?.lastWorkoutDate
    const daysSince = last ? differenceInDays(new Date(), new Date(last)) : null
    const dot = lastDot(daysSince == null ? 999 : daysSince)

    const nutritionPct = pulse?.nutritionPercentage ?? 0
    const nutriRisk =
        (pulse?.attentionFlags ?? []).includes('NUTRICION_RIESGO') || nutritionPct < 60
    const hasNutritionData = nutritionPct > 0

    const st = statusMeta(client)

    const profileHref = `/coach/clients/${client.id}`
    const waMessage = `Hola ${client.full_name}! 👋 Soy tu coach. Aquí está tu link para acceder a tu plan: ${loginUrl}`
    const whatsappLink =
        client.phone && loginUrl
            ? `https://wa.me/${client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(waMessage)}`
            : null

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => router.push(profileHref)}
            onKeyDown={(e) => {
                if (e.key === 'Enter') router.push(profileHref)
            }}
            className="flex cursor-pointer items-center gap-3 rounded-card border border-subtle bg-surface-card p-3.5 shadow-[var(--shadow-xs)] transition-colors hover:bg-surface-sunken"
        >
            <div className="relative h-[50px] w-[50px] shrink-0">
                <CircularProgressbar
                    value={adherence}
                    strokeWidth={5}
                    styles={buildStyles({
                        pathColor: ringColor(adherence),
                        trailColor: 'var(--track)',
                        strokeLinecap: 'round',
                    })}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-display text-lg font-black uppercase text-strong">
                        {client.full_name?.[0] ?? '?'}
                    </span>
                </div>
                <span
                    className={cn(
                        'absolute -bottom-px -right-px h-[13px] w-[13px] rounded-full border-2 border-[var(--surface-card)]',
                        dot
                    )}
                />
            </div>

            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-display text-[15.5px] font-black tracking-tight text-strong">
                        {client.full_name}
                    </span>
                    {pulse ? (
                        <span
                            className={cn(
                                'inline-flex h-[19px] shrink-0 items-center gap-1 rounded-pill px-1.5 text-[10.5px] font-bold',
                                sev.cls
                            )}
                        >
                            <SevIcon className="h-[11px] w-[11px]" />
                            {sev.label}
                        </span>
                    ) : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="font-mono font-bold text-strong">{adherence}%</span>
                    <span className="text-[var(--border-strong)]">·</span>
                    <span>{lastLabel(daysSince)}</span>
                    {hasNutritionData && nutriRisk ? (
                        <>
                            <span className="text-[var(--border-strong)]">·</span>
                            <span className="inline-flex items-center gap-1 font-semibold text-[var(--ember-700)]">
                                <Apple className="h-3 w-3" />
                                {nutritionPct}%
                            </span>
                        </>
                    ) : null}
                    {st.key !== 'active' ? (
                        <span className={cn('rounded-pill px-1.5 py-px text-[10.5px] font-bold', st.cls)}>
                            {st.label}
                        </span>
                    ) : null}
                </div>
            </div>

            {/* Acciones reales — stopPropagation para no abrir la ficha */}
            <div
                className="flex shrink-0 items-center gap-0.5"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
            >
                {whatsappLink ? (
                    <a
                        href={whatsappLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-control bg-[#25D366] px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-white transition-colors hover:bg-[#1ebe5d]"
                        aria-label="Enviar WhatsApp"
                    >
                        WA
                    </a>
                ) : null}
                <button
                    type="button"
                    onClick={onEdit}
                    className="rounded-control p-2 text-muted transition-colors hover:bg-surface-card hover:text-sport-600"
                    aria-label="Editar datos"
                >
                    <Pencil className="h-4 w-4" />
                </button>
                <ArchiveClientButton
                    clientId={client.id}
                    clientName={client.full_name}
                    isArchived={client.is_archived === true}
                />
                <DeleteClientButton clientId={client.id} clientName={client.full_name} />
            </div>
        </div>
    )
}
