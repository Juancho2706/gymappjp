// Lógica pura de la share-card de RECORD PERSONAL (sin Next/Supabase) — testeable en aislamiento.
// La consume el route handler `app/api/pr-card/route.tsx`.

/** Acepta el color solo si es un hex #RRGGBB válido; si no, cae al fallback. */
export function safeColor(c: string | null | undefined, fallback: string): string {
    return c && /^#[0-9A-Fa-f]{6}$/.test(c) ? c : fallback
}

/** El logo solo se embebe en la card si es un raster http(s) — satori no rasteriza SVG/WebP/AVIF ni data:. */
export function rasterLogo(u: string | null | undefined): string | null {
    if (!u) return null
    const l = u.toLowerCase()
    if (l.startsWith('data:')) return null
    if (/\.(svg|webp|avif)(\?|$)/.test(l)) return null
    if (!/^https?:\/\//.test(u)) return null
    return u
}

/** Peso para display es-CL: coma decimal (82.5 → "82,5"), enteros intactos. */
export function fmtWeight(kg: number): string {
    return String(kg).replace('.', ',')
}

export type PrRow = { weight_kg: number | null; logged_at: string }

export type PrReduction = {
    /** Mayor peso tope de toda la historia (el record). */
    weightKg: number
    /** Instante del set tope el día en que se logró el record por primera vez. */
    achievedAt: string
    /** Record acumulado previo (0 si el record es el primer registro). */
    prevKg: number
    /** Salto sobre el record previo. */
    deltaKg: number
}

/**
 * Reduce los logs crudos de un ejercicio al PR (peso máximo) + delta vs record anterior. Agrupa por
 * día calendario (via `ymdOf`, típicamente Santiago) tomando el peso tope del día; el record = mayor
 * peso tope de la historia y el delta = el último salto del máximo acumulado. Misma semántica que
 * `getExercisePRHistory` (usa `>` estricto → el record apunta a la PRIMERA vez que se alcanzó).
 */
export function reducePrFromRows(rows: PrRow[], ymdOf: (iso: string) => string): PrReduction | null {
    if (rows.length === 0) return null

    type DayAgg = { topWeightKg: number; topAt: string }
    const byDate = new Map<string, DayAgg>()
    for (const r of rows) {
        if (r.weight_kg == null) continue
        const ymd = ymdOf(r.logged_at)
        const cur = byDate.get(ymd)
        if (!cur) {
            byDate.set(ymd, { topWeightKg: r.weight_kg, topAt: r.logged_at })
        } else if (r.weight_kg > cur.topWeightKg) {
            cur.topWeightKg = r.weight_kg
            cur.topAt = r.logged_at
        }
    }

    const history = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
    if (history.length === 0) return null

    let runningMax = 0
    let prevKg = 0
    let bestWeight = 0
    let bestAt = history[0]![1].topAt
    for (const [, v] of history) {
        if (v.topWeightKg > runningMax) {
            prevKg = runningMax
            runningMax = v.topWeightKg
        }
        if (v.topWeightKg > bestWeight) {
            bestWeight = v.topWeightKg
            bestAt = v.topAt
        }
    }

    return {
        weightKg: bestWeight,
        achievedAt: bestAt,
        prevKg,
        deltaKg: Math.round((bestWeight - prevKg) * 10) / 10,
    }
}
