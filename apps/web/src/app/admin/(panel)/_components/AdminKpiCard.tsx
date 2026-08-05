import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { InfoTooltip } from '@/components/ui/info-tooltip'

interface Props {
    label: string
    value: string | number
    sub?: string
    delta?: number | null
    tooltip?: string
    /** Icono opcional junto al eyebrow (idiom KpiTile). */
    icon?: LucideIcon
    /** Destino opcional — la card entera se vuelve link con "Ver detalle →". */
    href?: string
}

// Escala del valor segun largo (idiom valueSizeClass del KpiTile coach, un paso mas denso
// porque el admin muestra 10 KPIs a la vez).
function valueSizeClass(value: string): string {
    const len = value.length
    if (len <= 6) return 'text-[26px]'
    if (len <= 9) return 'text-[22px]'
    if (len <= 12) return 'text-xl'
    return 'text-lg'
}

/**
 * KPI card del panel CEO sobre el idiom EVA DS (F1 08-05): eyebrow bold, valor
 * font-display black con escala por largo, delta como pill ▲/▼, rounded-card + sombra,
 * hover lift si es interactiva. API previa intacta (label/value/sub/delta/tooltip).
 */
export function AdminKpiCard({ label, value, sub, delta, tooltip, icon: Icon, href }: Props) {
    const strValue = String(value)
    const hasDelta = typeof delta === 'number' && !Number.isNaN(delta)
    const up = hasDelta && (delta as number) >= 0

    const inner = (
        <div className="flex h-full flex-col gap-1.5 px-4 py-3">
            <div className="flex items-center justify-between gap-1">
                <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                    {label}
                    {tooltip && <InfoTooltip content={tooltip} />}
                </span>
                {Icon && <Icon className="size-4 text-sport-500" />}
            </div>
            <div className="flex items-end gap-2">
                <span className={cn(
                    'block max-w-full truncate font-display font-black leading-none tracking-[-0.03em] tabular-nums text-strong',
                    valueSizeClass(strValue)
                )}>
                    {strValue}
                </span>
                {hasDelta && (
                    <span className={cn(
                        'mb-0.5 inline-flex w-fit shrink-0 items-center gap-1 rounded-pill px-1.5 py-0.5 text-[11px] font-bold',
                        up
                            ? 'bg-[var(--success-100)] text-[var(--success-600)]'
                            : 'bg-[var(--danger-100)] text-[var(--danger-600)]'
                    )}>
                        <span aria-hidden className="text-[10px] leading-none">{up ? '▲' : '▼'}</span>
                        {Math.abs(delta as number).toFixed(1)}%
                    </span>
                )}
            </div>
            {sub && <p className="text-[11px] leading-snug text-muted">{sub}</p>}
            {href && <span className="mt-auto pt-0.5 text-[11px] font-bold text-sport-500">Ver detalle →</span>}
        </div>
    )

    const surface = cn(
        'h-full rounded-card border border-border-subtle bg-surface-card shadow-[var(--shadow-sm)]',
        href && 'block cursor-pointer transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-[var(--shadow-md)]'
    )

    if (href) {
        return <Link href={href} className={surface}>{inner}</Link>
    }
    return <div className={surface}>{inner}</div>
}
