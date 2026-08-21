import { EVA_BADGE_LABEL, getEvaBadgeUrl, type EvaBadgeMedium } from '@/lib/constants'

/**
 * Sello «Hecho con EVA» (Pricing v3, decisión owner 2026-08-21 · D3=A).
 *
 * Desde v3 el white-label es de TODOS los planes: Free personaliza igual que Pro, pero sus
 * superficies del alumno llevan este sello. Pro/Elite lo quitan (`showsEvaBadge(tier) === false`).
 *
 * Reglas de pintado (no negociables):
 *  - Va SIEMPRE sobre superficie NEUTRA (fondo de página / footer), NUNCA sobre el color de marca
 *    ⇒ el contraste no depende del hex que eligió el coach (pauli #8B5CF6, anais #0000ff, robin
 *    #4c2020 con login `hero`… todos igual de legibles).
 *  - Discreto pero VISIBLE: 11px, `text-muted-foreground` pleno — sin opacidad, que era lo que
 *    hacía invisible al viejo «Potenciado por EVA» (`/50`).
 *  - Link real con UTMs por superficie: es el canal de adquisición del plan Free.
 *
 * Server-compatible a propósito (sin hooks ni 'use client'): se monta tanto en el layout del
 * alumno como en el login, ambos Server Components.
 */
export function EvaBadge({
    medium = 'student_app',
    className = '',
}: {
    medium?: EvaBadgeMedium
    /** Clases de posicionamiento del contenedor (márgenes/padding). El estilo del sello es fijo. */
    className?: string
}) {
    return (
        <div className={`w-full py-2 text-center ${className}`.trim()}>
            <a
                href={getEvaBadgeUrl(medium)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm text-[11px] font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
            >
                {EVA_BADGE_LABEL}
            </a>
        </div>
    )
}
