import { describe, expect, it, vi } from 'vitest'
import type { ClientDossierData } from '@/services/client/client-dossier'

/**
 * Smoke del generador de PDF: corre el pipeline completo en jsdom con un fixture
 * realista SIN fotos (evita fetch/createImageBitmap, ausentes en jsdom). Intercepta
 * `doc.save` para capturar el PDF en memoria y verificar que se generó sin romper.
 *
 * `jsPDF` asigna `save` como propiedad PROPIA de la instancia (no en el prototype),
 * así que se mockea el módulo con una subclase que re-sobreescribe `save` DESPUÉS de
 * `super()` para capturar `output('arraybuffer')` en un holder hoisted.
 *
 * Con `DOSSIER_PREVIEW_OUT=<ruta>` además escribe el PDF a disco para revisión visual
 * (no se ejecuta en CI porque la env var no está seteada).
 */

const holder = vi.hoisted(() => ({ captured: null as ArrayBuffer | null }))

vi.mock('jspdf', async (importOriginal) => {
    const actual = await importOriginal<typeof import('jspdf')>()
    class PatchedJsPDF extends actual.jsPDF {
        constructor(...args: ConstructorParameters<typeof actual.jsPDF>) {
            super(...args)
            // El constructor padre setea `save` como prop propia → la pisamos acá.
            ;(this as unknown as { save: (f?: string) => unknown }).save = () => {
                try {
                    holder.captured = this.output('arraybuffer')
                } catch {
                    /* noop */
                }
                return this
            }
        }
    }
    return { ...actual, jsPDF: PatchedJsPDF }
})

// Import DESPUÉS del mock (vi.mock se hoistea, pero el generador importa jspdf en runtime).
const { downloadClientDossierPdf } = await import('./client-dossier-pdf')

const FIXTURE: ClientDossierData = {
    generatedAtIso: '2026-07-02T15:30:00.000Z',
    identity: {
        fullName: 'Constanza Salgado',
        email: 'constanza.salgado@example.cl',
        phone: '+56 9 8123 4567',
        isActive: true,
        clientSinceIso: '2026-02-01',
        streakDays: 14,
        lastActivityIso: '2026-07-01T09:12:00.000Z',
    },
    status: { attentionScore: 32, level: 'atencion' },
    metrics: {
        currentWeightKg: 63.4,
        weightDeltaKg: -0.7,
        workoutsDone: 3,
        workoutsTarget: 4,
        adherenceWeeklyPct: 75,
        mealsDoneToday: 3,
        mealsTotalToday: 4,
        nutritionTodayPct: 75,
        nutritionAdherence30dPct: 81,
        checkInCompliancePct: 88,
        planCurrentWeek: 5,
        planTotalWeeks: 8,
    },
    program: {
        name: 'Recomposición · Bloque 2',
        currentWeek: 5,
        totalWeeks: 8,
        daysRemaining: 21,
        days: [
            { title: 'Día A · Tren inferior', dayOfWeek: 1, blockCount: 6 },
            { title: 'Día B · Empuje', dayOfWeek: 3, blockCount: 5 },
            { title: 'Día C · Tracción', dayOfWeek: 5, blockCount: 5 },
        ],
    },
    training: {
        personalRecords: [
            { exerciseName: 'Peso muerto convencional', muscleGroup: 'Espalda', maxWeightKg: 110, repsAtMax: 3 },
            { exerciseName: 'Sentadilla trasera', muscleGroup: 'Piernas', maxWeightKg: 95, repsAtMax: 5 },
            { exerciseName: 'Press banca', muscleGroup: 'Pecho', maxWeightKg: 52, repsAtMax: 6 },
        ],
        muscleVolume: [
            { muscleGroup: 'Piernas', volume: 12400 },
            { muscleGroup: 'Espalda', volume: 9800 },
            { muscleGroup: 'Pecho', volume: 6100 },
            { muscleGroup: 'Hombros', volume: 3200 },
        ],
    },
    nutrition: {
        planName: 'Definición moderada',
        goals: { calories: 1950, protein: 150, carbs: 180, fats: 55 },
        // Con day-specific el label pasa a "N comidas en el plan (varía por día)".
        mealsTotal: 5,
        hasDaySpecificMeals: true,
    },
    checkIns: [
        { dateIso: '2026-06-30T09:00:00.000Z', weightKg: 63.4, weightDeltaKg: -0.7, energyLevel: 8, notes: 'Semana con buena energía, dormí mejor.', photoUrl: null },
        { dateIso: '2026-06-23T09:00:00.000Z', weightKg: 64.1, weightDeltaKg: -0.4, energyLevel: 7, notes: null, photoUrl: null },
        { dateIso: '2026-06-16T09:00:00.000Z', weightKg: 64.5, weightDeltaKg: -0.5, energyLevel: 6, notes: 'Algo cansada por el trabajo, igual entrené 3 veces.', photoUrl: null },
        { dateIso: '2026-06-09T09:00:00.000Z', weightKg: 65.0, weightDeltaKg: -0.3, energyLevel: 7, notes: null, photoUrl: null },
        { dateIso: '2026-06-02T09:00:00.000Z', weightKg: 65.3, weightDeltaKg: null, energyLevel: 6, notes: 'Primer check-in del bloque.', photoUrl: null },
    ],
    // > checkIns.length ⇒ ejercita la nota "Mostrando los N más recientes de M".
    checkInsTotal: 12,
}

describe('downloadClientDossierPdf (smoke)', () => {
    it('genera un PDF válido con el fixture sin romper', async () => {
        holder.captured = null

        await downloadClientDossierPdf(FIXTURE)

        expect(holder.captured).toBeTruthy()
        expect((holder.captured as unknown as ArrayBuffer).byteLength).toBeGreaterThan(1000)

        // Escritura a disco SOLO si se pide explícitamente (revisión visual, no CI).
        const out = process.env.DOSSIER_PREVIEW_OUT
        if (out && holder.captured) {
            try {
                const fs = await import('node:fs')
                fs.writeFileSync(out, Buffer.from(holder.captured as unknown as ArrayBuffer))
            } catch {
                /* best-effort: no romper el test por I/O */
            }
        }
    })
})
