import { InfoTooltip } from '@/components/ui/info-tooltip'

interface Props {
    label: string
    value: string | number
    sub?: string
    delta?: number | null
    tooltip?: string
}

export function AdminKpiCard({ label, value, sub, delta, tooltip }: Props) {
    const deltaColor = delta === null || delta === undefined
        ? ''
        : delta > 0
            ? 'text-[--admin-green]'
            : delta < 0
                ? 'text-[--admin-red]'
                : 'text-[--admin-text-3]'

    const deltaLabel = delta !== null && delta !== undefined
        ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`
        : null

    return (
        <div className="relative rounded-lg border-l-2 border-l-[--admin-accent] border-t border-r border-b border-[--admin-border] bg-[--admin-bg-surface] px-4 py-3">
            <div className="mb-1 flex items-center gap-1">
                <span className="text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">
                    {label}
                </span>
                {tooltip && <InfoTooltip content={tooltip} />}
            </div>
            <div className="flex items-end gap-2">
                <span className="font-mono text-2xl font-bold tabular-nums text-[--admin-text-1]">
                    {value}
                </span>
                {deltaLabel && (
                    <span className={`mb-0.5 font-mono text-xs tabular-nums ${deltaColor}`}>
                        {deltaLabel}
                    </span>
                )}
            </div>
            {sub && (
                <p className="mt-0.5 text-[11px] text-[--admin-text-3]">{sub}</p>
            )}
        </div>
    )
}
