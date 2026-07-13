export type ProgramMetadataSnapshot = {
  id?: string
  updated_at?: string | null
  name?: string
  program_structure_type?: string
  duration_type?: string
  weeks_to_repeat?: number
  cycle_length?: number | null
  ab_mode?: boolean
  is_active?: boolean
  duration_days?: number | null
  program_notes?: string | null
  start_date?: string | null
  end_date?: string | null
  start_date_flexible?: boolean
  program_phases?: unknown
  source_template_id?: string | null
  last_edited_by_coach_id?: string | null
}

const RESTORABLE_METADATA_KEYS = [
  'name',
  'program_structure_type',
  'duration_type',
  'weeks_to_repeat',
  'cycle_length',
  'ab_mode',
  'is_active',
  'duration_days',
  'program_notes',
  'start_date',
  'end_date',
  'start_date_flexible',
  'program_phases',
  'source_template_id',
  'last_edited_by_coach_id',
] as const

/** Conserva solo columnas realmente leidas; el fallback legacy no inventa opcionales. */
export function restorableProgramMetadata(
  snapshot: ProgramMetadataSnapshot,
): Omit<ProgramMetadataSnapshot, 'id'> {
  const restored: Omit<ProgramMetadataSnapshot, 'id'> = {}
  for (const key of RESTORABLE_METADATA_KEYS) {
    if (Object.prototype.hasOwnProperty.call(snapshot, key)) {
      Object.assign(restored, { [key]: snapshot[key] })
    }
  }
  return restored
}

export function activeSwapRollbackPlan(input: {
  targetProgramId: string
  targetWasActive: boolean
  previousActiveIds: readonly string[]
  deactivatedIds: readonly string[]
}): { targetActive: boolean; reactivateIds: string[] } {
  return {
    targetActive: input.targetWasActive,
    reactivateIds: [...new Set([...input.previousActiveIds, ...input.deactivatedIds])]
      .filter((id) => id !== input.targetProgramId),
  }
}

export function shouldAutosaveProgramDraft(input: {
  hydrated: boolean
  trackingReady: boolean
  dirty: boolean
  editGeneration: number
  autosavedEditGeneration: number
  hasPendingDraft: boolean
  hasDraftKey: boolean
}): boolean {
  return input.hydrated
    && input.trackingReady
    && input.dirty
    && input.editGeneration > 0
    && input.editGeneration > input.autosavedEditGeneration
    && !input.hasPendingDraft
    && input.hasDraftKey
}

function addIsoCalendarDays(isoYmd: string, days: number): string {
  const [year, month, day] = isoYmd.split('-').map(Number)
  const instant = new Date(Date.UTC(year, month - 1, day + days, 12))
  return instant.toISOString().slice(0, 10)
}

export function resolveProgramScheduleMetadata(input: {
  isClientProgram: boolean
  requestedStartDate?: string | null
  existingStartDate?: string | null
  todaySantiagoIso: string
  weeksToRepeat: number
}): { startDate: string | null; endDate: string | null } {
  if (!input.isClientProgram) return { startDate: null, endDate: null }
  const requested = input.requestedStartDate?.trim() || null
  const existing = input.existingStartDate?.trim() || null
  const startDate = requested ?? existing ?? input.todaySantiagoIso
  return {
    startDate,
    endDate: addIsoCalendarDays(startDate, input.weeksToRepeat * 7 - 1),
  }
}

export function withoutProgramActive<T extends { is_active?: boolean }>(meta: T): Omit<T, 'is_active'> {
  const { is_active: _active, ...metadata } = meta
  void _active
  return metadata
}

export function programPlanTitle(programName: string, dayId: number, dayTitle?: string | null): string {
  return dayTitle || `${programName} - Día ${dayId}`
}

export function canAssignProgramToClients(input: { isTemplate: boolean; programId?: string | null }): boolean {
  return input.isTemplate && Boolean(input.programId)
}

export const CLIENT_PROGRAM_NAME_IMMUTABLE_ERROR = 'No se puede cambiar el nombre de un programa ya asignado a un alumno.'
export const EMPTY_TEMPLATE_ASSIGNMENT_ERROR = 'Esta plantilla no tiene días de entrenamiento para copiar.'
export const UNMATCHED_TEMPLATE_DAYS_ERROR = 'Los días seleccionados no coinciden con ningún día de esta plantilla. Quita la selección de días o elige otros.'

export function assertClientProgramNameUnchanged(input: {
  clientId?: string | null
  existingName?: string | null
  requestedName: string
}): void {
  if (input.clientId && input.existingName !== input.requestedName) {
    throw new Error(CLIENT_PROGRAM_NAME_IMMUTABLE_ERROR)
  }
}

export function duplicateTemplateNameError(programName: string): string {
  return `Ya tienes una plantilla guardada con el nombre "${programName}".`
}

export function normalizeAssignmentWeeks(requested: number | null | undefined, fallback: number): number {
  const value = requested || fallback
  return Math.max(1, Math.min(52, value))
}

export function filterTemplatePlansForAssignment<T extends { day_of_week: number }>(
  allPlans: readonly T[],
  selectedDays: readonly number[],
): T[] {
  if (allPlans.length === 0) throw new Error(EMPTY_TEMPLATE_ASSIGNMENT_ERROR)
  const selected = new Set(selectedDays.filter((day) => day >= 1 && day <= 28))
  const plans = selected.size === 0
    ? [...allPlans]
    : allPlans.filter((plan) => selected.has(plan.day_of_week))
  if (plans.length === 0) throw new Error(UNMATCHED_TEMPLATE_DAYS_ERROR)
  return plans
}

export function persistedPlanGroupName(day: { group_name?: string | null }): string | null {
  return Object.prototype.hasOwnProperty.call(day, 'group_name')
    ? (day.group_name ?? null)
    : 'Programa de Entrenamiento'
}
