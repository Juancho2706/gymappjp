/**
 * Inicio flexible del programa en RN (spec `docs/specs/ciclo-real-y-por-lado`, W3.3b — espejo de W2.1).
 *
 * Fija las tres reglas que el builder no puede romper sin que se note:
 *   · R21 — programa NUEVO con el flag ⇒ `{ startDate: null, endDate: null }` (ni inicio ni fin: el
 *     fin solo se fija cuando se fija el inicio). Ese es el `programState: 'not_started'` que el motor
 *     traduce a «Empezar hoy».
 *   · R2  — sin el flag (o con `null`: asi llegan los programas de siempre) el comportamiento es el
 *     HISTORICO: la fecha de hoy en Santiago.
 *   · Los ~50 programas activos que YA tienen fecha con el flag en `true` la conservan al re-guardar;
 *     vaciarla los habria dejado sin calendario.
 */
import { describe, expect, it } from 'vitest'
import { resolveProgramScheduleMetadata } from '../../apps/mobile/lib/program-persistence'

const HOY = '2026-09-03'

describe('resolveProgramScheduleMetadata — inicio flexible (R2/R13/R21)', () => {
  it('programa NUEVO y flexible: sin start_date y sin end_date', () => {
    expect(resolveProgramScheduleMetadata({
      isClientProgram: true,
      requestedStartDate: null,
      existingStartDate: null,
      todaySantiagoIso: HOY,
      weeksToRepeat: 4,
      startDateFlexible: true,
    })).toEqual({ startDate: null, endDate: null })
  })

  it('programa NUEVO no flexible: sigue estampando HOY (Santiago) y su fin inclusivo', () => {
    expect(resolveProgramScheduleMetadata({
      isClientProgram: true,
      requestedStartDate: null,
      existingStartDate: null,
      todaySantiagoIso: HOY,
      weeksToRepeat: 4,
      startDateFlexible: false,
    })).toEqual({ startDate: HOY, endDate: '2026-09-30' })
  })

  it('el default del flag es `false`: omitirlo no cambia el comportamiento historico', () => {
    const historico = { startDate: HOY, endDate: '2026-09-09' }
    expect(resolveProgramScheduleMetadata({
      isClientProgram: true,
      requestedStartDate: null,
      existingStartDate: null,
      todaySantiagoIso: HOY,
      weeksToRepeat: 1,
    })).toEqual(historico)
    expect(resolveProgramScheduleMetadata({
      isClientProgram: true,
      requestedStartDate: null,
      existingStartDate: null,
      todaySantiagoIso: HOY,
      weeksToRepeat: 1,
      startDateFlexible: null,
    })).toEqual(historico)
  })

  it('programa EXISTENTE con fecha: re-guardar la deja intacta, flexible o no', () => {
    const guardada = {
      isClientProgram: true as const,
      requestedStartDate: null,
      existingStartDate: '2026-07-01',
      todaySantiagoIso: HOY,
      weeksToRepeat: 4,
    }
    expect(resolveProgramScheduleMetadata({ ...guardada, startDateFlexible: true }))
      .toEqual({ startDate: '2026-07-01', endDate: '2026-07-28' })
    expect(resolveProgramScheduleMetadata({ ...guardada, startDateFlexible: false }))
      .toEqual({ startDate: '2026-07-01', endDate: '2026-07-28' })
  })

  it('una fecha PEDIDA explicitamente gana aunque el programa sea flexible', () => {
    expect(resolveProgramScheduleMetadata({
      isClientProgram: true,
      requestedStartDate: '2026-09-07',
      existingStartDate: null,
      todaySantiagoIso: HOY,
      weeksToRepeat: 2,
      startDateFlexible: true,
    })).toEqual({ startDate: '2026-09-07', endDate: '2026-09-20' })
  })

  it('una PLANTILLA (no es programa de alumno) sigue sin calendario, con o sin flag', () => {
    expect(resolveProgramScheduleMetadata({
      isClientProgram: false,
      requestedStartDate: '2026-09-07',
      existingStartDate: '2026-07-01',
      todaySantiagoIso: HOY,
      weeksToRepeat: 8,
      startDateFlexible: true,
    })).toEqual({ startDate: null, endDate: null })
  })
})
