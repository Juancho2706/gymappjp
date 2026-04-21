import Link from 'next/link'
import { ForgeThemeToggle } from '../ForgeThemeToggle'

export function ForgeDemoChrome({
    title,
    subtitle,
    breadcrumb,
}: {
    title: string
    subtitle?: string
    /** Contexto de pantalla (ej. Dashboard · Alumnos). */
    breadcrumb?: string
}) {
    return (
        <div className="forge-font-mono flex flex-shrink-0 flex-col gap-1 border-b border-[var(--forge-border)] bg-[var(--forge-surface)] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4 sm:py-3">
            <Link
                href="/landingpage4"
                title="Volver a la vitrina FORGE"
                className="order-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--forge-muted)] hover:text-[var(--forge-accent)] sm:order-none"
            >
                ← FORGE
            </Link>
            <div className="order-1 min-w-0 flex-1 text-center sm:order-none">
                {breadcrumb ? (
                    <p className="truncate text-[9px] font-semibold uppercase tracking-wider text-[var(--forge-muted)]">{breadcrumb}</p>
                ) : null}
                <p className="truncate text-[11px] font-bold uppercase tracking-widest text-[var(--forge-ink)]">{title}</p>
                {subtitle ? <p className="truncate text-[9px] text-[var(--forge-muted)]">{subtitle}</p> : null}
            </div>
            <div className="order-3 flex justify-end sm:order-none">
                <ForgeThemeToggle />
            </div>
        </div>
    )
}
