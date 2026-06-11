import type { Json } from '@/lib/database.types'
import type { IsakRawInput, IsakResult } from '@/domain/bodycomp'
import type { BiaMetricsDto, IsakRawInputDto } from '@eva/schemas/bodycomp'

/**
 * Mappers PUROS form/DTO <-> dominio <-> jsonb persistido. Sin IO, sin Next/Supabase — testeables
 * en Vitest. Garantizan UNA forma estable de los jsonb (`metrics`/`raw_input`) en la DB y que el
 * preview en vivo del cliente y la persistencia server-side usen la MISMA traduccion.
 */

/**
 * DTO ISAK validado -> input de dominio para `computeIsak`. La forma del schema espeja
 * `domain/bodycomp/types.ts`, asi que es una traduccion 1:1 explicita (no un cast ciego):
 * mantenerla literal hace que un drift entre schema y dominio falle en typecheck aqui.
 */
export function isakRawToDomain(dto: IsakRawInputDto): IsakRawInput {
    return {
        sex: dto.sex,
        ageYears: dto.ageYears,
        heightCm: dto.heightCm,
        weightKg: dto.weightKg,
        sittingHeightCm: dto.sittingHeightCm,
        skinfolds: {
            tricepsMm: dto.skinfolds.tricepsMm,
            subscapularMm: dto.skinfolds.subscapularMm,
            supraspinaleMm: dto.skinfolds.supraspinaleMm,
            abdominalMm: dto.skinfolds.abdominalMm,
            frontThighMm: dto.skinfolds.frontThighMm,
            medialCalfMm: dto.skinfolds.medialCalfMm,
            bicepsMm: dto.skinfolds.bicepsMm,
            iliacCrestMm: dto.skinfolds.iliacCrestMm,
        },
        girths: {
            headCm: dto.girths.headCm,
            armRelaxedCm: dto.girths.armRelaxedCm,
            armFlexedCm: dto.girths.armFlexedCm,
            forearmCm: dto.girths.forearmCm,
            chestMesosternaleCm: dto.girths.chestMesosternaleCm,
            waistCm: dto.girths.waistCm,
            thighCm: dto.girths.thighCm,
            calfCm: dto.girths.calfCm,
        },
        breadths: {
            biacromialCm: dto.breadths.biacromialCm,
            biiliocristalCm: dto.breadths.biiliocristalCm,
            humerusCm: dto.breadths.humerusCm,
            femurCm: dto.breadths.femurCm,
            transverseChestCm: dto.breadths.transverseChestCm,
            apChestDepthCm: dto.breadths.apChestDepthCm,
        },
    }
}

/** Input crudo ISAK -> jsonb `raw_input` (los pliegues/perimetros/diametros tal cual, trazables). */
export function isakRawToJson(dto: IsakRawInputDto): Json {
    return dto as unknown as Json
}

/**
 * Resultado ISAK derivado -> jsonb `metrics`. Forma estable y explicita (documenta el contrato
 * de lo que la UI lee de `metrics`). NO se mezcla con BIA: es un payload de metodo distinto.
 */
export function isakResultToMetricsJson(result: IsakResult): Json {
    const f = result.fractionation
    return {
        fractionation: {
            adipose: { kg: f.adipose.kg, pct: f.adipose.pct },
            muscle: { kg: f.muscle.kg, pct: f.muscle.pct },
            bone: { kg: f.bone.kg, pct: f.bone.pct },
            residual: { kg: f.residual.kg, pct: f.residual.pct },
            skin: { kg: f.skin.kg, pct: f.skin.pct },
            predictedMassKg: f.predictedMassKg,
            measuredWeightKg: f.measuredWeightKg,
            massDifferenceKg: f.massDifferenceKg,
        },
        somatotype: {
            endomorphy: result.somatotype.endomorphy,
            mesomorphy: result.somatotype.mesomorphy,
            ectomorphy: result.somatotype.ectomorphy,
        },
        bodyFat: {
            equation: result.bodyFat.equation,
            percent: result.bodyFat.percent,
            ...(result.bodyFat.bodyDensity !== undefined ? { bodyDensity: result.bodyFat.bodyDensity } : {}),
        },
        equationUsed: result.equationUsed,
    } as Json
}

/** Captura BIA -> jsonb `metrics` (sin calculo: solo se valido por Zod aguas arriba). */
export function biaMetricsToJson(metrics: BiaMetricsDto): Json {
    return metrics as unknown as Json
}
