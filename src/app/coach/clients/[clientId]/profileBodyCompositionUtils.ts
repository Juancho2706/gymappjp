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

export function bmiFromMetric(weightKg: number, heightCm: number): number | null {
    if (!heightCm || heightCm <= 0 || !weightKg || weightKg <= 0) return null
    const m = heightCm / 100
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
