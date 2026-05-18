/**
 * Pure helpers for the coach program library list (templates + assigned).
 * Shapes align with the Supabase select in workout-programs/page.tsx.
 */

export interface ProgramListModel {
    id: string
    name: string
    client_id: string | null
    weeks_to_repeat: number
    start_date: string | null
    created_at: string
    updated_at?: string
    is_active?: boolean
    program_phases?: { name: string; weeks: number; color?: string }[] | null
    program_structure_type?: 'weekly' | 'cycle' | null
    cycle_length?: number | null
    ab_mode?: boolean | null
    duration_type?: 'weeks' | 'async' | 'calendar_days' | null
    source_template_id?: string | null
    client?: {
        id: string
        full_name: string
    } | null
    workout_plans?: {
        id: string
        day_of_week: number
        title: string
        workout_blocks: {
            id: string
            order_index: number
            exercise: { name: string }
            sets: number
            reps: string
            section?: 'warmup' | 'main' | 'cooldown' | null
            tempo?: string | null
            rir?: string | null
            rest_time?: string | null
            notes?: string | null
            superset_group?: string | null
        }[]
    }[]
}

export interface ProgramStats {
    daysWithWork: number
    blockCount: number
    templateLabel: 'Plantilla' | 'Activo' | 'Inactivo'
    hasPhases: boolean
    cycleLabel: string
    structureKind: 'weekly' | 'cycle'
    lastActivityIso: string
    weeksLabel: string
}

export function getProgramStats(p: ProgramListModel): ProgramStats {
    const plans = p.workout_plans ?? []
    const blockCount = plans.reduce(
        (acc, plan) => acc + (plan.workout_blocks?.length ?? 0),
        0
    )
    const daysWithWork = plans.filter(
        (plan) => (plan.workout_blocks?.length ?? 0) > 0
    ).length

    let templateLabel: ProgramStats['templateLabel'] = 'Plantilla'
    if (p.client_id) {
        templateLabel = p.is_active ? 'Activo' : 'Inactivo'
    }

    const structureKind = (p.program_structure_type || 'weekly') as 'weekly' | 'cycle'
    const cycleLabel =
        structureKind === 'cycle'
            ? `Ciclo ${p.cycle_length ?? '?'}d`
            : ''

    const lastActivityIso = p.updated_at || p.created_at

    return {
        daysWithWork,
        blockCount,
        templateLabel,
        hasPhases: (p.program_phases?.length ?? 0) > 0,
        cycleLabel,
        structureKind,
        lastActivityIso,
        weeksLabel: `${p.weeks_to_repeat} sem.`,
    }
}

export interface LibraryFilters {
    search: string
    filterType: 'all' | 'templates' | 'assigned'
    filterStatus: 'all' | 'active' | 'inactive'
    filterStructure: 'all' | 'weekly' | 'cycle'
    filterHasPhases: 'all' | 'with' | 'without'
}

export function matchesProgramFilters(p: ProgramListModel, f: LibraryFilters): boolean {
    const q = f.search.trim().toLowerCase()
    const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.client?.full_name?.toLowerCase().includes(q) ?? false)

    const matchesType =
        f.filterType === 'templates'
            ? !p.client_id
            : f.filterType === 'assigned'
              ? !!p.client_id && !!p.is_active
              : true

    const matchesStatus =
        f.filterStatus === 'all'
            ? true
            : f.filterStatus === 'active'
              ? !!p.client_id && !!p.is_active
              : !!p.client_id && !p.is_active

    const matchesStructure =
        f.filterStructure === 'all' ||
        (p.program_structure_type || 'weekly') === f.filterStructure

    const hasPhases = !!p.program_phases?.length
    const matchesPhases =
        f.filterHasPhases === 'all'
            ? true
            : f.filterHasPhases === 'with'
              ? hasPhases
              : !hasPhases

    return matchesSearch && matchesType && matchesStatus && matchesStructure && matchesPhases
}

export function formatShortActivityDate(iso: string, locale = 'es'): string {
    try {
        return new Date(iso).toLocaleDateString(locale, {
            day: 'numeric',
            month: 'short',
        })
    } catch {
        return ''
    }
}
