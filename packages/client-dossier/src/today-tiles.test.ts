import { describe, expect, it } from 'vitest'
import { adherenceTone, buildTodayTiles } from './today-tiles'
import type { ClientDossierData } from './types'

/**
 * El MISMO alumno del fixture de `apps/web/src/services/client/client-dossier.test.ts`
 * (Constanza Salgado), ya mapeado por `buildClientDossier`. Se escribe a mano acá porque el
 * package es puro: no puede importar de `apps/web`. Si el mapper cambia, este literal y aquel
 * test se mueven juntos.
 */
function todayDossier(): ClientDossierData {
    return {
        generatedAtIso: '2026-07-02T12:00:00.000Z',
        identity: {
            fullName: 'Constanza Salgado',
            email: 'coni@example.cl',
            phone: '+56911112222',
            isActive: true,
            clientSinceIso: '2026-01-15',
            streakDays: 12,
            lastActivityIso: '2026-06-30T09:00:00.000Z',
        },
        status: { attentionScore: 18, level: 'aldia' },
        metrics: {
            currentWeightKg: 68,
            weightDeltaKg: -0.6,
            workoutsDone: 3,
            workoutsTarget: 4,
            adherenceWeeklyPct: 75,
            nutritionTodayKcal: { consumed: 1680, target: 2100 },
            nutritionTodayPct: 80,
            nutritionWeeklyInRangePct: 75,
            checkInCompliancePct: 90,
            planCurrentWeek: 3,
            planTotalWeeks: 8,
        },
        program: {
            name: 'Hipertrofia 8 semanas',
            currentWeek: 3,
            totalWeeks: 8,
            daysRemaining: 35,
            days: [{ title: 'Push', dayOfWeek: 1, blockCount: 3 }],
        },
        training: { personalRecords: [], muscleVolume: [] },
        nutrition: null,
        checkIns: [],
        checkInsTotal: 5,
    }
}

describe('buildTodayTiles — espejo exacto del grid 2×3 que ya imprime el dossier de hoy', () => {
    it('los 6 cuadros, sin período en el rótulo', () => {
        expect(buildTodayTiles(todayDossier())).toEqual([
            { label: 'Peso', value: '68 kg', sub: '-0.6 kg', tone: 'success' },
            { label: 'Adherencia semanal', value: '75%', sub: 'entrenamientos', tone: 'warning' },
            { label: 'Racha', value: '12', sub: 'días seguidos', tone: 'accent' },
            { label: 'Workouts semana', value: '3/4', sub: 'esta semana', tone: 'mid' },
            { label: 'Nutrición semana', value: '75%', sub: 'días en rango', tone: 'warning' },
            { label: 'Check-ins', value: '90%', sub: 'cumplimiento', tone: 'success' },
        ])
    })

    it('sin plan V2 vigente la nutrición dice «—» y «sin plan vigente», nunca 0 %', () => {
        const d = todayDossier()
        d.metrics.nutritionWeeklyInRangePct = null
        const tiles = buildTodayTiles(d)
        expect(tiles[4]).toEqual({
            label: 'Nutrición semana',
            value: '—',
            sub: 'sin plan vigente',
            tone: 'muted',
        })
    })

    it('sin peso registrado ⇒ «—» y «sin cambio»', () => {
        const d = todayDossier()
        d.metrics.currentWeightKg = null
        d.metrics.weightDeltaKg = null
        expect(buildTodayTiles(d)[0]).toEqual({ label: 'Peso', value: '—', sub: 'sin cambio', tone: 'muted' })
    })

    it('Δ positivo en ámbar y dead-band ±0.05 en gris (sin él, +0.03 renderiza «+0.0 kg»)', () => {
        const up = todayDossier()
        up.metrics.weightDeltaKg = 0.3
        expect(buildTodayTiles(up)[0]).toMatchObject({ sub: '+0.3 kg', tone: 'warning' })

        const flat = todayDossier()
        flat.metrics.weightDeltaKg = 0.03
        expect(buildTodayTiles(flat)[0]).toMatchObject({ sub: 'sin cambio', tone: 'muted' })
    })

    it('adherenceTone: umbrales 80 / 50 del PDF', () => {
        expect(adherenceTone(80)).toBe('success')
        expect(adherenceTone(79)).toBe('warning')
        expect(adherenceTone(50)).toBe('warning')
        expect(adherenceTone(49)).toBe('danger')
        expect(adherenceTone(null)).toBe('muted')
    })
})
