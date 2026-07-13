import { describe, expect, it } from 'vitest'
import {
  activeSwapRollbackPlan,
  restorableProgramMetadata,
  resolveProgramScheduleMetadata,
  shouldAutosaveProgramDraft,
  programPlanTitle,
  withoutProgramActive,
  canAssignProgramToClients,
  assertClientProgramNameUnchanged,
  CLIENT_PROGRAM_NAME_IMMUTABLE_ERROR,
  duplicateTemplateNameError,
  EMPTY_TEMPLATE_ASSIGNMENT_ERROR,
  filterTemplatePlansForAssignment,
  normalizeAssignmentWeeks,
  persistedPlanGroupName,
  UNMATCHED_TEMPLATE_DAYS_ERROR,
} from '../apps/mobile/lib/program-persistence'

describe('mobile program persistence compensation', () => {
  it('restaura exactamente metadata disponible sin identidad ni columnas legacy inventadas', () => {
    expect(restorableProgramMetadata({
      id: 'program-1',
      updated_at: '2026-07-13T00:00:00Z',
      name: 'Anterior',
      cycle_length: null,
      is_active: true,
      program_notes: null,
      start_date: '2026-07-01',
      end_date: '2026-07-28',
      source_template_id: 'template-1',
      last_edited_by_coach_id: 'coach-previous',
    })).toEqual({
      name: 'Anterior',
      cycle_length: null,
      is_active: true,
      program_notes: null,
      start_date: '2026-07-01',
      end_date: '2026-07-28',
      source_template_id: 'template-1',
      last_edited_by_coach_id: 'coach-previous',
    })
  })

  it('rollback reactiva el snapshot y revierte un target antes inactivo', () => {
    expect(activeSwapRollbackPlan({
      targetProgramId: 'target',
      targetWasActive: false,
      previousActiveIds: ['old-1'],
      deactivatedIds: ['old-1', 'concurrent'],
    })).toEqual({
      targetActive: false,
      reactivateIds: ['old-1', 'concurrent'],
    })
  })

  it('rollback conserva activo un target que ya lo estaba y deduplica ids', () => {
    expect(activeSwapRollbackPlan({
      targetProgramId: 'target',
      targetWasActive: true,
      previousActiveIds: ['target', 'old-1'],
      deactivatedIds: ['old-1'],
    })).toEqual({ targetActive: true, reactivateIds: ['old-1'] })
  })

  it('autosave exige una generacion editada, dirty y posterior a la ya persistida', () => {
    const ready = {
      hydrated: true,
      trackingReady: true,
      dirty: true,
      editGeneration: 2,
      autosavedEditGeneration: 1,
      hasPendingDraft: false,
      hasDraftKey: true,
    }
    expect(shouldAutosaveProgramDraft(ready)).toBe(true)
    expect(shouldAutosaveProgramDraft({ ...ready, dirty: false })).toBe(false)
    expect(shouldAutosaveProgramDraft({ ...ready, editGeneration: 1 })).toBe(false)
    expect(shouldAutosaveProgramDraft({ ...ready, hasPendingDraft: true })).toBe(false)
  })

  it('conserva el ancla flexible existente y calcula fin inclusivo por semanas', () => {
    expect(resolveProgramScheduleMetadata({
      isClientProgram: true,
      requestedStartDate: null,
      existingStartDate: '2026-07-01',
      todaySantiagoIso: '2026-07-13',
      weeksToRepeat: 4,
    })).toEqual({ startDate: '2026-07-01', endDate: '2026-07-28' })
  })

  it('usa fecha explicita o hoy Santiago y deja plantillas sin calendario', () => {
    expect(resolveProgramScheduleMetadata({
      isClientProgram: true,
      requestedStartDate: '2026-08-10',
      existingStartDate: '2026-07-01',
      todaySantiagoIso: '2026-07-13',
      weeksToRepeat: 1,
    })).toEqual({ startDate: '2026-08-10', endDate: '2026-08-16' })
    expect(resolveProgramScheduleMetadata({
      isClientProgram: true,
      requestedStartDate: null,
      existingStartDate: null,
      todaySantiagoIso: '2026-07-13',
      weeksToRepeat: 1,
    })).toEqual({ startDate: '2026-07-13', endDate: '2026-07-19' })
    expect(resolveProgramScheduleMetadata({
      isClientProgram: false,
      requestedStartDate: '2026-08-10',
      existingStartDate: '2026-07-01',
      todaySantiagoIso: '2026-07-13',
      weeksToRepeat: 8,
    })).toEqual({ startDate: null, endDate: null })
  })

  it('omite is_active de writes de plantilla y replica el fallback de título web', () => {
    expect(withoutProgramActive({ name: 'Plantilla', is_active: false, last_edited_by_coach_id: 'coach-1' })).toEqual({
      name: 'Plantilla',
      last_edited_by_coach_id: 'coach-1',
    })
    expect(programPlanTitle('Hipertrofia', 2, '')).toBe('Hipertrofia - Día 2')
    expect(programPlanTitle('Hipertrofia', 2, 'Piernas')).toBe('Piernas')
  })

  it('solo permite asignar una plantilla ya persistida', () => {
    expect(canAssignProgramToClients({ isTemplate: true, programId: 'template-1' })).toBe(true)
    expect(canAssignProgramToClients({ isTemplate: true, programId: null })).toBe(false)
    expect(canAssignProgramToClients({ isTemplate: false, programId: 'client-program' })).toBe(false)
  })

  it('bloquea el cambio de nombre de un programa de alumno con el copy web exacto', () => {
    expect(() => assertClientProgramNameUnchanged({
      clientId: 'client-1',
      existingName: 'Programa original',
      requestedName: 'Programa nuevo',
    })).toThrow(CLIENT_PROGRAM_NAME_IMMUTABLE_ERROR)
    expect(() => assertClientProgramNameUnchanged({
      clientId: 'client-1',
      existingName: 'Programa original',
      requestedName: 'Programa original',
    })).not.toThrow()
    expect(duplicateTemplateNameError('Fuerza')).toBe('Ya tienes una plantilla guardada con el nombre "Fuerza".')
  })

  it('normaliza semanas y filtra días de asignación igual que web', () => {
    const plans = [{ id: 'a1', day_of_week: 1 }, { id: 'b1', day_of_week: 1 }, { id: 'a3', day_of_week: 3 }]
    expect(normalizeAssignmentWeeks(99, 4)).toBe(52)
    expect(normalizeAssignmentWeeks(0, 4)).toBe(4)
    expect(filterTemplatePlansForAssignment(plans, [])).toEqual(plans)
    expect(filterTemplatePlansForAssignment(plans, [1])).toEqual(plans.slice(0, 2))
    expect(() => filterTemplatePlansForAssignment([], [])).toThrow(EMPTY_TEMPLATE_ASSIGNMENT_ERROR)
    expect(() => filterTemplatePlansForAssignment(plans, [2])).toThrow(UNMATCHED_TEMPLATE_DAYS_ERROR)
  })

  it('preserva group_name persistido, incluso null, y usa fallback solo si no existe', () => {
    expect(persistedPlanGroupName({ group_name: 'Bloque verano' })).toBe('Bloque verano')
    expect(persistedPlanGroupName({ group_name: null })).toBeNull()
    expect(persistedPlanGroupName({})).toBe('Programa de Entrenamiento')
  })
})
