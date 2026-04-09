export type DirectoryRiskFilter =
    | 'all'
    | 'urgent'
    | 'review'
    | 'on_track'
    | 'expired_program'
    | 'password_reset'

export type DirectorySortKey =
    | 'attention_score'
    | 'name_asc'
    | 'last_activity'
    | 'adherence_desc'
    | 'weight_delta'
    | 'plan_days'

export type StatusDirectoryFilter = 'any' | 'active' | 'paused' | 'pending_sync'

export type ProgramDirectoryFilter = 'any' | 'with_program' | 'no_program' | 'expired'

export const SORT_OPTIONS: { label: string; value: DirectorySortKey }[] = [
    { label: 'Urgencia (default)', value: 'attention_score' },
    { label: 'Nombre A→Z', value: 'name_asc' },
    { label: 'Última actividad', value: 'last_activity' },
    { label: 'Adherencia ↓', value: 'adherence_desc' },
    { label: 'Peso: mayor cambio', value: 'weight_delta' },
    { label: 'Días programa', value: 'plan_days' },
]
