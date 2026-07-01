import { subDays } from 'date-fns'

/** kg por día (pendiente de regresión lineal). */
export function linearRegressionKgPerDay(
    checkIns: { created_at: string; weight?: number | null | undefined }[]
): number {
    const valid = [...checkIns]
        .filter((c) => c.weight != null && Number(c.weight) > 0)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const cutoff = subDays(new Date(), 30)
    const windowed = valid.filter((c) => new Date(c.created_at) >= cutoff)
    const series = windowed.length >= 2 ? windowed : valid
    if (series.length < 2) return 0
    const t0 = new Date(series[0]!.created_at).getTime()
    const points = series.map((c) => ({
        x: (new Date(c.created_at).getTime() - t0) / 86_400_000,
        y: Number(c.weight),
    }))
    const n = points.length
    let sumX = 0,
        sumY = 0,
        sumXY = 0,
        sumXX = 0
    for (const p of points) {
        sumX += p.x
        sumY += p.y
        sumXY += p.x * p.y
        sumXX += p.x * p.x
    }
    const denom = n * sumXX - sumX * sumX
    if (Math.abs(denom) < 1e-9) return 0
    return (n * sumXY - sumX * sumY) / denom
}

/**
 * Banda de proyección de peso a N semanas (Fase 1 quick-win #4).
 *
 * Reemplaza el número único de extrapolación lineal (`last + slope*días`) por un
 * RANGO ±(|slope|·marginDays) — por defecto ±1 semana de pendiente — para comunicar
 * incertidumbre en vez de falsa precisión. El render pinta la banda + badge "estimado".
 *
 * FUNCIÓN PURA. Devuelve null si no hay peso base. Si la pendiente es ~0 la banda
 * colapsa al punto (low == high == point), lo cual sigue siendo un "estimado" válido.
 */
export function projectedWeightRangeKg(
    lastWeightKg: number | null | undefined,
    slopeKgPerDay: number,
    weeks = 4,
    marginDays = 7
): { low: number; high: number; point: number } | null {
    if (lastWeightKg == null || !isFinite(lastWeightKg)) return null
    const point = lastWeightKg + slopeKgPerDay * (weeks * 7)
    const margin = Math.abs(slopeKgPerDay) * marginDays
    return {
        low: Number((point - margin).toFixed(1)),
        high: Number((point + margin).toFixed(1)),
        point: Number(point.toFixed(1)),
    }
}

export function bmiFromMetric(weightKg: number, heightCm: number): number | null {
    if (!heightCm || heightCm <= 0 || !weightKg || weightKg <= 0) return null
    // Backward-compatible: some profiles store meters (e.g. 1.72) instead of cm.
    const normalizedHeightCm = heightCm < 3 ? heightCm * 100 : heightCm
    if (normalizedHeightCm < 80 || normalizedHeightCm > 260) return null
    const m = normalizedHeightCm / 100
    return weightKg / (m * m)
}

export function bmiCategory(bmi: number): string {
    if (bmi < 18.5) return 'Bajo peso'
    if (bmi < 25) return 'Normal'
    if (bmi < 30) return 'Sobrepeso'
    return 'Obesidad'
}

export function avgEnergySince(
    checkIns: { created_at: string; energy_level?: number | null | undefined }[],
    since: Date
): number | null {
    const levels = checkIns
        .filter((c) => new Date(c.created_at) >= since && c.energy_level != null)
        .map((c) => Number(c.energy_level))
    if (levels.length === 0) return null
    return levels.reduce((a, b) => a + b, 0) / levels.length
}

export function energyColor(level: number | null | undefined): string {
    if (level == null) return 'bg-muted-foreground'
    if (level >= 8) return 'bg-emerald-500'
    if (level >= 5) return 'bg-amber-500'
    return 'bg-rose-500'
}
