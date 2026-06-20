/**
 * Body-composition energy estimation — PURE functions (no IO).
 *
 * Cuando se conoce la masa magra (LBM) o el % de grasa corporal, las ecuaciones
 * basadas en LBM (Katch-McArdle, Cunningham) predicen el BMR/RMR con más
 * precisión que Mifflin-St Jeor, que solo usa peso/altura/edad/sexo. Útil para
 * atletas o alumnos con composición corporal medida (ISAK, DEXA, BIA, pliegues).
 *
 * Sin Next.js / Supabase / React / RN. Reutilizable web + mobile.
 *
 * Referencias:
 * - Katch FI, McArdle WD (1996) — BMR = 370 + 21.6·LBM(kg).
 * - Cunningham JJ (1980/1991) — RMR = 500 + 22·LBM(kg) (sesgo atletas).
 * - LBM = peso · (1 − bodyFat%).
 */

const round = (n: number): number => Math.round(n)

/**
 * BMR vía Katch-McArdle: 370 + 21.6·LBM(kg).
 * Devuelve kcal/día redondeado. LBM <= 0 → 370 (término base, sin negativos).
 */
export function computeKatchMcArdle(leanBodyMassKg: number): number {
  const lbm = Math.max(0, leanBodyMassKg)
  return round(370 + 21.6 * lbm)
}

/**
 * RMR vía Cunningham: 500 + 22·LBM(kg). Tiende a estimar más alto que
 * Katch-McArdle (pensada para población atlética).
 * Devuelve kcal/día redondeado. LBM <= 0 → 500 (término base, sin negativos).
 */
export function computeCunningham(leanBodyMassKg: number): number {
  const lbm = Math.max(0, leanBodyMassKg)
  return round(500 + 22 * lbm)
}

/**
 * Masa magra (kg) a partir de peso y % de grasa corporal.
 *   LBM = weightKg · (1 − bodyFatPct/100)
 *
 * Acepta `bodyFatPct` como porcentaje 0–100 (ej. 18 = 18%). Se clampea a
 * [0, 100] para nunca devolver LBM mayor al peso ni negativa. NO redondea —
 * conserva precisión para encadenar con Katch/Cunningham.
 */
export function leanBodyMassFromBodyFat(weightKg: number, bodyFatPct: number): number {
  const pct = Math.min(100, Math.max(0, bodyFatPct))
  return weightKg * (1 - pct / 100)
}
