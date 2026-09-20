// Tarjeta «Salud» de la ficha del alumno (SPEC `docs/specs/vuelta-nueva-salud-y-reloj` §5, CA3.1 y
// CA3.2). Lo que se prueba acá es lo que el coach LEE sobre un dato sensible: qué se pinta, qué no
// se afirma y cuándo aparece la nota de ficha pendiente. Función pura: nada de relojes ni de red.
import { describe, expect, it } from 'vitest'

import {
  buildHealthIntakeView,
  HEALTH_INTAKE_LABELS,
  HEALTH_INTAKE_PENDING_NOTE,
  type HealthIntakeSource,
} from './health-intake'

/** Ficha completa: los tres campos del registro más lesiones y condiciones. */
function fichaCompleta(over: Partial<HealthIntakeSource> = {}): HealthIntakeSource {
  return {
    injuries: 'Hernia lumbar L4-L5 desde 2024',
    medical_conditions: 'Hipertensión controlada con enalapril',
    goals: 'Bajar grasa y volver a correr',
    experience_level: 'Intermedio',
    availability: '4 días por semana, en la tarde',
    updated_at: '2026-09-12T15:33:00.000Z',
    ...over,
  }
}

describe('buildHealthIntakeView — contenido y rótulos canónicos', () => {
  it('ficha completa: los cinco rótulos en orden, el texto entero y el pie de fecha', () => {
    const view = buildHealthIntakeView(fichaCompleta())
    expect(view.isEmpty).toBe(false)
    expect(view.rows.map((r) => r.key)).toEqual([
      'injuries',
      'medical_conditions',
      'goals',
      'experience_level',
      'availability',
    ])
    expect(view.rows.map((r) => r.label)).toEqual([
      'Lesiones o limitaciones',
      'Condiciones médicas',
      'Objetivo',
      'Experiencia',
      'Disponibilidad',
    ])
    expect(view.rows.every((r) => r.isEmpty === false)).toBe(true)
    expect(view.updatedLabel).toBe('Actualizado el 12 sept')
    // Ficha inicial completa ⇒ sin nota al pie.
    expect(view.pendingIntakeNote).toBeNull()
  })

  it('los rótulos son los del contrato y nadie los reescribe por su cuenta', () => {
    expect(HEALTH_INTAKE_LABELS).toEqual({
      injuries: 'Lesiones o limitaciones',
      medical_conditions: 'Condiciones médicas',
      goals: 'Objetivo',
      experience_level: 'Experiencia',
      availability: 'Disponibilidad',
    })
  })

  it('sin «ver más»: el texto largo viaja COMPLETO, sin recortes ni puntos suspensivos', () => {
    const largo = `Lesión de manguito rotador derecho. ${'Evitar press militar y dominadas. '.repeat(20)}`
    const view = buildHealthIntakeView(fichaCompleta({ injuries: largo }))
    expect(view.rows[0]?.value).toBe(largo.trim())
    expect(view.rows[0]?.value).not.toContain('…')
    expect(view.rows[0]?.value.length).toBeGreaterThan(500)
  })

  it('sin autoría: la vista no expone quién escribió, porque `client_intake` no lo guarda', () => {
    const view = buildHealthIntakeView(fichaCompleta())
    const claves = new Set(view.rows.flatMap((r) => Object.keys(r)))
    expect(claves).toEqual(new Set(['key', 'label', 'value', 'isEmpty']))
    expect(Object.keys(view).sort()).toEqual(['isEmpty', 'pendingIntakeNote', 'rows', 'updatedLabel'])
  })
})

