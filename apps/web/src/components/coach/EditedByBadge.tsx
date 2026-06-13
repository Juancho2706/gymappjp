import { Users } from 'lucide-react'
import { formatRelativeDate, getSantiagoIsoYmdForUtcInstant } from '@/lib/date-utils'

/**
 * E (awareness del pool): "Editado por X · hace Y". Server component puro — el caller
 * decide cuándo mostrarlo (contexto team + editor distinto del coach actual).
 */
export function EditedByBadge({ name, at }: { name: string; at?: string | null }) {
    const when = at ? formatRelativeDate(getSantiagoIsoYmdForUtcInstant(at)) : null
    return (
        <span
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
            title={`Última edición de ${name}${when ? ` · ${when.toLowerCase()}` : ''}`}
        >
            <Users className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">
                Editado por {name}
                {when ? <span className="opacity-70"> · {when.toLowerCase()}</span> : null}
            </span>
        </span>
    )
}
