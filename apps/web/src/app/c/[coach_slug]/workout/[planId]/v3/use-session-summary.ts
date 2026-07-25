'use client'

import { useMemo } from 'react'
import { epleyOneRM } from '@/app/coach/clients/[clientId]/profileTrainingAnalytics'
import { compactDistance } from '@/lib/workout-exercise-type'
import {
    summarizeSessionByKind,
    type SummaryBlock,
    type SummaryLogLike,
    type SessionSummaryByKind,
} from '../session-summary'
import { muscleGroupsToRegionIntensity, MUSCLE_REGIONS } from '../muscle-map'

/**
 * Ejecutor V3 (E4.3) — derivación ÚNICA del resumen de sesión, extraída del `WorkoutSummaryOverlay`
 * (V2) para compartirla SIN drift con la pantalla Final V3 (`SessionCompleteV3`). Consolida en un solo
 * lugar la lógica sutil ya testeada: descomposición por tipo (`summarizeSessionByKind`), detección de
 * PR con el guard anti-récord-falso de bloques sustituidos, volumen por músculo y hero adaptativo.
 * Ambas superficies (V2 y V3) consumen esto → una sola verdad de negocio, dos presentaciones.
 */

export interface SessionSummaryInput {
    logs: SummaryLogLike[]
    blocks: SummaryBlock[]
    exerciseMaxes: Record<string, number>
    exerciseMaxDates?: Record<string, string>
    /** Bloques con sustitución activa: su peso NO cuenta para detectar PR en el slot prescrito. */
    substitutedBlockIds?: string[]
}

/** PR detectado en la sesión (peso superó el máximo histórico del ejercicio prescrito). */
export interface DetectedPR {
    exerciseName: string
    newWeightKg: number
    prevWeightKg: number
    /** ISO del día del máximo previo → "superaste tus X kg del 12 jun". null si no se conoce. */
    prevAchievedAt: string | null
    /** % de mejora sobre el máximo previo (redondeado a 1 decimal). */
    pct: number
    estimated1RM: number
}

export interface SessionSummaryDerived {
    session: SessionSummaryByKind
    /** Fuerza descompuesta por ejercicio (para "Por ejercicio"). */
    exerciseBreakdown: SessionSummaryByKind['strength']
    detectedPRs: DetectedPR[]
    /** Volumen de fuerza por músculo (kg) + % relativo, para las barras. */
    muscleGroupVolume: { group: string; vol: number; pct: number }[]
    /** ¿Alguna región del mapa muscular encendida (fuerza + movilidad/roller)? */
    hasMuscleMap: boolean
    hasNonStrength: boolean
    completedSets: number
    totalReps: number
    totalVolume: number
    /** 2º stat adaptativo del hero: volumen kg / distancia / series (según lo que hubo). */
    heroSecondary: { value: string; unit?: string; label: string }
}

export function useSessionSummary({
    logs,
    blocks,
    exerciseMaxes,
    exerciseMaxDates = {},
    substitutedBlockIds = [],
}: SessionSummaryInput): SessionSummaryDerived {
    const session = useMemo(
        () => summarizeSessionByKind(blocks, logs, substitutedBlockIds),
        [blocks, logs, substitutedBlockIds],
    )
    const exerciseBreakdown = session.strength

    const detectedPRs = useMemo<DetectedPR[]>(() => {
        return exerciseBreakdown
            .filter((ex) => {
                const historicMax = exerciseMaxes[ex.exerciseId]
                return historicMax != null && ex.maxWeight > historicMax
            })
            .map((ex) => {
                const setAtMax = ex.sets.reduce((best, cur) => {
                    const cw = cur.weight_kg ?? 0
                    const bw = best.weight_kg ?? 0
                    return cw > bw ? cur : best
                }, ex.sets[0])
                const repsAtMax = setAtMax?.reps_done ?? 1
                const prevKg = exerciseMaxes[ex.exerciseId]!
                const pct = prevKg > 0 ? Math.round(((ex.maxWeight - prevKg) / prevKg) * 1000) / 10 : 100
                return {
                    exerciseName: ex.name,
                    newWeightKg: ex.maxWeight,
                    prevWeightKg: prevKg,
                    prevAchievedAt: exerciseMaxDates[ex.exerciseId] ?? null,
                    pct,
                    estimated1RM: Math.round(epleyOneRM(ex.maxWeight, Math.max(1, repsAtMax)) * 10) / 10,
                }
            })
    }, [exerciseBreakdown, exerciseMaxes, exerciseMaxDates])

    const muscleGroupVolume = useMemo(() => {
        const maxV = session.strengthMuscleVolume[0]?.vol ?? 1
        return session.strengthMuscleVolume.map(({ group, vol }) => ({
            group,
            vol,
            pct: Math.round((vol / maxV) * 100),
        }))
    }, [session.strengthMuscleVolume])

    const hasMuscleMap = useMemo(() => {
        const intensity = muscleGroupsToRegionIntensity(session.muscleWork)
        return MUSCLE_REGIONS.some((r) => intensity[r] > 0)
    }, [session.muscleWork])

    const hasNonStrength = session.cardio.length > 0 || session.mobility.length > 0

    const completedSets = logs.length
    const totalReps = logs.reduce((acc, l) => acc + (l.reps_done || 0), 0)
    const totalVolume = logs.reduce((acc, l) => acc + (l.weight_kg || 0) * (l.reps_done || 0), 0)

    const heroSecondary =
        totalVolume > 0
            ? { value: String(Math.round(totalVolume)), unit: 'kg', label: 'Volumen total' }
            : session.totalCardioDistanceM > 0
                ? { value: compactDistance(session.totalCardioDistanceM, 'm'), unit: undefined, label: 'Distancia' }
                : { value: String(completedSets), unit: undefined, label: completedSets === 1 ? 'Serie' : 'Series' }

    return {
        session,
        exerciseBreakdown,
        detectedPRs,
        muscleGroupVolume,
        hasMuscleMap,
        hasNonStrength,
        completedSets,
        totalReps,
        totalVolume,
        heroSecondary,
    }
}
