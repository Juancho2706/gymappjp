import { describe, expect, it } from 'vitest'
import { adherenceDelta } from '@/app/coach/dashboard/_lib/kpi-deltas'
import { averageAdherence } from '@/app/coach/dashboard/_lib/kpi-snapshot'
import {
    excludeDemoClientsFromPulse,
    mapDirectoryPulseToAdherenceStats,
    type DirectoryPulseRow,
} from './dashboard.service'

// Reporte del owner (2026-09-10): un coach recién registrado, con 0 alumnos reales y solo el
// alumno de ejemplo del onboarding, veía «Adherencia 78 % · +2 pts vs. semana previa» en el hero.
// El demo entra al pulse a propósito (listas del día 1 con contenido, etiquetado como ejemplo);
// lo que no puede hacer es mover los KPIs agregados ni el snapshot diario.

const row = (over: Partial<DirectoryPulseRow> & { clientId: string }): DirectoryPulseRow => ({
    clientName: over.clientId,
    percentage: 60,
    lastPlan: 'Plan',
    completedSets: 6,
    totalSets: 10,
    consumed: { cal: 0, prot: 0, carb: 0, fat: 0 },
    target: { cal: 0, prot: 0, carb: 0, fat: 0 },
    nutritionPercentage: 0,
    lastWorkoutDate: null,
    lastCheckinDate: null,
    currentWeight: null,
    weightDelta7d: null,
    weightHistory30d: [],
    adherenceHistory4w: [50, 55, 58, 60],
    oneRMDelta: null,
    planDaysRemaining: null,
    planCurrentWeek: null,
    planTotalWeeks: null,
    attentionScore: 0,
    attentionFlags: [],
    streak: 0,
    latestEnergyLevel: null,
    ...over,
})

describe('excludeDemoClientsFromPulse — el alumno de ejemplo no mueve los KPIs', () => {
    it('saca solo las filas con isDemo y preserva el orden del resto', () => {
        const pulse = [
            row({ clientId: 'real-1', percentage: 40 }),
            row({ clientId: 'demo', isDemo: true, percentage: 100 }),
            row({ clientId: 'real-2', percentage: 80 }),
        ]
        expect(excludeDemoClientsFromPulse(pulse).map((p) => p.clientId)).toEqual(['real-1', 'real-2'])
        // Ausente = no es demo (fixtures viejos sin el campo siguen contando).
        expect(excludeDemoClientsFromPulse([row({ clientId: 'sin-campo' })])).toHaveLength(1)
    })

    it('coach nuevo: solo el demo ⇒ avgAdherence 0 y sin delta, no «78 % · +2 pts»', () => {
        const pulse = [row({ clientId: 'demo', isDemo: true, percentage: 78, adherenceHistory4w: [70, 72, 76, 78] })]
        const stats = mapDirectoryPulseToAdherenceStats(excludeDemoClientsFromPulse(pulse))
        expect(stats).toEqual([])
        expect(averageAdherence(stats)).toBe(0)
        expect(adherenceDelta(stats)).toBeNull()
    })

    it('con alumnos reales el promedio y el delta salen solo de ellos', () => {
        const pulse = [
            row({ clientId: 'demo', isDemo: true, percentage: 100, adherenceHistory4w: [100, 100, 100, 100] }),
            row({ clientId: 'real-1', percentage: 40, adherenceHistory4w: [30, 35, 38, 40] }),
            row({ clientId: 'real-2', percentage: 80, adherenceHistory4w: [70, 74, 76, 80] }),
        ]
        const stats = mapDirectoryPulseToAdherenceStats(excludeDemoClientsFromPulse(pulse))
        expect(averageAdherence(stats)).toBe(60)
        const delta = adherenceDelta(stats)
        expect(delta).not.toBeNull()
        // (40 + 80) / 2 = 60 hoy vs (38 + 76) / 2 = 57 la semana previa ⇒ +3, sin el 100 del demo.
        expect(delta?.value).toBe(3)
    })
})
