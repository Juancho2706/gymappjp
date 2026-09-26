'use client'

/**
 * Unidad de peso por EJERCICIO del ejecutor (tren kg-lb-ejecutor, docs/specs/kg-lb-ejecutor, R1/D2).
 *
 * Una sola fuente por sesión: todas las filas (`LogSetForm`) y las lecturas de un mismo ejercicio
 * (objetivo, «Anterior», recap, celebración) leen la MISMA unidad, y cambiarla en una fila la cambia en
 * todas. Arranca en `resolveInitialWeightUnit` (la última que usó el alumno en ese ejercicio → la que
 * prescribió el coach en el bloque → kg); el cambio del alumno vive en memoria y se persiste solo al
 * registrar (columna `workout_logs.weight_unit`), que es lo que la próxima sesión vuelve a leer.
 *
 * Sin provider (tests, superficies fuera del ejecutor) el hook devuelve `kg` e `active: false` ⇒ la
 * fila se comporta byte-idéntica a antes del tren: no convierte ni manda `weight_unit`.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import {
    formatWeightEsCl,
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
 * Estado + resolución de la unidad por bloque. Vive en `WorkoutExecutionClient` (y no dentro del
 * provider) porque ese componente también PINTA pesos —recap colapsado, chips de progresión— y un
 * componente no puede leer el contexto que él mismo provee.
 */
export function useWeightUnitState({
    blocks,
    lastUnitByExercise,
}: {
    /** blockId → ejercicio efectivo + unidad del bloque. */
    blocks: Record<string, BlockWeightUnitInfo>
    /** exerciseKey → última unidad registrada (hoy primero, si no el historial). */
    lastUnitByExercise: Record<string, string>
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
            setChosen((prev) => (prev[info.exerciseKey] === unit ? prev : { ...prev, [info.exerciseKey]: unit }))
        },
        [blocks],
    )

    return useMemo(() => ({ unitForBlock, setUnitForBlock }), [unitForBlock, setUnitForBlock])
}

/** Reparte a las filas y pasos el valor que arma `useWeightUnitState`. */
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
 * (superserie, lista): no se puede llamar un hook por miembro. Sin provider ⇒ siempre `kg`.
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
