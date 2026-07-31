// Exclusión mutua de los params de fecha del ejecutor RN (`/alumno/workout/[planId]`) y los params del
// "Revisar y editar" del sheet de doble intención. Espejo de la web: `page.tsx:32-41` (fecha gana sobre
// repetir; `?fecha=<hoy>` se normaliza a null) y `buildWorkoutDoneEditHref`
// (`apps/web/src/lib/workout/executor-recovery.ts:77-87`).
//
// El helper RN es PURO (sólo importa `@eva/workout-engine`), así que se importa directo — no necesita el
// patrón de `vi.doMock` + import dinámico que exigen los módulos mobile que arrastran react-native.
import { describe, expect, it } from 'vitest'
import {
  buildWorkoutDoneEditParams,
  resolveExecutorDateParams,
} from '../apps/mobile/lib/workout-executor-nav'

const TODAY = '2026-07-22'

describe('resolveExecutorDateParams — exclusión fecha/repetir (espejo page.tsx:32-41)', () => {
  it('una `fecha` pasada válida activa el modo edición', () => {
    expect(resolveExecutorDateParams({ fecha: '2026-07-20' }, TODAY)).toEqual({
      editDate: '2026-07-20',
      repeatDate: null,
    })
  })

  it('una `fecha` pasada válida ANULA `repetir` (gana la edición)', () => {
    expect(resolveExecutorDateParams({ fecha: '2026-07-20', repetir: '2026-07-15' }, TODAY)).toEqual({
      editDate: '2026-07-20',
      repeatDate: null,
    })
  })

  it('`fecha` igual a HOY se IGNORA (fix 80995cae): ni edición ni bloqueo del upsert normal', () => {
    expect(resolveExecutorDateParams({ fecha: TODAY }, TODAY)).toEqual({
      editDate: null,
      repeatDate: null,
    })
  })

  it('`fecha` = HOY se ignora y `repetir` sigue vivo (la exclusión sólo aplica si hay edición real)', () => {
    expect(resolveExecutorDateParams({ fecha: TODAY, repetir: '2026-07-15' }, TODAY)).toEqual({
      editDate: null,
      repeatDate: '2026-07-15',
    })
  })

  it.each([
    ['futura', '2026-07-23'],
    ['formato inválido', '2026-7-20'],
    ['calendario inexistente', '2026-02-30'],
    ['texto', 'ayer'],
  ])('una `fecha` %s se ignora (abre como día normal)', (_label, fecha) => {
    expect(resolveExecutorDateParams({ fecha }, TODAY).editDate).toBeNull()
  })

  it('sin params abre como sesión normal', () => {
    expect(resolveExecutorDateParams({}, TODAY)).toEqual({ editDate: null, repeatDate: null })
  })

  it('`repetir` solo (sin fecha) sigue sembrando la sesión de hoy', () => {
    expect(resolveExecutorDateParams({ repetir: '2026-07-15' }, TODAY)).toEqual({
      editDate: null,
      repeatDate: '2026-07-15',
    })
  })

  it('`repetir` = HOY se descarta (pisaría la fila del día por el índice único)', () => {
    expect(resolveExecutorDateParams({ repetir: TODAY }, TODAY).repeatDate).toBeNull()
  })
})

describe('buildWorkoutDoneEditParams — espejo de buildWorkoutDoneEditHref', () => {
  it('sesión realmente pasada ⇒ `?fecha=` (modo solo-UPDATE de esa fecha)', () => {
    expect(buildWorkoutDoneEditParams('2026-07-20', TODAY)).toEqual({ fecha: '2026-07-20' })
  })

  it('sesión de HOY ⇒ `?desde=hecho`, JAMÁS `?fecha=<hoy>` (incidente 2026-07-26)', () => {
    expect(buildWorkoutDoneEditParams(TODAY, TODAY)).toEqual({ desde: 'hecho' })
  })

  it('celda de HOY manda aunque la sesión esté atribuida a otra fecha', () => {
    expect(buildWorkoutDoneEditParams('2026-07-20', TODAY, true)).toEqual({ desde: 'hecho' })
  })
})
