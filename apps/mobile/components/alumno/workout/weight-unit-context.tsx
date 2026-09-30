/**
 * Unidad de peso por EJERCICIO del ejecutor RN (tren kg-lb-ejecutor, docs/specs/kg-lb-ejecutor, R1/D2).
 * Espejo de `apps/web/.../workout/[planId]/weight-unit-context.tsx`.
 *
 * Una sola fuente por sesión: la fila activa (`ActiveSetRow`), la rueda, el teclado de edición
 * (`KeypadHost`) y las lecturas de un mismo ejercicio (objetivo, «Anterior», línea de serie, récord) leen
 * la MISMA unidad, y cambiarla en un lugar la cambia en todos. Arranca en `resolveInitialWeightUnit` (la
 * última que usó el alumno en ese ejercicio → la que prescribió el coach en el bloque → kg); el cambio vive
 * en memoria y se persiste solo al registrar (`workout_logs.weight_unit`), que es lo que la próxima sesión
 * vuelve a leer.
 *
 * Sin provider (tests, superficies fuera del ejecutor) los hooks devuelven `kg` y `active: false` ⇒ la
 * fila se comporta byte-idéntica a antes del tren: no convierte ni manda `weight_unit`.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import {
  convertTypedWeight,
  formatWeightEsCl,
  normalizeWeightUnit,
  parseWeightEsCl,
  resolveInitialWeightUnit,
  suggestedWeightInUnit,
  weightFromKg,
  type WeightUnit,
} from '@eva/workout-engine'

/** Lo que el provider necesita saber de cada bloque de fuerza del plan. */
export interface BlockWeightUnitInfo {
  /** Ejercicio EFECTIVO del bloque (el sustituto si hay sustitución): la unidad es por ejercicio. */
  exerciseKey: string
  /** `workout_blocks.load_unit` prescrito por el coach (`kg` | `lb` | `sec` | null). */
  loadUnit: string | null
}

export interface WeightUnitContextValue {
  unitForBlock: (blockId: string) => WeightUnit
  setUnitForBlock: (blockId: string, unit: WeightUnit) => void
}

const WeightUnitContext = createContext<WeightUnitContextValue | null>(null)

/**
 * Estado + resolución de la unidad por bloque. Vive en `ExecutorV3` (y no dentro del provider) porque
 * ese componente también PINTA pesos —teclado de edición, línea «Serie N» del descanso, récord— y un
 * componente no puede leer el contexto que él mismo provee.
 */
export function useWeightUnitState({
  blocks,
  lastUnitByExercise,
  onToggle,
}: {
  /** blockId → ejercicio efectivo + unidad del bloque. */
  blocks: Record<string, BlockWeightUnitInfo>
  /** exerciseKey → última unidad registrada (hoy primero, si no el historial). */
  lastUnitByExercise: Record<string, string>
  /**
   * Un cambio REAL del alumno (from ≠ to), para la analítica `weight_unit_toggled` (SPEC §6). Llega por
   * callback y no con un import de `lib/analytics` a propósito: este módulo lo cargan el `KeypadHost` y
   * la fila, que los tests montan con el grafo nativo doblado (PostHog/Expo no existen ahí).
   */
  onToggle?: (from: WeightUnit, to: WeightUnit) => void
}): WeightUnitContextValue {
  // Elección del alumno EN ESTA SESIÓN, por ejercicio. Gana sobre todo lo demás.
  const [chosen, setChosen] = useState<Record<string, WeightUnit>>({})

  const unitForBlock = useCallback(
    (blockId: string): WeightUnit => {
      const info = blocks[blockId]
      if (!info) return 'kg'
      return (
        chosen[info.exerciseKey] ??
        resolveInitialWeightUnit({ lastUsed: lastUnitByExercise[info.exerciseKey], blockUnit: info.loadUnit })
      )
    },
    [blocks, chosen, lastUnitByExercise],
  )

  const setUnitForBlock = useCallback(
    (blockId: string, unit: WeightUnit) => {
      const info = blocks[blockId]
      if (!info) return
      const from = unitForBlock(blockId)
      if (from === unit) return
      setChosen((prev) => ({ ...prev, [info.exerciseKey]: unit }))
      onToggle?.(from, unit)
    },
    [blocks, unitForBlock, onToggle],
  )

  return useMemo(() => ({ unitForBlock, setUnitForBlock }), [unitForBlock, setUnitForBlock])
}

