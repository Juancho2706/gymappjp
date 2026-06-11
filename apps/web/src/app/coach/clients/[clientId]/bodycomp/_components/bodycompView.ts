import type { BodyCompositionRow } from '@/infrastructure/db/body-composition.repository'
import type { BiaMetrics } from '@/domain/bodycomp'

/**
 * Helpers PUROS de lectura/formato del jsonb `metrics` persistido (sin React, sin IO) —
 * testeables en Vitest. Aislan a la UI del shape del jsonb y NUNCA mezclan metodos (BIA vs ISAK
 * se leen con funciones distintas; las series jamas combinan % grasa de ambos).
 */

export type IsakMetricsView = {
    fractionation: {
        adipose: { kg: number; pct: number }
        muscle: { kg: number; pct: number }
        bone: { kg: number; pct: number }
        residual: { kg: number; pct: number }
        skin: { kg: number; pct: number }
        predictedMassKg: number
        measuredWeightKg: number
        massDifferenceKg: number
    }
    somatotype: { endomorphy: number; mesomorphy: number; ectomorphy: number }
    bodyFat: { equation: string; percent: number; bodyDensity?: number }
    equationUsed: string
}

function num(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function massComponent(v: unknown): { kg: number; pct: number } {
    const o = (v ?? {}) as Record<string, unknown>
    return { kg: num(o.kg), pct: num(o.pct) }
}

/** Lee `metrics` de una fila ISAK. Devuelve null si la forma no es la esperada. */
export function readIsakMetrics(row: BodyCompositionRow): IsakMetricsView | null {
    if (row.method !== 'isak') return null
    const m = row.metrics as Record<string, unknown> | null
    if (!m || typeof m !== 'object' || !m.fractionation) return null
    const f = m.fractionation as Record<string, unknown>
    const s = (m.somatotype ?? {}) as Record<string, unknown>
    const bf = (m.bodyFat ?? {}) as Record<string, unknown>
    return {
        fractionation: {
            adipose: massComponent(f.adipose),
            muscle: massComponent(f.muscle),
            bone: massComponent(f.bone),
            residual: massComponent(f.residual),
            skin: massComponent(f.skin),
            predictedMassKg: num(f.predictedMassKg),
            measuredWeightKg: num(f.measuredWeightKg),
            massDifferenceKg: num(f.massDifferenceKg),
        },
        somatotype: {
            endomorphy: num(s.endomorphy),
            mesomorphy: num(s.mesomorphy),
            ectomorphy: num(s.ectomorphy),
        },
        bodyFat: {
            equation: typeof bf.equation === 'string' ? bf.equation : 'durnin_womersley',
            percent: num(bf.percent),
            ...(typeof bf.bodyDensity === 'number' ? { bodyDensity: bf.bodyDensity } : {}),
        },
        equationUsed: typeof m.equationUsed === 'string' ? m.equationUsed : '',
    }
}

/** Lee `metrics` de una fila BIA (superset opcional capturado del dispositivo). */
export function readBiaMetrics(row: BodyCompositionRow): BiaMetrics {
    if (row.method !== 'bia') return {}
    return (row.metrics as BiaMetrics) ?? {}
}

/** Etiqueta visible "InBody 570 · 05 jun" (dispositivo + fecha). */
export function deviceLabel(row: BodyCompositionRow): string {
    const parts: string[] = []
    if (row.device_brand) parts.push(row.device_brand)
    if (row.device_model) parts.push(row.device_model)
    const device = parts.join(' ')
    const date = new Date(row.measured_at).toLocaleDateString('es-CL', {
        day: '2-digit',
        month: 'short',
    })
    return device ? `${device} · ${date}` : date
}

/**
 * Delta de un valor numerico vs la medicion ANTERIOR del MISMO metodo. `rows` debe venir ordenado
 * (mas reciente primero — como los entrega el repository). Devuelve null si no hay anterior.
 */
export function deltaVsPrev(
    rowsDescByDate: BodyCompositionRow[],
    index: number,
    pick: (row: BodyCompositionRow) => number | null
): number | null {
    const current = pick(rowsDescByDate[index])
    const prev = rowsDescByDate[index + 1] ? pick(rowsDescByDate[index + 1]) : null
    if (current == null || prev == null) return null
    return Math.round((current - prev) * 100) / 100
}

export function formatKg(v: number): string {
    return `${v.toFixed(1)} kg`
}

export function formatPct(v: number): string {
    return `${v.toFixed(1)}%`
}
