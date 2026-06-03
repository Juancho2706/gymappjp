import { Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Pill sutil "solo en la app de EVA". Marca features que en la web no existen
 * porque dependen de capacidades nativas (gestos, offline, zoom, charts táctiles).
 * Sin estado → usable en RSC o client components. Responsive (no rompe el layout).
 */
export function AppOnlyBadge({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <span
            className={`inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary ${className}`}
        >
            <Sparkles className="h-3 w-3 shrink-0" />
            <span className="leading-tight">{children}</span>
        </span>
    )
}
