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
            /** Area (workout_section_templates.id) — preferente sobre section legacy (expand-contract) */
            section_template_id?: string | null
            tempo?: string | null
            rir?: string | null
            rest_time?: string | null
            notes?: string | null
            superset_group?: string | null
        }[]
    }[]
}

/**
 * Copy ÚNICO de identidad y estado (SPEC plan-vivo-y-guardado · tabla de PLAN.md).
 * Vive acá para que la fila, la tarjeta y la vista previa no inventen variantes.
 */
export const PROGRAM_STATUS_LABEL = {
    template: 'Plantilla',
    active: 'En uso',
    inactive: 'Ya no está en uso',
} as const

export type ProgramStatusLabel = (typeof PROGRAM_STATUS_LABEL)[keyof typeof PROGRAM_STATUS_LABEL]

/**
 * Etiqueta de estado de un programa de la biblioteca:
 * plantilla (sin alumno) · copia viva del alumno · copia que quedó como historial.
 */
export function programStatusLabel(
    p: Pick<ProgramListModel, 'client_id' | 'is_active'>
): ProgramStatusLabel {
    if (!p.client_id) return PROGRAM_STATUS_LABEL.template
    return p.is_active ? PROGRAM_STATUS_LABEL.active : PROGRAM_STATUS_LABEL.inactive
}

/**
 * Identidad EN PANTALLA de la copia (decisión del owner D3-A: no se renombra nada en la base).
 * 105 de 122 copias heredaron el nombre exacto de su plantilla, así que el nombre guardado no
 * distingue nada: la copia se rotula por su alumno y la plantilla conserva su nombre.
 */
export function programDisplayName(p: ProgramListModel): string {
    if (p.client_id && p.client?.full_name) return `Plan de ${p.client.full_name}`
    return p.name
}

/**
 * Linaje de la copia — se resuelve contra las filas YA cargadas (plantilla y copias viven en la
 * misma lista, sin query nueva). Si la plantilla madre no está en la lista se omite en silencio:
 * nunca se muestra un id.
 */
export function programLineageLabel(
    p: Pick<ProgramListModel, 'source_template_id'>,
    templateNames?: ReadonlyMap<string, string>
): string | null {
    if (!p.source_template_id || !templateNames) return null
    const name = templateNames.get(p.source_template_id)
    return name ? `Copia de «${name}»` : null
}

export interface ProgramStats {
    daysWithWork: number
    blockCount: number
    /** Etiqueta de estado lista para pintar (`programStatusLabel`). */
    statusLabel: ProgramStatusLabel
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

    const structureKind = (p.program_structure_type || 'weekly') as 'weekly' | 'cycle'
    const cycleLabel =
        structureKind === 'cycle'
            ? `Ciclo ${p.cycle_length ?? '?'}d`
            : ''

    const lastActivityIso = p.updated_at || p.created_at

    return {
        daysWithWork,
        blockCount,
        statusLabel: programStatusLabel(p),
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

    // `filterType` dice QUÉ es (plantilla / copia de un alumno) y `filterStatus` dice EN QUÉ
    // ESTADO está. Hasta el 07-09-2026 `assigned` exigía además `is_active`, así que las 78
    // copias inactivas de producción solo aparecían en «Todos» y la combinación
    // asignados + «Ya no está en uso» era un callejón siempre vacío. Los dos ejes ya no se pisan.
    const matchesType =
        f.filterType === 'templates'
            ? !p.client_id
            : f.filterType === 'assigned'
              ? !!p.client_id
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