describe('buildHealthIntakeView — campos vacíos vs. ficha sin completar (CA3.2)', () => {
  it('campo de salud vacío: «Sin … informadas», no la desaparición de la fila', () => {
    const view = buildHealthIntakeView(fichaCompleta({ injuries: '', medical_conditions: null }))
    expect(view.rows[0]).toEqual({
      key: 'injuries',
      label: 'Lesiones o limitaciones',
      value: 'Sin lesiones informadas',
      isEmpty: true,
    })
    expect(view.rows[1]).toEqual({
      key: 'medical_conditions',
      label: 'Condiciones médicas',
      value: 'Sin condiciones médicas informadas',
      isEmpty: true,
    })
  })

  it('lesiones cargadas por el coach sobre una ficha incompleta: SE VEN, con la nota al pie', () => {
    // El coach escribe lesiones desde «Editar datos» y deja las tres columnas del registro en ''.
    // Esconderlas sería afirmar algo falso sobre un dato de salud (SPEC §5, regla invertida).
    const view = buildHealthIntakeView({
      injuries: 'Tendinitis rotuliana izquierda',
      medical_conditions: '',
      goals: '',
      experience_level: '',
      availability: '',
      updated_at: '2026-09-12T15:33:00.000Z',
    })
    expect(view.isEmpty).toBe(false)
    expect(view.rows.map((r) => r.key)).toEqual(['injuries', 'medical_conditions'])
    expect(view.rows[0]?.value).toBe('Tendinitis rotuliana izquierda')
    expect(view.updatedLabel).toBe('Actualizado el 12 sept')
    expect(view.pendingIntakeNote).toBe(HEALTH_INTAKE_PENDING_NOTE)
  })

  it('sólo condiciones médicas sobre una ficha incompleta: mismo trato que las lesiones', () => {
    const view = buildHealthIntakeView({
      injuries: null,
      medical_conditions: 'Asma inducida por ejercicio',
      goals: '',
      experience_level: '',
      availability: '',
      updated_at: '2026-09-12',
    })
    expect(view.isEmpty).toBe(false)
    expect(view.rows[1]?.value).toBe('Asma inducida por ejercicio')
    expect(view.rows[0]?.value).toBe('Sin lesiones informadas')
    expect(view.pendingIntakeNote).toBe(HEALTH_INTAKE_PENDING_NOTE)
  })

  it('los CINCO campos vacíos: sólo la nota al pie, sin filas y sin pie de fecha', () => {
    const placeholder = buildHealthIntakeView({
      injuries: null,
      medical_conditions: null,
      goals: '',
      experience_level: '',
      availability: '',
      updated_at: '2026-09-12T15:33:00.000Z',
    })
    expect(placeholder.isEmpty).toBe(true)
    expect(placeholder.rows).toEqual([])
    // No se fecha nada que nadie escribió: el `updated_at` del INSERT placeholder es del coach.
    expect(placeholder.updatedLabel).toBeNull()
    expect(placeholder.pendingIntakeNote).toBe(HEALTH_INTAKE_PENDING_NOTE)
  })

  it('sin fila de intake (o con `null`/`undefined`): idéntico al placeholder', () => {
    const esperado = {
      isEmpty: true,
      rows: [],
      updatedLabel: null,
      pendingIntakeNote: HEALTH_INTAKE_PENDING_NOTE,
    }
    expect(buildHealthIntakeView(null)).toEqual(esperado)
    expect(buildHealthIntakeView(undefined)).toEqual(esperado)
    expect(buildHealthIntakeView({})).toEqual(esperado)
  })

  it('espacios en blanco cuentan como vacío (el textarea del modal deja "   ")', () => {
    const view = buildHealthIntakeView({
      injuries: '   ',
      medical_conditions: '\n ',
      goals: ' ',
      experience_level: '',
      availability: '  ',
    })
    expect(view.isEmpty).toBe(true)
  })

  it('ficha del alumno completa pero sin lesiones: las tres filas del registro y sin nota', () => {
    const view = buildHealthIntakeView(fichaCompleta({ injuries: '', medical_conditions: '' }))
    expect(view.pendingIntakeNote).toBeNull()
    expect(view.rows.map((r) => r.isEmpty)).toEqual([true, true, false, false, false])
  })
})

describe('buildHealthIntakeView — pie «Actualizado el {12 sept}»', () => {
  it('el día es el de SANTIAGO, no el prefijo UTC del timestamptz', () => {
    // 2026-09-12T02:00Z son las 23:00 del 11 de septiembre en Chile (UTC-3 desde el 06-09).
    expect(buildHealthIntakeView(fichaCompleta({ updated_at: '2026-09-12T02:00:00.000Z' })).updatedLabel).toBe(
      'Actualizado el 11 sept'
    )
    expect(buildHealthIntakeView(fichaCompleta({ updated_at: '2026-09-12T15:33:00.000Z' })).updatedLabel).toBe(
      'Actualizado el 12 sept'
    )
  })

  it('acepta el `yyyy-mm-dd hh:mm:ss+00` de Postgres y el `yyyy-mm-dd` ya resuelto', () => {
    expect(buildHealthIntakeView(fichaCompleta({ updated_at: '2026-09-12 15:33:00+00' })).updatedLabel).toBe(
      'Actualizado el 12 sept'
    )
    expect(buildHealthIntakeView(fichaCompleta({ updated_at: '2026-09-12' })).updatedLabel).toBe(
      'Actualizado el 12 sept'
    )
  })

  it('la abreviatura del mes es la tabla fija («sept», nunca «sep» ni «sept.»)', () => {
    expect(buildHealthIntakeView(fichaCompleta({ updated_at: '2026-08-31T15:00:00.000Z' })).updatedLabel).toBe(
      'Actualizado el 31 ago'
    )
    expect(buildHealthIntakeView(fichaCompleta({ updated_at: '2026-01-02T15:00:00.000Z' })).updatedLabel).toBe(
      'Actualizado el 2 ene'
    )
  })

  it('sin `updated_at` o con basura: la tarjeta se pinta igual, sin pie inventado', () => {
    expect(buildHealthIntakeView(fichaCompleta({ updated_at: null })).updatedLabel).toBeNull()
    expect(buildHealthIntakeView(fichaCompleta({ updated_at: 'no-es-fecha' })).updatedLabel).toBeNull()
    expect(buildHealthIntakeView(fichaCompleta({ updated_at: null })).rows).toHaveLength(5)
  })
})

describe('buildHealthIntakeView — pura', () => {
  it('dos invocaciones con la misma entrada dan salidas idénticas', () => {
    const intake = fichaCompleta()
    expect(buildHealthIntakeView(intake)).toEqual(buildHealthIntakeView(intake))
  })

  it('no muta la fila que recibe', () => {
    const intake = fichaCompleta()
    const copia = { ...intake }
    buildHealthIntakeView(intake)
    expect(intake).toEqual(copia)
  })
})
