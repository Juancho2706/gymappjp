export type DirectoryRiskFilter =
    | 'all'
    | 'urgent'
    | 'review'
    | 'on_track'
    | 'expired_program'
    | 'password_reset'
    | 'nutrition_low'

export type DirectorySortKey =
    | 'attention_score'
    | 'name_asc'
    | 'last_activity'
    | 'adherence_desc'
    | 'weight_delta'
    | 'plan_days'

export const STATUS_DIRECTORY_FILTERS = ['any', 'active', 'paused', 'pending_sync', 'archived'] as const

export type StatusDirectoryFilter = (typeof STATUS_DIRECTORY_FILTERS)[number]

/**
 * `?status=archived` (deep link a «Archivados», que es el único estado que las vistas por defecto
 * esconden) siembra el filtro inicial del directorio. Cualquier otro valor —ausente, basura de un
 * link viejo, un array de query repetida— cae a `'any'`: la URL no puede dejar la pantalla en un
 * estado que la UI no sepa pintar.
 */
export function parseStatusDirectoryFilter(raw: string | string[] | undefined | null): StatusDirectoryFilter {
    const values: readonly string[] = STATUS_DIRECTORY_FILTERS
    return typeof raw === 'string' && values.includes(raw) ? (raw as StatusDirectoryFilter) : 'any'
}

export type ProgramDirectoryFilter = 'any' | 'with_program' | 'no_program' | 'expired'

export const SORT_OPTIONS: { label: string; value: DirectorySortKey }[] = [
    { label: 'Urgencia (default)', value: 'attention_score' },
    { label: 'Nombre A→Z', value: 'name_asc' },
    { label: 'Última actividad', value: 'last_activity' },
    { label: 'Adherencia ↓', value: 'adherence_desc' },
    { label: 'Peso: mayor cambio', value: 'weight_delta' },
    { label: 'Días programa', value: 'plan_days' },
]
