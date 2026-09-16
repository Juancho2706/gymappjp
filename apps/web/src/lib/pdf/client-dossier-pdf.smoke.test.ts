// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { unzipSync } from 'fflate'
import { buildClientMonthDossier } from '@eva/client-dossier'
import type { BuildClientMonthDossierOpts, MonthReportJson } from '@eva/client-dossier'
import type { ClientDossierData } from '@/services/client/client-dossier'

/**
 * Smoke del generador de PDF: corre el pipeline completo con fixtures realistas SIN fotos
 * (evita fetch/createImageBitmap, ausentes en jsdom). Intercepta `doc.save` para capturar el
 * PDF en memoria y verificar que se generó sin romper.
 *
 * `jsPDF` asigna `save` como propiedad PROPIA de la instancia (no en el prototype), así que se
 * mockea el módulo con una subclase que re-sobreescribe `save` DESPUÉS de `super()` para
 * capturar `output('arraybuffer')`, el nombre de archivo y el total de páginas en un holder
 * hoisted. El holder guarda ARRAYS: la exportación mensual genera uno o varios documentos.
 *
 * Corre en jsdom (no en el project `web-node`) porque el modo «separado» entrega un zip con un
 * `<a download>` + `URL.createObjectURL`, que solo existen con DOM.
 *
 * Con `DOSSIER_PREVIEW_OUT=<ruta>` además escribe el primer PDF a disco para revisión visual
 * (no se ejecuta en CI porque la env var no está seteada).
 */

const holder = vi.hoisted(() => ({
    captured: [] as ArrayBuffer[],
    names: [] as string[],
    pages: [] as number[],
}))

function resetHolder() {
    holder.captured = []
    holder.names = []
    holder.pages = []
}

