/**
 * Fuente única de porcentajes P/C/G para el "MacroSpark" (Cabina v2) — lógica PURA compartida
 * web/RN. Convierte gramos de proteína/carbos/grasas en el reparto porcentual entero que pinta la
 * barra de tres segmentos. Sin React ni red: testeable en aislamiento.
 *
 * Reglas (PLAN §1):
 * - Aportes calóricos: proteína y carbos ×4, grasas ×9, sobre `max(0, x ?? 0)` (clamp negativos y
 *   nulls a 0 antes de multiplicar).
 * - Si la suma de aportes es 0 (sin macros o los tres en 0/null) → `{p:0,c:0,g:0}` — la barra pinta
 *   solo el track vacío.
 * - En el resto, porcentajes ENTEROS que suman EXACTAMENTE 100 vía redondeo por resto mayor
 *   (largest remainder method): se toma el piso de cada porcentaje y el remanente hasta 100 se
 *   reparte de a 1 punto a los macros con la mayor parte fraccionaria descartada, en orden
 *   P → C → G para desempatar.
 */

export interface MacroShares {
  p: number
  c: number
  g: number
}

const ZERO_SHARES: MacroShares = { p: 0, c: 0, g: 0 }

export function macroCalorieShares(
  proteinG: number | null,
  carbsG: number | null,
  fatsG: number | null,
): MacroShares {
  const proteinKcal = Math.max(0, proteinG ?? 0) * 4
  const carbsKcal = Math.max(0, carbsG ?? 0) * 4
  const fatsKcal = Math.max(0, fatsG ?? 0) * 9
  const totalKcal = proteinKcal + carbsKcal + fatsKcal

  if (totalKcal <= 0) return ZERO_SHARES

  const contributions = [proteinKcal, carbsKcal, fatsKcal]
  const raw = contributions.map((kcal) => (kcal / totalKcal) * 100)
  const floors = raw.map((n) => Math.floor(n))
  const remainder = 100 - floors.reduce((sum, n) => sum + n, 0)

  // Reparte el remanente (0..2) a los macros con mayor parte fraccionaria descartada;
  // empate → orden estable P, C, G (índice ascendente).
  const order = raw
    .map((n, i) => ({ i, frac: n - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)

  const result = [...floors]
  for (let k = 0; k < remainder; k += 1) {
    result[order[k].i] += 1
  }

  return { p: result[0], c: result[1], g: result[2] }
}
