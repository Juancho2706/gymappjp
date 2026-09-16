import { describe, expect, it } from 'vitest'
import { buildClientMonthDossier } from './month-dossier'
import type { BuildClientMonthDossierOpts, DossierTile, MonthReportJson } from './types'

const GEN_ISO = '2026-09-15T14:00:00.000Z'

function opts(over: Partial<BuildClientMonthDossierOpts> = {}): BuildClientMonthDossierOpts {
    return {
        generatedAtIso: GEN_ISO,
        identity: {
            fullName: 'Constanza Salgado',
            email: 'coni@example.cl',
            phone: '+56911112222',
            isActive: true,
            clientSinceIso: '2026-01-15',
        },
        index: 1,
        total: 3,
        ...over,
    }
}

/**
 * Julio 2026 de una alumna ficticia: mes cerrado, con programa vigente, 12 días entrenados sobre
 * 13 planificados, 3 récords (2 nuevos), 3 check-ins y plan de nutrición V2.
 * A propósito varios numéricos llegan como STRING: es lo que devuelve jsonb para `numeric`.
 */
function julyReport(): MonthReportJson {
    return {
        month: '2026-07-01',
        period: { from: '2026-07-01', to: '2026-07-31' },
        training_days: [
            '2026-07-02',
            '2026-07-04',
            '2026-07-07',
            '2026-07-09',
            '2026-07-11',
            '2026-07-14',
            '2026-07-16',
            '2026-07-18',
            '2026-07-21',
            '2026-07-23',
            '2026-07-25',
            '2026-07-28',
        ],
        sessions: 13,
        planned_days: '13',
        planned_per_week: 3,
        volume_total: '86450',
        volume_by_group: [
            { muscle_group: 'Glúteos', volume: '31200' },
            { muscle_group: 'Piernas', volume: 24800 },
            { muscle_group: 'Espalda', volume: 15300 },
            { muscle_group: 'Pecho', volume: 9800 },
            { muscle_group: '', volume: 5350 },
            { muscle_group: 'Core', volume: 0 },
        ],
        prs: [
            {
                exercise_id: 'ex-1',
                name: 'Sentadilla',
                muscle_group: 'Piernas',
                max_weight_kg: '92.5',
                reps_at_max: 5,
                achieved_at: '2026-07-16',
                prev_max_kg: '90',
            },
            {
                exercise_id: 'ex-2',
                name: 'Peso muerto',
                muscle_group: 'Espalda',
                max_weight_kg: 110,
                reps_at_max: 3,
                achieved_at: '2026-07-09',
                prev_max_kg: 115,
            },
            {
                exercise_id: 'ex-3',
                name: 'Hip thrust',
                muscle_group: 'Glúteos',
                max_weight_kg: 130,
                reps_at_max: 8,
                achieved_at: '2026-07-23',
                prev_max_kg: null,
            },
        ],
        program: {
            id: 'prg-1',
            name: 'Fuerza Q3',
            start_date: '2026-06-15',
            end_date: null,
            weeks_total: 12,
            week_from: 3,
            week_to: 7,
            days: [
                { title: 'Tren inferior', day_of_week: 1, block_count: 7 },
                { title: 'Tren superior', day_of_week: 3, block_count: 6 },
                { title: 'Full body', day_of_week: 5, block_count: '5' },
            ],
        },
        plan_names_from_logs: ['Tren inferior', 'Tren superior'],
        check_ins: [
            {
                id: 'ci-3',
                created_at: '2026-07-27T13:05:00.000Z',
                weight: '64.4',
                energy_level: 8,
                notes: 'Buena semana',
                front_photo_url: 'coach/cli/ci-3.jpg',
            },
            {
                id: 'ci-2',
                created_at: '2026-07-13T12:40:00.000Z',
                weight: 64.9,
                energy_level: 7,
                notes: null,
                front_photo_url: null,
            },
            {
                id: 'ci-1',
                created_at: '2026-07-06T12:30:00.000Z',
                weight: 65.2,
                energy_level: 6,
                notes: 'x'.repeat(260),
                front_photo_url: 'coach/cli/ci-1.jpg',
            },
        ],
        weight: { last_kg: '64.4', last_at: '2026-07-27T13:05:00.000Z', prev_kg: '64.9' },
        nutrition: { plan_name: 'Recomposición', in_range_days: 12, tracked_days: '20' },
    }
}

