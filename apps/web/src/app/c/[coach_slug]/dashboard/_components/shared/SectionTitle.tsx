import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Dash_SectionTitle del diseño eva-app: barra de acento + label uppercase + acción opcional.
 * Usado para separar las secciones del dashboard del alumno (Momentum, Tu programa, etc.).
 */
export function SectionTitle({
    children,
    accent = 'var(--sport-500)',
    action,
    actionHref,
}: {
    children: ReactNode
    accent?: string
    action?: string
    actionHref?: string
}) {
    return (
        <div className="mx-0.5 mb-2.5 mt-5 flex items-center justify-between">
            <span className="inline-flex items-center gap-2">
                <span aria-hidden className="h-3 w-[3px] shrink-0 rounded-sm" style={{ background: accent }} />
                <span className="text-[11px] font-extrabold uppercase tracking-[0.07em] text-subtle">{children}</span>
            </span>
            {action && actionHref ? (
                <Link href={actionHref} className="text-[12.5px] font-bold text-sport-600">
                    {action}
                </Link>
            ) : null}
        </div>
    )
}
