import { cn } from '@/lib/utils'

/**
 * Anillo de progreso n/5 de la cabecera de la guía. Presentación pura (sin estado): recibe el
 * progreso ya resuelto por `useOnboardingGuide`.
 *
 * `role="img"` + `aria-label`: para un lector de pantalla vale el «3 de 5», no el SVG. El anillo
 * anima el trazo con `motion-safe:` — con `prefers-reduced-motion` salta directo al valor.
 */
export function GuideProgressRing({
    done,
    total,
    className,
}: {
    done: number
    total: number
    className?: string
}) {
    const size = 76
    const stroke = 7
    const radius = (size - stroke) / 2
    const circumference = 2 * Math.PI * radius
    const ratio = total > 0 ? Math.min(Math.max(done / total, 0), 1) : 0

    return (
        <div
            role="img"
            aria-label={`Progreso de la guía: ${done} de ${total}`}
            className={cn('relative shrink-0', className)}
            style={{ width: size, height: size }}
        >
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="var(--track)"
                    strokeWidth={stroke}
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="var(--sport-500)"
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - ratio)}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-[520ms] motion-safe:ease-[var(--ease-out)]"
                />
            </svg>
            <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center leading-none">
                <span className="font-display text-[22px] font-black tracking-[-0.03em] text-[var(--text-strong)]">
                    {done}
                </span>
                <span className="mt-0.5 text-[11px] font-bold text-[var(--text-muted)]">de {total}</span>
            </span>
        </div>
    )
}
