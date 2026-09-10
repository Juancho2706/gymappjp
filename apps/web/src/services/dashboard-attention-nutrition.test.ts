import { describe, expect, it } from 'vitest'

/**
 * N8 (TASKS.md § A · Nutrición, A27) — carril A del tren «Señales honestas para el coach».
 *
 * Cubre A24b/R15/R18: el helper exportado `nutritionComplianceFromAdherence(perDay, summary)`
 * (nombre canónico, ver PLAN § Contratos de datos #6 y snippet «A23 — fix del servidor») decide
 * cuándo el alumno tiene un dato honesto de nutrición, y `calculateAttentionScore` (`:73`) ya
 * omite el término con `null` (R4.15) — este archivo prueba que ese camino sigue intacto.
 *
 * El engine `packages/nutrition-engine/adherence.ts` NO se toca; acá solo se ejercita el helper
 * del service con objetos planos que imitan la forma de `AdherenceDay`/`AdherenceSummary`.
 */

import {
    calculateAttentionScore,
    nutritionComplianceFromAdherence,
    NUTRITION_RISK_SCORE_POINTS,
    type ClientDataForAttention,
} from './dashboard.service'

/** Cliente base sin ninguna otra señal de riesgo, para aislar el término de nutrición. */
function baseClient(nutritionCompliance: number | null): ClientDataForAttention {
    return {
        lastCheckinDate: null,
        lastWorkoutDate: null,
        hasActiveWorkoutProgram: false,
        nutritionCompliance,
        planDaysRemaining: null,
        oneRMDelta: null,
    }
}

describe('calculateAttentionScore — término de nutrición (R4.15)', () => {
    it('nutritionCompliance: null => sin NUTRICION_RIESGO y sin los 20 puntos', () => {
        const { score, flags } = calculateAttentionScore(baseClient(null))

        expect(flags).not.toContain('NUTRICION_RIESGO')
        expect(score).toBe(0)
    })

    it('nutritionCompliance: 0 => flag NUTRICION_RIESGO y los 20 puntos', () => {
        const { score, flags } = calculateAttentionScore(baseClient(0))

        expect(flags).toContain('NUTRICION_RIESGO')
        expect(score).toBe(NUTRITION_RISK_SCORE_POINTS)
    })
})

describe('nutritionComplianceFromAdherence — helper canónico (A24b, R15, R18)', () => {
    it('ningún día del rango tuvo comidas aplicables => null (sin plan, no 0 % falso)', () => {
        const perDay = [{ applicableMeals: 0 }, { applicableMeals: 0 }]
        // `compliancePct` no-cero a propósito: si el helper lo devolviera igual, probaría que
        // ignoró la guarda de `applicableMeals` en vez de leerla.
        const summary = { compliancePct: 42 }

        expect(nutritionComplianceFromAdherence(perDay, summary)).toBeNull()
    })

    it('al menos un día con comidas aplicables y cero completadas => 0 (flag legítimo)', () => {
        const perDay = [{ applicableMeals: 0 }, { applicableMeals: 3 }]
        const summary = { compliancePct: 0 }

        expect(nutritionComplianceFromAdherence(perDay, summary)).toBe(0)
    })
})