function tileByPrefix(tiles: DossierTile[] | undefined, prefix: string): DossierTile {
    const t = (tiles ?? []).find((x) => x.label.startsWith(prefix))
    if (!t) throw new Error(`tile no encontrado: ${prefix}`)
    return t
}

describe('buildClientMonthDossier — mes normal (julio 2026)', () => {
    const d = buildClientMonthDossier(julyReport(), opts())

    it('es pura: propaga generatedAtIso y el índice de la exportación', () => {
        expect(d.generatedAtIso).toBe(GEN_ISO)
        expect(d.period).toEqual({
            fromIso: '2026-07-01',
            toIso: '2026-07-31',
            monthKey: '2026-07',
            label: 'jul 2026',
            index: 1,
            total: 3,
        })
    })

    it('identidad: viene de opts; racha en 0 y última actividad = último día entrenado', () => {
        expect(d.identity.fullName).toBe('Constanza Salgado')
        expect(d.identity.clientSinceIso).toBe('2026-01-15')
        expect(d.identity.streakDays).toBe(0)
        expect(d.identity.lastActivityIso).toBe('2026-07-28')
    })

    it('el score de atención no se imprime en modo mes', () => {
        expect(d.status).toEqual({ attentionScore: 0, level: 'aldia' })
    })

    it('métricas del período (numéricos string normalizados con Number)', () => {
        expect(d.metrics.currentWeightKg).toBe(64.4)
        expect(d.metrics.weightDeltaKg).toBe(-0.5)
        expect(d.metrics.workoutsDone).toBe(12)
        expect(d.metrics.workoutsTarget).toBe(13)
        // 12/13 = 92,3 % ⇒ 92
        expect(d.metrics.periodAdherencePct).toBe(92)
        expect(d.metrics.adherenceWeeklyPct).toBe(92)
        // Las métricas "de hoy" no aplican a un informe mensual.
        expect(d.metrics.nutritionTodayKcal).toBeNull()
        expect(d.metrics.nutritionTodayPct).toBeNull()
        expect(d.metrics.nutritionWeeklyInRangePct).toBeNull()
    })

    it('programa: subtítulo «Semanas a–b de N» y días con conteo de ejercicios', () => {
        expect(d.program).not.toBeNull()
        expect(d.program!.name).toBe('Fuerza Q3')
        expect(d.program!.subtitle).toBe('Semanas 3–7 de 12')
        expect(d.program!.totalWeeks).toBe(12)
        expect(d.program!.currentWeek).toBe(7)
        expect(d.program!.days).toEqual([
            { title: 'Tren inferior', dayOfWeek: 1, blockCount: 7 },
            { title: 'Tren superior', dayOfWeek: 3, blockCount: 6 },
            { title: 'Full body', dayOfWeek: 5, blockCount: 5 },
        ])
    })

    it('récords: top por peso máx, ★ solo los que superan el máximo previo', () => {
        expect(d.training.personalRecords.map((r) => [r.exerciseName, r.isNew])).toEqual([
            ['Hip thrust', true], // sin máximo previo ⇒ nuevo
            ['Peso muerto', false], // 110 < 115 previo ⇒ repetido
            ['Sentadilla', true], // 92.5 > 90 previo ⇒ nuevo
        ])
        expect(d.training.personalRecords[2].maxWeightKg).toBe(92.5)
    })

    it('volumen: descendente, sin ceros, grupo vacío ⇒ "Otro"', () => {
        expect(d.training.muscleVolume).toEqual([
            { muscleGroup: 'Glúteos', volume: 31200 },
            { muscleGroup: 'Piernas', volume: 24800 },
            { muscleGroup: 'Espalda', volume: 15300 },
            { muscleGroup: 'Pecho', volume: 9800 },
            { muscleGroup: 'Otro', volume: 5350 },
        ])
    })

    it('nutrición del mes: días del PERÍODO, metas en null y sin adherencia semanal', () => {
        expect(d.nutrition).not.toBeNull()
        expect(d.nutrition!.planName).toBe('Recomposición')
        expect(d.nutrition!.periodInRangeDays).toBe(12)
        expect(d.nutrition!.periodTrackedDays).toBe(20)
        expect(d.nutrition!.subtitle).toBe('12 de 20 días registrados')
        expect(d.nutrition!.weeklyInRangePct).toBeNull()
        expect(d.nutrition!.goals).toEqual({ calories: null, protein: null, carbs: null, fats: null })
    })

    it('check-ins: DESC, Δ encadenado dentro del mes, notas truncadas y sin foto por defecto', () => {
        expect(d.checkInsTotal).toBe(3)
        expect(d.checkIns.map((c) => c.weightDeltaKg)).toEqual([-0.5, -0.3, null])
        expect(d.checkIns[2].notes!.length).toBeLessThanOrEqual(200)
        expect(d.checkIns[2].notes!.endsWith('…')).toBe(true)
        expect(d.checkIns.every((c) => c.photoUrl === null)).toBe(true)
    })

    it('los 6 tiles llevan el período en el rótulo (R14)', () => {
        expect((d.tiles ?? []).map((t) => t.label)).toEqual([
            'Peso · jul 2026',
            'Adherencia · jul 2026',
            'Días entrenados · jul 2026',
            'Volumen · jul 2026',
            'Récords nuevos · jul 2026',
            'Check-ins · jul 2026',
        ])
    })

    it('tiles: valores, subtítulos y tonos', () => {
        expect(tileByPrefix(d.tiles, 'Peso')).toEqual({
            label: 'Peso · jul 2026',
            value: '64,4 kg',
            sub: '-0,5 kg',
            tone: 'success',
        })
        expect(tileByPrefix(d.tiles, 'Adherencia')).toEqual({
            label: 'Adherencia · jul 2026',
            value: '92%',
            sub: '12 de 13 días',
            tone: 'success',
        })
        expect(tileByPrefix(d.tiles, 'Días entrenados')).toEqual({
            label: 'Días entrenados · jul 2026',
            value: '12/13',
            sub: '13 sesiones',
            tone: 'mid',
        })
        expect(tileByPrefix(d.tiles, 'Volumen')).toEqual({
            label: 'Volumen · jul 2026',
            value: '86.450 kg',
            sub: 'kg × reps',
            tone: 'accent',
        })
        expect(tileByPrefix(d.tiles, 'Récords nuevos')).toEqual({
            label: 'Récords nuevos · jul 2026',
            value: '2',
            sub: 'de 3 récords del mes',
            tone: 'accent',
        })
        expect(tileByPrefix(d.tiles, 'Check-ins')).toEqual({
            label: 'Check-ins · jul 2026',
            value: '3',
            sub: 'en el mes',
            tone: 'mid',
        })
    })
})