/** Reparte a las filas y pantallas el valor que arma `useWeightUnitState`. */
export function WeightUnitProvider({ value, children }: { value: WeightUnitContextValue; children: ReactNode }) {
  return <WeightUnitContext.Provider value={value}>{children}</WeightUnitContext.Provider>
}

/**
 * Unidad del bloque + setter. `active` = hay provider (ejecutor real): solo entonces la fila convierte
 * y manda `weight_unit`. Sin provider ⇒ `kg` y no-op (comportamiento previo al tren).
 */
export function useBlockWeightUnit(blockId: string): {
  unit: WeightUnit
  setUnit: (unit: WeightUnit) => void
  active: boolean
} {
  const ctx = useContext(WeightUnitContext)
  const setUnit = useCallback((unit: WeightUnit) => ctx?.setUnitForBlock(blockId, unit), [ctx, blockId])
  if (!ctx) return { unit: 'kg', setUnit, active: false }
  return { unit: ctx.unitForBlock(blockId), setUnit, active: true }
}

/**
 * Lookup de unidad por bloque para superficies que pintan VARIOS ejercicios en un mismo componente
 * (superserie, filas logueadas): no se puede llamar un hook por miembro. Sin provider ⇒ siempre `kg`.
 */
export function useWeightUnitLookup(): (blockId: string) => WeightUnit {
  const ctx = useContext(WeightUnitContext)
  return useCallback((blockId: string) => (ctx ? ctx.unitForBlock(blockId) : 'kg'), [ctx])
}

/**
 * Kilos (log / «Anterior» / récord) → número para una lectura en `unit`. En kg devuelve el número TAL
 * CUAL, idéntico a como se pintaba antes del tren; en lb, es-CL a un decimal.
 */
export function weightNum(kg: number, unit: WeightUnit): number | string {
  return unit === 'lb' ? formatWeightEsCl(weightFromKg(kg, 'lb')) : kg
}

/** Igual que `weightNum` para una SUGERENCIA (objetivo/progresión): en lb se redondea al 2,5. */
export function suggestionNum(kg: number, unit: WeightUnit): number | string {
  return unit === 'lb' ? formatWeightEsCl(suggestedWeightInUnit(kg, 'lb')) : kg
}

/**
 * Clave que marca en los VALORES tecleados (`Record<string, string>` de la fila / el teclado, que viajan
 * al borrador) en qué unidad está escrito `values.weight`. Ausente ⇒ kilos: así llegan las semillas
 * armadas desde un log o desde el día repetido, y los borradores anteriores al tren. Los builders del
 * payload leen claves con nombre y la ignoran.
 */
export const WEIGHT_UNIT_VALUE_KEY = 'wu'

/**
 * Deja `values.weight` escrito en `unit`: si la marca `wu` dice otra unidad (o no está ⇒ kg), convierte
 * el número (R1: cambiar la unidad no borra lo tecleado, lo convierte) y actualiza la marca. En kg y sin
 * marca devuelve el MISMO objeto: el camino previo al tren queda byte-idéntico.
 */
export function valuesInWeightUnit<T extends Record<string, string> | null | undefined>(values: T, unit: WeightUnit): T {
  if (!values) return values
  const from = normalizeWeightUnit(values[WEIGHT_UNIT_VALUE_KEY])
  if (from === unit) {
    return unit === 'kg' || values[WEIGHT_UNIT_VALUE_KEY] === unit
      ? values
      : ({ ...values, [WEIGHT_UNIT_VALUE_KEY]: unit } as T)
  }
  const n = parseWeightEsCl(values.weight)
  return {
    ...values,
    ...(n != null ? { weight: formatWeightEsCl(convertTypedWeight(n, from, unit)) } : {}),
    [WEIGHT_UNIT_VALUE_KEY]: unit,
  } as T
}
