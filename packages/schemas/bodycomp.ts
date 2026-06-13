import { z } from 'zod'

/**
 * Composicion corporal (modulo `body_composition`) — schemas Zod por metodo.
 *
 * Espeja `packages/schemas/workout.ts`: estos schemas se usan en CLIENTE (react-hook-form)
 * y en SERVIDOR (server action) — pilar de validacion de CLAUDE.md.
 *
 * Discriminador `method` ('bia' | 'isak'):
 *  - BIA  -> captura manual del reporte de la maquina; valida `metrics` contra `BiaMetricsSchema`.
 *            NO hay calculo: el server persiste `metrics` tal cual (solo Zod).
 *  - ISAK -> pliegues/perimetros/diametros CRUDOS en `raw_input`; los `metrics` derivados
 *            (Kerr 5C + Heath-Carter + %grasa) los calcula el SERVER con `computeIsak`
 *            (domain/bodycomp), NO el cliente. Por eso el create de ISAK NO acepta `metrics`.
 *
 * Las formas espejan los tipos puros de `apps/web/src/domain/bodycomp/types.ts` (fuente de verdad
 * del calculo). Aqui se acotan rangos fisiologicos y se rechaza payload desconocido (`.strict()`).
 */

// ── helpers de rango ────────────────────────────────────────────────────────
/** Pliegue cutaneo en mm (cáliper): 0–100 mm cubre desde muy magro hasta obesidad severa. */
const skinfoldMm = z.number().positive().max(100)
/** Perimetro en cm: 1–250 (cabeza ~50, cintura/muslo grandes < 200). */
const girthCm = z.number().positive().max(250)
/** Diametro/anchura osea en cm: 1–60 (biacromial ~45, biepicondilos < 20). */
const breadthCm = z.number().positive().max(60)

// ── ISAK: input crudo (raw_input) ───────────────────────────────────────────
export const SkinfoldsSchema = z
    .object({
        tricepsMm: skinfoldMm,
        subscapularMm: skinfoldMm,
        supraspinaleMm: skinfoldMm,
        abdominalMm: skinfoldMm,
        frontThighMm: skinfoldMm,
        medialCalfMm: skinfoldMm,
        bicepsMm: skinfoldMm,
        iliacCrestMm: skinfoldMm,
    })
    .strict()

export const GirthsSchema = z
    .object({
        headCm: girthCm,
        armRelaxedCm: girthCm,
        armFlexedCm: girthCm,
        forearmCm: girthCm,
        chestMesosternaleCm: girthCm,
        waistCm: girthCm,
        thighCm: girthCm,
        calfCm: girthCm,
    })
    .strict()

export const BreadthsSchema = z
    .object({
        biacromialCm: breadthCm,
        biiliocristalCm: breadthCm,
        humerusCm: breadthCm,
        femurCm: breadthCm,
        transverseChestCm: breadthCm,
        apChestDepthCm: breadthCm,
    })
    .strict()

export const IsakRawInputSchema = z
    .object({
        sex: z.enum(['male', 'female']),
        // Requerido por Durnin-Womersley (selecciona banda de edad); opcional para Yuhasz/Faulkner.
        ageYears: z.number().int().min(3).max(120).optional(),
        heightCm: z.number().positive().max(260),
        weightKg: z.number().positive().max(400),
        sittingHeightCm: z.number().positive().max(170),
        skinfolds: SkinfoldsSchema,
        girths: GirthsSchema,
        breadths: BreadthsSchema,
    })
    .strict()

export const BodyFatEquationSchema = z.enum(['durnin_womersley', 'yuhasz', 'faulkner'])

// ── BIA: captura del dispositivo (metrics) ──────────────────────────────────
const biaSegmental = z
    .object({
        rightArm: z.number().min(0).max(100).optional(),
        leftArm: z.number().min(0).max(100).optional(),
        trunk: z.number().min(0).max(100).optional(),
        rightLeg: z.number().min(0).max(100).optional(),
        leftLeg: z.number().min(0).max(100).optional(),
    })
    .strict()

/**
 * BIA = superset OPCIONAL de los campos del reporte (InBody / Tanita / Omron). Todos opcionales:
 * cada dispositivo reporta un subconjunto distinto. `visceralFatAreaCm2` (equipo medico/InBody) y
 * `visceralFatLevel` (consumer Tanita/Omron) son campos SEPARADOS a proposito (escalas distintas).
 */
export const BiaMetricsSchema = z
    .object({
        skeletalMuscleMassKg: z.number().min(0).max(120).optional(),
        fatMassKg: z.number().min(0).max(300).optional(),
        bodyFatPercent: z.number().min(0).max(80).optional(),
        totalBodyWaterL: z.number().min(0).max(150).optional(),
        intracellularWaterL: z.number().min(0).max(100).optional(),
        extracellularWaterL: z.number().min(0).max(100).optional(),
        ecwTbwRatio: z.number().min(0).max(1).optional(),
        visceralFatAreaCm2: z.number().min(0).max(500).optional(),
        visceralFatLevel: z.number().min(0).max(60).optional(),
        basalMetabolicRateKcal: z.number().min(0).max(6000).optional(),
        phaseAngleDeg: z.number().min(0).max(20).optional(),
        segmentalLeanKg: biaSegmental.optional(),
        segmentalFatKg: biaSegmental.optional(),
    })
    .strict()

// ── condiciones de medicion (ambos metodos, opcional) ───────────────────────
export const MeasurementConditionsSchema = z
    .object({
        fasted: z.boolean().optional(),
        hydrationNote: z.string().max(200).optional(),
        timeOfDay: z.string().max(40).optional(),
    })
    .strict()

// ── campos comunes a ambos metodos ──────────────────────────────────────────
const baseFields = {
    clientId: z.string().uuid(),
    measuredAt: z.string().datetime().optional(),
    weightKg: z.number().positive().max(400).nullable().optional(),
    heightCm: z.number().positive().max(260).nullable().optional(),
    deviceBrand: z.string().max(60).nullable().optional(),
    deviceModel: z.string().max(60).nullable().optional(),
    measurementConditions: MeasurementConditionsSchema.optional(),
    notes: z.string().max(1000).nullable().optional(),
}

// ── discriminated union: payload de creacion por metodo ─────────────────────
export const BodyCompositionCreateSchema = z.discriminatedUnion('method', [
    z
        .object({
            method: z.literal('bia'),
            metrics: BiaMetricsSchema,
            ...baseFields,
        })
        .strict(),
    z
        .object({
            method: z.literal('isak'),
            // El cliente envia SOLO los crudos + la ecuacion elegida; los metrics los calcula el server.
            rawInput: IsakRawInputSchema,
            bodyFatEquation: BodyFatEquationSchema.default('durnin_womersley'),
            ...baseFields,
        })
        .strict(),
])

export type IsakRawInputDto = z.infer<typeof IsakRawInputSchema>
export type BiaMetricsDto = z.infer<typeof BiaMetricsSchema>
export type MeasurementConditionsDto = z.infer<typeof MeasurementConditionsSchema>
export type BodyCompositionCreateInput = z.infer<typeof BodyCompositionCreateSchema>
export type BodyFatEquationDto = z.infer<typeof BodyFatEquationSchema>