describe('buildClientMonthDossier — variantes del período', () => {
    it('mes VACÍO: nada crashea, adherencia «—» y cuadros en cero', () => {
        const empty: MonthReportJson = {
            month: '2026-08-01',
            period: { from: '2026-08-01', to: '2026-08-31' },
            training_days: [],
            sessions: 0,
            planned_days: null,
            planned_per_week: null,
            volume_total: 0,
            volume_by_group: [],
            prs: [],
            program: null,
            plan_names_from_logs: [],
            check_ins: [],
            weight: null,
            nutrition: null,
        }
        const d = buildClientMonthDossier(empty, opts({ index: 2, total: 3 }))
        expect(d.program).toBeNull()
        expect(d.nutrition).toBeNull()
        expect(d.checkIns).toEqual([])
        expect(d.checkInsTotal).toBe(0)
        expect(d.training.personalRecords).toEqual([])
        expect(d.training.muscleVolume).toEqual([])
        expect(d.identity.lastActivityIso).toBeNull()
        expect(d.metrics.periodAdherencePct).toBeNull()
        expect(d.metrics.currentWeightKg).toBeNull()
        expect(tileByPrefix(d.tiles, 'Peso')).toEqual({
            label: 'Peso · ago 2026',
            value: '—',
            sub: '—',
            tone: 'muted',
        })
        expect(tileByPrefix(d.tiles, 'Adherencia')).toEqual({
            label: 'Adherencia · ago 2026',
            value: '—',
            sub: '0 días',
            tone: 'muted',
        })
        expect(tileByPrefix(d.tiles, 'Días entrenados').value).toBe('0')
        expect(tileByPrefix(d.tiles, 'Volumen')).toMatchObject({ value: '0 kg', tone: 'muted' })
        expect(tileByPrefix(d.tiles, 'Récords nuevos')).toMatchObject({ value: '0', sub: 'sin récords' })
        expect(tileByPrefix(d.tiles, 'Check-ins')).toMatchObject({ value: '0', sub: 'sin check-ins' })
    })

    it('un jsonb mínimo (todo ausente, no null) tampoco rompe', () => {
        const d = buildClientMonthDossier(
            { month: '2026-08-01', period: { from: '2026-08-01', to: '2026-08-31' } },
            opts()
        )
        expect(d.program).toBeNull()
        expect(d.tiles).toHaveLength(6)
        expect(d.metrics.workoutsDone).toBe(0)
    })

    it('mes EN CURSO: el período corta en hoy y los tiles siguen rotulados con el mes', () => {
        const r = julyReport()
        r.month = '2026-09-01'
        r.period = { from: '2026-09-01', to: '2026-09-15' }
        r.check_ins = []
        r.weight = null
        const d = buildClientMonthDossier(r, opts({ index: 3, total: 3 }))
        expect(d.period).toMatchObject({ fromIso: '2026-09-01', toIso: '2026-09-15', monthKey: '2026-09', label: 'sep 2026' })
        expect(tileByPrefix(d.tiles, 'Adherencia').label).toBe('Adherencia · sep 2026')
    })

    it('sin programa pero con nombres de plan en los logs ⇒ «Entrenamientos registrados» sin conteo', () => {
        const r = julyReport()
        r.program = null
        const d = buildClientMonthDossier(r, opts())
        expect(d.program).not.toBeNull()
        expect(d.program!.name).toBe('Entrenamientos registrados')
        expect(d.program!.subtitle).toBeNull()
        expect(d.program!.days).toEqual([
            { title: 'Tren inferior', dayOfWeek: null, blockCount: 0 },
            { title: 'Tren superior', dayOfWeek: null, blockCount: 0 },
        ])
    })

    it('sin programa y sin nombres en los logs ⇒ program null (empty state actual)', () => {
        const r = julyReport()
        r.program = null
        r.plan_names_from_logs = []
        expect(buildClientMonthDossier(r, opts()).program).toBeNull()
    })

    it('programa FINALIZADO dentro del mes ⇒ el subtítulo lo anota', () => {
        const r = julyReport()
        r.program = { ...r.program!, end_date: '2026-07-18', week_from: 3, week_to: 5 }
        const d = buildClientMonthDossier(r, opts())
        expect(d.program!.subtitle).toBe('Semanas 3–5 de 12   ·   finalizó el 18 jul')
    })

    it('programa que ocupa una sola semana del mes ⇒ «Semana N de M»', () => {
        const r = julyReport()
        r.program = { ...r.program!, week_from: 4, week_to: 4 }
        expect(buildClientMonthDossier(r, opts()).program!.subtitle).toBe('Semana 4 de 12')
    })

    it('el último peso conocido cae FUERA del período ⇒ «último check-in dd mmm», sin Δ de color', () => {
        const r = julyReport()
        r.check_ins = []
        r.weight = { last_kg: 66.1, last_at: '2026-05-28T13:00:00.000Z', prev_kg: 66.8 }
        const d = buildClientMonthDossier(r, opts())
        expect(tileByPrefix(d.tiles, 'Peso')).toEqual({
            label: 'Peso · jul 2026',
            value: '66,1 kg',
            sub: 'último check-in 28 may',
            tone: 'muted',
        })
        // El valor del peso sigue siendo el último conocido (el PDF no miente con «—»).
        expect(d.metrics.currentWeightKg).toBe(66.1)
    })

    it('Δ dentro del dead-band ±0.05 ⇒ «sin cambio» gris; Δ positivo ⇒ ámbar', () => {
        const flat = julyReport()
        flat.weight = { last_kg: 64.42, last_at: '2026-07-27T13:05:00.000Z', prev_kg: 64.4 }
        expect(tileByPrefix(buildClientMonthDossier(flat, opts()).tiles, 'Peso')).toMatchObject({
            sub: 'sin cambio',
            tone: 'muted',
        })

        const up = julyReport()
        up.weight = { last_kg: 64.7, last_at: '2026-07-27T13:05:00.000Z', prev_kg: 64.4 }
        expect(tileByPrefix(buildClientMonthDossier(up, opts()).tiles, 'Peso')).toMatchObject({
            sub: '+0,3 kg',
            tone: 'warning',
        })
    })

    it('adherencia por debajo de los umbrales cambia el tono (≥80 verde, ≥50 ámbar, resto rojo)', () => {
        const mid = julyReport()
        mid.planned_days = 20 // 12/20 = 60 %
        expect(tileByPrefix(buildClientMonthDossier(mid, opts()).tiles, 'Adherencia')).toMatchObject({
            value: '60%',
            tone: 'warning',
        })

        const low = julyReport()
        low.planned_days = 40 // 12/40 = 30 %
        expect(tileByPrefix(buildClientMonthDossier(low, opts()).tiles, 'Adherencia')).toMatchObject({
            value: '30%',
            tone: 'danger',
        })
    })

    it('planned_days = 0 (programa con planes sin day_of_week) se trata como null, no como 0 %', () => {
        const r = julyReport()
        r.planned_days = 0
        r.planned_per_week = 0
        const d = buildClientMonthDossier(r, opts())
        expect(d.metrics.periodAdherencePct).toBeNull()
        expect(d.metrics.workoutsTarget).toBe(0)
        expect(tileByPrefix(d.tiles, 'Adherencia')).toMatchObject({ value: '—', sub: '12 días', tone: 'muted' })
        // Sin denominador: nunca «12/0».
        expect(tileByPrefix(d.tiles, 'Días entrenados').value).toBe('12')
    })

    it('programa A/B: los días repiten day_of_week y se listan tal cual (sin deduplicar)', () => {
        const r = julyReport()
        r.program = {
            ...r.program!,
            days: [
                { title: 'Tren inferior A', day_of_week: 1, block_count: 7 },
                { title: 'Tren inferior B', day_of_week: 1, block_count: 6 },
                { title: 'Tren superior A', day_of_week: 3, block_count: 6 },
                { title: 'Tren superior B', day_of_week: 3, block_count: 5 },
            ],
        }
        const d = buildClientMonthDossier(r, opts())
        expect(d.program!.days).toHaveLength(4)
        expect(d.program!.days.map((x) => x.dayOfWeek)).toEqual([1, 1, 3, 3])
    })

    it('programa con más de 14 días (A/B largo) se corta en 14', () => {
        const r = julyReport()
        r.program = {
            ...r.program!,
            days: Array.from({ length: 18 }, (_, i) => ({
                title: `Día ${i}`,
                day_of_week: (i % 7) + 1,
                block_count: 4,
            })),
        }
        expect(buildClientMonthDossier(r, opts()).program!.days).toHaveLength(14)
    })

    it('nutrición sin días registrados (snapshots lazy) ⇒ subtítulo honesto', () => {
        const r = julyReport()
        r.nutrition = { plan_name: 'Recomposición', in_range_days: 0, tracked_days: 0 }
        expect(buildClientMonthDossier(r, opts()).nutrition!.subtitle).toBe('sin días registrados')
    })

    it('nutrición con un solo día registrado ⇒ singular', () => {
        const r = julyReport()
        r.nutrition = { plan_name: 'Recomposición', in_range_days: '1', tracked_days: '1' }
        expect(buildClientMonthDossier(r, opts()).nutrition!.subtitle).toBe('1 de 1 día registrado')
    })

    it('adherencia con tope 100 (entrenó más días que los planificados)', () => {
        const r = julyReport()
        r.planned_days = 8
        const d = buildClientMonthDossier(r, opts())
        expect(d.metrics.periodAdherencePct).toBe(100)
    })

    it('todos los récords repetidos ⇒ 0 nuevos y tile gris', () => {
        const r = julyReport()
        r.prs = (r.prs ?? []).map((p) => ({ ...p, prev_max_kg: 999 }))
        const d = buildClientMonthDossier(r, opts())
        expect(d.training.personalRecords.every((p) => p.isNew === false)).toBe(true)
        expect(tileByPrefix(d.tiles, 'Récords nuevos')).toMatchObject({ value: '0', tone: 'muted' })
    })

    it('el tile de récords cuenta TODOS los nuevos del mes, aunque la tabla corte en 10', () => {
        const r = julyReport()
        r.prs = Array.from({ length: 14 }, (_, i) => ({
            exercise_id: `ex-${i}`,
            name: `Ejercicio ${i}`,
            muscle_group: 'Piernas',
            max_weight_kg: 100 - i,
            reps_at_max: 5,
            achieved_at: '2026-07-10',
            prev_max_kg: null,
        }))
        const d = buildClientMonthDossier(r, opts())
        expect(d.training.personalRecords).toHaveLength(10)
        expect(tileByPrefix(d.tiles, 'Récords nuevos')).toMatchObject({ value: '14', sub: 'de 14 récords del mes' })
    })

    it('volumen por grupo se corta en 8', () => {
        const r = julyReport()
        r.volume_by_group = Array.from({ length: 12 }, (_, i) => ({ muscle_group: `G${i}`, volume: 1000 - i }))
        expect(buildClientMonthDossier(r, opts()).training.muscleVolume).toHaveLength(8)
    })

    it('check-ins se cortan en 30 pero el total del mes es el real', () => {
        const r = julyReport()
        r.check_ins = Array.from({ length: 34 }, (_, i) => ({
            id: `ci-${i}`,
            created_at: `2026-07-${String(31 - i).padStart(2, '0')}T12:00:00.000Z`,
            weight: 65,
            energy_level: 7,
            notes: null,
            front_photo_url: null,
        })).slice(0, 34)
        const d = buildClientMonthDossier(r, opts())
        expect(d.checkIns).toHaveLength(30)
        expect(d.checkInsTotal).toBe(34)
        expect(tileByPrefix(d.tiles, 'Check-ins').value).toBe('34')
    })
})

describe('buildClientMonthDossier — fotos', () => {
    it('con photoUrls: cada check-in recibe SU url firmada por id; los que no están quedan en null', () => {
        const d = buildClientMonthDossier(
            julyReport(),
            opts({ photoUrls: { 'ci-3': 'https://signed/ci-3.jpg', 'ci-1': null } })
        )
        expect(d.checkIns[0].photoUrl).toBe('https://signed/ci-3.jpg')
        expect(d.checkIns[1].photoUrl).toBeNull()
        expect(d.checkIns[2].photoUrl).toBeNull()
    })

    it('sin photoUrls (interruptor de fotos apagado) ⇒ todas en null, el path crudo NUNCA viaja', () => {
        const d = buildClientMonthDossier(julyReport(), opts())
        expect(d.checkIns.map((c) => c.photoUrl)).toEqual([null, null, null])
    })
})
