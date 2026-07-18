/**
 * Programs library — tipos + helpers PUROS (sin React, sin Supabase).
 *
 * Extraído del screen `app/coach/(tabs)/builder.tsx` en el re-skin DS (E3-15):
 * la lista de programas y sus cards/preview consumen estos helpers. La LÓGICA de
 * datos (fetch + duplicar/asignar/sincronizar) sigue viviendo en el screen —
 * acá sólo va lo pura y testeable (stats, orden, filtro, etiquetas).
 */

export type FilterType = 'all' | 'templates' | 'assigned'
export type FilterStatus = 'all' | 'active' | 'inactive'
export type FilterStructure = 'all' | 'weekly' | 'cycle'
export type FilterPhases = 'all' | 'with' | 'without'

export type ClientLite = {
  id: string
  full_name: string
  workout_programs?: { id: string; name: string; is_active?: boolean | null }[] | null
}

export type ProgramBlock = {
  id: string
  exercise_id: string
  order_index: number
  sets: number
  reps: string
  section: string | null
  tempo: string | null
  rir: string | null
  rest_time: string | null
  notes: string | null
  superset_group: string | null
  target_weight_kg?: number | null
  progression_type?: string | null
  progression_value?: number | null
  progression_mode?: string | null
  is_override?: boolean | null
  exercise?: { name: string | null } | null
}

export type ProgramPlan = {
  id: string
  day_of_week: number | null
  title: string
  group_name?: string | null
  week_variant?: string | null
  assigned_date?: string | null
  workout_blocks?: ProgramBlock[] | null
}

export type ProgramItem = {
  id: string
  name: string
  client_id: string | null
  org_id?: string | null
  weeks_to_repeat: number | null
  start_date: string | null
  end_date?: string | null
  duration_days?: number | null
  start_date_flexible?: boolean | null
  program_notes?: string | null
  created_at: string
  updated_at?: string | null
  is_active?: boolean | null
  program_phases?: { name: string; weeks: number; color?: string }[] | null
  program_structure_type?: 'weekly' | 'cycle' | null
  cycle_length?: number | null
  ab_mode?: boolean | null
  duration_type?: 'weeks' | 'async' | 'calendar_days' | null
  source_template_id?: string | null
  client?: { id: string; full_name: string } | null
  workout_plans?: ProgramPlan[] | null
}

export type ProgramStats = {
  daysWithWork: number
  blockCount: number
  structureKind: 'weekly' | 'cycle'
  hasPhases: boolean
  lastActivityIso: string
}

export type LibraryStats = { templates: number; active: number; noProgram: number; total: number }

export type ProgramFilters = {
  search: string
  filterType: FilterType
  filterStatus: FilterStatus
  filterStructure: FilterStructure
  filterPhases: FilterPhases
}

const DAY_LABELS = ['', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']

export function normalizeProgram(program: ProgramItem): ProgramItem {
  return {
    ...program,
    program_structure_type: program.program_structure_type ?? 'weekly',
    weeks_to_repeat: program.weeks_to_repeat ?? 1,
    workout_plans: sortedPlans(program),
  }
}

export function getProgramStats(program: ProgramItem): ProgramStats {
  const plans = program.workout_plans ?? []
  const blockCount = plans.reduce((sum, plan) => sum + (plan.workout_blocks?.length ?? 0), 0)
  const daysWithWork = plans.filter((plan) => (plan.workout_blocks?.length ?? 0) > 0).length
  return {
    daysWithWork,
    blockCount,
    structureKind: (program.program_structure_type || 'weekly') as 'weekly' | 'cycle',
    hasPhases: (program.program_phases?.length ?? 0) > 0,
    lastActivityIso: program.updated_at || program.created_at,
  }
}

export function matchesProgram(program: ProgramItem, filters: ProgramFilters): boolean {
  const query = filters.search.trim().toLowerCase()
  const stats = getProgramStats(program)
  const matchesSearch =
    !query ||
    program.name.toLowerCase().includes(query) ||
    (program.client?.full_name?.toLowerCase().includes(query) ?? false) ||
    firstExerciseNames(program).some((name) => name.toLowerCase().includes(query))

  const matchesType =
    filters.filterType === 'templates'
      ? !program.client_id
      : filters.filterType === 'assigned'
        ? !!program.client_id && !!program.is_active
        : true
  const matchesStatus =
    filters.filterStatus === 'all'
      ? true
      : filters.filterStatus === 'active'
        ? !!program.client_id && !!program.is_active
        : !!program.client_id && !program.is_active
  const matchesStructure = filters.filterStructure === 'all' || stats.structureKind === filters.filterStructure
  const matchesPhases =
    filters.filterPhases === 'all'
      ? true
      : filters.filterPhases === 'with'
        ? stats.hasPhases
        : !stats.hasPhases

  return matchesSearch && matchesType && matchesStatus && matchesStructure && matchesPhases
}

export function buildLibraryStats(programs: ProgramItem[], clients: ClientLite[]): LibraryStats {
  const templates = programs.filter((p) => !p.client_id).length
  const active = programs.filter((p) => p.client_id && p.is_active).length
  const noProgram = clients.filter((c) => !((c.workout_programs ?? []).some((p) => p.is_active))).length
  return { templates, active, noProgram, total: programs.length }
}

export function sortedPlans(program: ProgramItem): ProgramPlan[] {
  return [...(program.workout_plans ?? [])].sort((a, b) => (a.day_of_week ?? 99) - (b.day_of_week ?? 99))
}

export function sortedBlocks(plan: ProgramPlan): ProgramBlock[] {
  return [...(plan.workout_blocks ?? [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
}

export function firstExerciseNames(program: ProgramItem): string[] {
  const seen = new Set<string>()
  for (const plan of sortedPlans(program)) {
    for (const block of sortedBlocks(plan)) {
      const name = block.exercise?.name?.trim()
      if (name) seen.add(name)
      if (seen.size >= 4) return [...seen]
    }
  }
  return [...seen]
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'EV'
}

export function dayLabel(day: number | null): string {
  if (!day) return 'D'
  return DAY_LABELS[day] ?? `D${day}`
}

export function defaultDuplicateName(program: ProgramItem): string {
  if (program.client?.full_name) return `Copia de ${program.client.full_name}`
  return `${program.name} (Copia)`
}
