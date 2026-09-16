/**
 * Los 6 cuadros KPI del dossier «de hoy», precomputados (R14).
 *
 * Reproducen EXACTAMENTE lo que hoy imprime el generador web (`client-dossier-pdf.ts`,
 * grid 2×3): mismos rótulos, mismos valores, mismos subtítulos y mismos umbrales de color.
 * Existen para que ambos generadores lean SIEMPRE `dossier.tiles` (venga del modo mes o de
 * esta función) y no haya dos copias de la misma regla.
 *
 * Nota de paridad: el tile 5 de RN hoy dice «Nutrición 30d» con datos V1 (bug preexistente
 * anotado en TASKS §Backlog, R22). La verdad es la web — V2, «Nutrición semana» —, así que es
 * la que se reproduce acá.
 */

import type { ClientDossierData, DossierTile, DossierTone } from './types'

/** Umbrales de color de adherencia: ≥80 verde, ≥50 ámbar, resto rojo. `null` ⇒ gris. */
export function adherenceTone(pct: number | null | undefined): DossierTone {
    if (pct == null) return 'muted'
    return pct >= 80 ? 'success' : pct >= 50 ? 'warning' : 'danger'
}

/**
 * Δ de peso del dossier de hoy. Dead-band ±0.05 idéntico al de la tabla de check-ins: sin él,
 * un +0.03 renderiza «+0.0 kg» en ámbar.
 */
export function weightDeltaTile(deltaKg: number | null | undefined): { sub: string; tone: DossierTone } {
    if (deltaKg == null || Math.abs(deltaKg) <= 0.05) return { sub: 'sin cambio', tone: 'muted' }
    if (deltaKg > 0) return { sub: `+${Math.abs(deltaKg).toFixed(1)} kg`, tone: 'warning' }
    return { sub: `${deltaKg.toFixed(1)} kg`, tone: 'success' }
}

/** Los 6 tiles del dossier «de hoy». Función PURA. */
export function buildTodayTiles(d: ClientDossierData): DossierTile[] {
    const m = d.metrics
    const weight = weightDeltaTile(m.weightDeltaKg)
    const nutriPct = m.nutritionWeeklyInRangePct

    return [
        {
            label: 'Peso',
            value: m.currentWeightKg != null ? `${m.currentWeightKg} kg` : '—',
            sub: weight.sub,
            tone: weight.tone,
        },
        {
            label: 'Adherencia semanal',
            value: `${m.adherenceWeeklyPct}%`,
            sub: 'entrenamientos',
            tone: adherenceTone(m.adherenceWeeklyPct),
        },
        {
            label: 'Racha',
            value: `${d.identity.streakDays}`,
            sub: 'días seguidos',
            tone: 'accent',
        },
        {
            label: 'Workouts semana',
            value: `${m.workoutsDone}/${m.workoutsTarget}`,
            sub: 'esta semana',
            tone: 'mid',
        },
        {
            // Nutrición V2: días de la semana en rango. «—» cuando no hay plan V2 vigente.
            label: 'Nutrición semana',
            value: nutriPct == null ? '—' : `${nutriPct}%`,
            sub: nutriPct == null ? 'sin plan vigente' : 'días en rango',
            tone: adherenceTone(nutriPct),
        },
        {
            label: 'Check-ins',
            value: `${m.checkInCompliancePct}%`,
            sub: 'cumplimiento',
            tone: adherenceTone(m.checkInCompliancePct),
        },
    ]
}