vi.mock('jspdf', async (importOriginal) => {
    const actual = await importOriginal<typeof import('jspdf')>()
    class PatchedJsPDF extends actual.jsPDF {
        constructor(...args: ConstructorParameters<typeof actual.jsPDF>) {
            super(...args)
            // El constructor padre setea `save` como prop propia → la pisamos acá.
            ;(this as unknown as { save: (f?: string) => unknown }).save = (filename?: string) => {
                try {
                    holder.names.push(String(filename ?? ''))
                    holder.pages.push(this.getNumberOfPages())
                    holder.captured.push(this.output('arraybuffer'))
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
        nutritionTodayKcal: { consumed: 1620, target: 1950 },
        nutritionTodayPct: 83,
        nutritionWeeklyInRangePct: 67,
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
        // Plan V2 multi-día: el label pasa a "N franjas hoy (las metas varían por día)" y se
        // imprime la línea "METAS POR DÍA".
        mealsTotal: 5,
        hasDaySpecificMeals: true,
        dayTargets: [
            { label: 'Base', calories: 1950 },
            { label: 'Sábado', calories: 2300 },
        ],
        weeklyInRangePct: 67,
        weeklyInRangeDays: 4,
        weeklyTrackedDays: 6,
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

// ─── Fixture mensual (calcado del de packages/client-dossier/src/month-dossier.test.ts) ──────

const MONTH_GEN_ISO = '2026-09-15T14:00:00.000Z'

function monthOpts(over: Partial<BuildClientMonthDossierOpts> = {}): BuildClientMonthDossierOpts {
    return {
        generatedAtIso: MONTH_GEN_ISO,
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
 * Un mes con programa vigente, récords (uno nuevo ⇒ marca «(nuevo)», uno que no), check-ins con
 * nota larga y nutrición V2. Varios numéricos llegan como STRING a propósito: es lo que devuelve
 * jsonb para `numeric`. `front_photo_url` nunca se firma acá ⇒ el PDF sale sin bloque de fotos.
 */
function monthReport(monthKey: string, lastDay: string): MonthReportJson {
    return {
        month: `${monthKey}-01`,
        period: { from: `${monthKey}-01`, to: `${monthKey}-${lastDay}` },
        training_days: [`${monthKey}-02`, `${monthKey}-09`, `${monthKey}-16`, `${monthKey}-23`],
        sessions: 5,
        planned_days: '13',
        planned_per_week: 3,
        volume_total: '86450',
        volume_by_group: [
            { muscle_group: 'Glúteos', volume: '31200' },
            { muscle_group: 'Piernas', volume: 24800 },
            { muscle_group: 'Espalda', volume: 15300 },
        ],
        prs: [
            {
                exercise_id: 'ex-1',
                name: 'Sentadilla',
                muscle_group: 'Piernas',
                max_weight_kg: '92.5',
                reps_at_max: 5,
                achieved_at: `${monthKey}-16`,
                prev_max_kg: '90',
            },
            {
                exercise_id: 'ex-2',
                name: 'Peso muerto',
                muscle_group: 'Espalda',
                max_weight_kg: 110,
                reps_at_max: 3,
                achieved_at: `${monthKey}-09`,
                prev_max_kg: 115,
            },
            {
                exercise_id: 'ex-3',
                name: 'Hip thrust',
                muscle_group: 'Glúteos',
                max_weight_kg: 130,
                reps_at_max: 8,
                achieved_at: `${monthKey}-23`,
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
                id: 'ci-2',
                created_at: `${monthKey}-13T12:40:00.000Z`,
                weight: 64.9,
                energy_level: 7,
                notes: null,
                front_photo_url: null,
            },
            {
                id: 'ci-1',
                created_at: `${monthKey}-06T12:30:00.000Z`,
                weight: 65.2,
                energy_level: 6,
                notes: 'x'.repeat(260),
                front_photo_url: 'coach/cli/ci-1.jpg',
            },
        ],
        weight: { last_kg: '64.9', last_at: `${monthKey}-13T12:40:00.000Z`, prev_kg: '65.2' },
        nutrition: { plan_name: 'Recomposición', in_range_days: 12, tracked_days: '20' },
    }
}

/**
 * Mes SIN nada: el alumno no entrenó, no tiene programa vigente ni nombres de plan en los logs,
 * no hay plan de nutrición y no hubo check-ins. Es el peor caso de los estados vacíos.
 */
function emptyMonthReport(): MonthReportJson {
    return {
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
}

/** Julio, agosto y septiembre 2026 como los devolvería `get_client_month_reports`. */
function threeMonthDossiers(): ClientDossierData[] {
    const reports = [monthReport('2026-07', '31'), monthReport('2026-08', '31'), monthReport('2026-09', '15')]
    return reports.map((r, i) => buildClientMonthDossier(r, monthOpts({ index: i + 1, total: reports.length })))
}

/**
 * WinAnsiEncoding coincide con latin1 salvo en 0x80–0x9F, donde mete la puntuación tipográfica
 * (guiones largos, comillas curvas, bullets). Sin esta tabla, «Período 1–31 jul» sale con un
 * carácter de control en lugar del «–» y las aserciones no matchean.
 */
const WINANSI_C1: Record<number, string> = {
    0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ',
    0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“',
    0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›',
    0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
}

/**
 * Texto plano del PDF. jsPDF no comprime los content streams, así que los literales `(…) Tj`
 * se leen tal cual — alcanza para verificar QUÉ dice el informe, no cómo se ve.
 */
function pdfText(buf: ArrayBuffer): string {
    return Buffer.from(buf)
        .toString('latin1')
        .replace(/[-]/g, (ch) => WINANSI_C1[ch.charCodeAt(0)] ?? ch)
}

/** Captura el blob del `<a download>` del modo separado (jsdom no trae `createObjectURL`). */
function stubBlobDownload() {
    const blobs: Blob[] = []
    const createSpy = vi.fn((b: Blob) => {
        blobs.push(b)
        return `blob:mock/${blobs.length}`
    })
    const revokeSpy = vi.fn()
    const urlCtor = URL as unknown as {
        createObjectURL?: (b: Blob) => string
        revokeObjectURL?: (u: string) => void
    }
    const prevCreate = urlCtor.createObjectURL
    const prevRevoke = urlCtor.revokeObjectURL
    urlCtor.createObjectURL = createSpy
    urlCtor.revokeObjectURL = revokeSpy
    // Sin esto jsdom intenta navegar a `blob:` y escupe "Not implemented: navigation".
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    return {
        blobs,
        createSpy,
        revokeSpy,
        restore() {
            clickSpy.mockRestore()
            urlCtor.createObjectURL = prevCreate
            urlCtor.revokeObjectURL = prevRevoke
        },
    }
}

describe('downloadClientDossierPdf (smoke)', () => {
    it('genera un PDF válido con el fixture sin romper', async () => {
        resetHolder()

        await downloadClientDossierPdf(FIXTURE)

        expect(holder.captured).toHaveLength(1)
        expect(holder.captured[0].byteLength).toBeGreaterThan(1000)
        expect(holder.names[0]).toBe('dossier-constanza-salgado-2026-07-02.pdf')

        // El dossier «de hoy» no cambia con el refactor: mismo eyebrow, mismo chip con score,
        // misma racha en la meta-línea y sin nada del modo mes.
        const txt = pdfText(holder.captured[0])
        expect(txt).toContain('DOSSIER DEL ALUMNO')
        expect(txt).toContain('ATENCIÓN · SCORE 32')
        expect(txt).toContain('Racha 14 días')
        expect(txt).toContain('Semana 5/8')
        // Los paréntesis viajan escapados dentro del literal PDF.
        expect(txt).toContain('VOLUMEN POR GRUPO \\(30D\\)')
        expect(txt).toContain('Adherencia semanal 67%')
        expect(txt).not.toContain('INFORME MENSUAL')
        expect(txt).not.toContain('\\(nuevo\\)')

        // Escritura a disco SOLO si se pide explícitamente (revisión visual, no CI).
        const out = process.env.DOSSIER_PREVIEW_OUT
        if (out && holder.captured[0]) {
            try {
                const fs = await import('node:fs')
                fs.writeFileSync(out, Buffer.from(holder.captured[0]))
            } catch {
                /* best-effort: no romper el test por I/O */
            }
        }
    })

    it('3 informes mensuales JUNTOS ⇒ un solo save, ≥3 páginas y nombre con el rango de meses', async () => {
        resetHolder()

        await downloadClientDossierPdf(threeMonthDossiers())

        // Un solo documento: nunca N descargas seguidas.
        expect(holder.captured).toHaveLength(1)
        expect(holder.captured[0].byteLength).toBeGreaterThan(1000)
        // Una hoja por informe como mínimo (el footer numera 1..N sobre TODO el documento).
        expect(holder.pages[0]).toBeGreaterThanOrEqual(3)
        expect(holder.names[0]).toBe('dossier-constanza-salgado-2026-07_2026-09.pdf')

        // Contenido propio del modo mes (R14/R15): eyebrow numerado, chip del mes sin score,
        // período en la meta-línea, subtítulos resueltos por el modelo y marca de récord nuevo.
        const txt = pdfText(holder.captured[0])
        expect(txt).toContain('INFORME MENSUAL DEL ALUMNO · 1 DE 3')
        expect(txt).toContain('INFORME MENSUAL DEL ALUMNO · 3 DE 3')
        expect(txt).toContain('JUL 2026')
        expect(txt).toContain('Período 1–31 jul 2026')
        expect(txt).toContain('Período 1–15 sep 2026')
        expect(txt).not.toContain('SCORE')
        expect(txt).not.toContain('Racha')
        // Tiles del período y títulos con el mes, no «30D» ni «Adherencia semanal».
        expect(txt).toContain('PESO · JUL 2026')
        expect(txt).toContain('RÉCORDS NUEVOS · JUL 2026')
        expect(txt).toContain('VOLUMEN POR GRUPO \\(JUL 2026\\)')
        expect(txt).not.toContain('VOLUMEN POR GRUPO \\(30D\\)')
        expect(txt).not.toContain('Adherencia semanal')
        // Programa: subtítulo del modelo, nunca «Semana 0/1 · 0 días restantes».
        expect(txt).toContain('Semanas 3–7 de 12')
        expect(txt).not.toContain('días restantes')
        // Récord nuevo marcado + leyenda; el que NO supera el máximo previo va sin marca.
        expect(txt).toContain('\\(nuevo\\)')
        expect(txt).toContain('\\(nuevo\\): supera el máximo de los meses anteriores.')
        // Nutrición del mes: línea del modelo, sin «N franjas por día» ni chips en «—».
        expect(txt).toContain('12 de 20 días registrados')
        expect(txt).not.toContain('franjas por día')
        expect(txt).not.toContain('KCAL')
    })

    it('mes vacío ⇒ los 4 estados vacíos hablan del PERÍODO, con el texto exacto de RN', async () => {
        resetHolder()

        const dossier = buildClientMonthDossier(emptyMonthReport(), monthOpts({ index: 1, total: 1 }))
        await downloadClientDossierPdf(dossier)

        expect(holder.captured).toHaveLength(1)
        expect(holder.names[0]).toBe('dossier-constanza-salgado-2026-08.pdf')

        const txt = pdfText(holder.captured[0])
        // Paridad literal con el generador HTML de RN: el mismo mes exportado desde el teléfono
        // no puede decir otra cosa.
        expect(txt).toContain('Sin programa ni entrenamientos registrados en el período.')
        expect(txt).toContain('Sin volumen de entrenamiento en el período.')
        expect(txt).toContain('Sin plan de nutrición vigente en el período.')
        expect(txt).toContain('Sin check-ins en el período.')
        // Nada del vocabulario del dossier «de hoy».
        expect(txt).not.toContain('30 días')
        expect(txt).not.toContain('activo asignado')
    })

    it('3 informes mensuales SEPARADOS ⇒ cero save y un zip con 3 PDF adentro', async () => {
        resetHolder()
        const dl = stubBlobDownload()

        try {
            await downloadClientDossierPdf(threeMonthDossiers(), { separate: true })

            // Nada de `doc.save()`: los N PDF viajan dentro del zip.
            expect(holder.captured).toHaveLength(0)
            expect(holder.names).toHaveLength(0)
            expect(dl.blobs).toHaveLength(1)

            const bytes = new Uint8Array(await dl.blobs[0].arrayBuffer())
            const entries = unzipSync(bytes)
            const files = Object.keys(entries).sort()
            expect(files).toEqual([
                'dossier-constanza-salgado-2026-07.pdf',
                'dossier-constanza-salgado-2026-08.pdf',
                'dossier-constanza-salgado-2026-09.pdf',
            ])
            for (const f of files) {
                expect(entries[f].byteLength).toBeGreaterThan(1000)
                // Cabecera PDF real, no un buffer vacío.
                expect(new TextDecoder().decode(entries[f].slice(0, 5))).toBe('%PDF-')
            }
        } finally {
            dl.restore()
        }
    })
})
