import { describe, expect, it } from 'vitest'
import {
  SUCCESS_OVERLAY_MIN_MS,
  SUCCESS_OVERLAY_MS,
  SUCCESS_OVERLAY_REDUCED_MS,
  programSavedOverlay,
  successOverlayPlan,
} from '../../apps/mobile/lib/success-overlay'

describe('successOverlayPlan', () => {
  it('sin duracion explicita usa la ventana fugaz por defecto (~1,4 s) con confeti y spring', () => {
    expect(successOverlayPlan({ reduced: false })).toEqual({
      visibleMs: SUCCESS_OVERLAY_MS,
      confetti: true,
      entrance: 'spring',
      haptic: true,
    })
  })

  it('respeta una duracion explicita mas larga', () => {
    expect(successOverlayPlan({ durationMs: 2600, reduced: false }).visibleMs).toBe(2600)
  })

  it('nunca baja del piso legible: una duracion diminuta se sube al minimo', () => {
    expect(successOverlayPlan({ durationMs: 120, reduced: false }).visibleMs).toBe(SUCCESS_OVERLAY_MIN_MS)
  })

  it('duraciones invalidas caen al default en vez de cerrar el overlay en el mismo frame', () => {
    for (const bad of [0, -400, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(successOverlayPlan({ durationMs: bad, reduced: false }).visibleMs).toBe(SUCCESS_OVERLAY_MS)
    }
  })

  it('reduce-motion apaga confeti y spring, y estira la ventana para poder leerla', () => {
    const plan = successOverlayPlan({ reduced: true })
    expect(plan).toEqual({
      visibleMs: SUCCESS_OVERLAY_REDUCED_MS,
      confetti: false,
      entrance: 'none',
      haptic: true,
    })
    // Reduce-motion es un PISO, no un tope: una ventana ya larga se conserva.
    expect(successOverlayPlan({ durationMs: 4000, reduced: true }).visibleMs).toBe(4000)
  })

  it('durationMs null = pantalla terminal: sin timer y sin haptico (la cierra el usuario)', () => {
    expect(successOverlayPlan({ durationMs: null, reduced: false })).toEqual({
      visibleMs: null,
      confetti: true,
      entrance: 'spring',
      haptic: false,
    })
    expect(successOverlayPlan({ durationMs: null, reduced: true })).toEqual({
      visibleMs: null,
      confetti: false,
      entrance: 'none',
      haptic: false,
    })
  })
})

describe('programSavedOverlay', () => {
  it('plan de un alumno: dice el programa Y de quien es', () => {
    expect(programSavedOverlay({ programName: 'Fuerza 4 dias', clientName: 'Jocelyn' })).toEqual({
      title: 'Plan guardado',
      subtitle: '«Fuerza 4 dias» ya está en el plan de Jocelyn.',
    })
  })

  it('recorta los espacios del nombre y del alumno', () => {
    expect(programSavedOverlay({ programName: '  Hipertrofia  ', clientName: '  Ivan  ' }).subtitle).toBe(
      '«Hipertrofia» ya está en el plan de Ivan.',
    )
  })

  it('sin alumno (plan suelto) no inventa destinatario', () => {
    expect(programSavedOverlay({ programName: 'Programa principal' })).toEqual({
      title: 'Plan guardado',
      subtitle: '«Programa principal» quedó guardado.',
    })
    expect(programSavedOverlay({ programName: 'Programa principal', clientName: '   ' }).subtitle).toBe(
      '«Programa principal» quedó guardado.',
    )
  })

  it('plantilla: otro titulo y jamas nombra a un alumno', () => {
    expect(programSavedOverlay({ programName: 'Full body', clientName: 'Jocelyn', isTemplate: true })).toEqual({
      title: 'Plantilla guardada',
      subtitle: '«Full body» quedó lista para asignar.',
    })
  })

  it('sin nombre no deja comillas vacias', () => {
    expect(programSavedOverlay({}).subtitle).toBe('El programa quedó guardado.')
    expect(programSavedOverlay({ isTemplate: true }).subtitle).toBe('La plantilla quedó lista para asignar.')
  })
})
