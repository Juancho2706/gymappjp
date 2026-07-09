/**
 * Helpers de presentación del ejecutor (mobile) — espejo de los helpers inline de
 * `WorkoutExecutionClient`/`SingleExerciseCard` de web (chip de sobrecarga, formato de
 * volumen/cronómetro, parse de descanso). Puros y compartidos por las cards + el header.
 */
import type { EffectiveTarget } from '../../../lib/workout/progression'
import type { PrevSet } from '../../../lib/workout-session'

interface OverloadBlock {
  progression_type: 'weight' | 'reps' | null
  progression_value: number | null
  target_weight_kg: number | null
}

/** Chip compacto de sobrecarga progresiva. null ⇒ sin chip. */
export function overloadChipLabel(
  block: OverloadBlock,
  eff: EffectiveTarget | null,
  currentWeek: number | null | undefined,
): string | null {
  if (!block.progression_type || block.progression_value == null) return null
  if (block.progression_type === 'weight' && block.target_weight_kg == null) return null
  const v = block.progression_value
  if (block.progression_type !== 'weight' || !eff?.modeImplemented) {
    return block.progression_type === 'weight' ? `+${v} kg/sem` : `+${v} rep/ses`
  }
  if (eff.mode === 'double') {
    return eff.status === 'holding' ? `Manten ${eff.weightKg} kg` : `Objetivo ${eff.weightKg} kg`
  }
  if (eff.isProgressed && currentWeek != null) return `Sem ${currentWeek} · ${eff.weightKg} kg`
  return `+${v} kg/sem`
}

/** Explicación completa de la sobrecarga (va a "Detalles"). */
export function overloadDetailText(
  block: OverloadBlock,
  eff: EffectiveTarget | null,
  currentWeek: number | null | undefined,
): string | null {
  if (!block.progression_type || block.progression_value == null) return null
  if (block.progression_type === 'weight' && block.target_weight_kg == null) return null
  const v = block.progression_value
  if (block.progression_type !== 'weight' || !eff?.modeImplemented) {
    return `Sube +${v} ${block.progression_type === 'weight' ? 'kg cada semana' : 'rep cada sesion'}.`
  }
  if (eff.mode === 'double') {
    if (eff.status === 'holding') return `Doble progresion: mante ${eff.weightKg} kg y completa ${eff.repsTopToUnlock} reps en todas las series para subir.`
    if (eff.status === 'progressed') {
      return eff.isProgressed
        ? `Doble progresion: subiste! objetivo ${eff.weightKg} kg (base ${eff.baseWeightKg}).`
        : `Doble progresion: objetivo ${eff.weightKg} kg (aun por debajo de la base ${eff.baseWeightKg}).`
    }
    return `Doble progresion: sube +${v} kg cuando completes ${eff.repsTopToUnlock} reps en todas las series.`
  }
  if (eff.isProgressed && currentWeek != null) return `Semana ${currentWeek}: objetivo ${eff.weightKg} kg (base ${eff.baseWeightKg} +${eff.addedKg}).`
  return `Sube +${v} kg cada semana (esta semana arrancas en la base).`
}

/** Mejor sesión previa (mayor peso) para "Última vez" + autollenado. */
export function bestPrevOf(list: PrevSet[]): PrevSet | null {
  if (!list.length) return null
  return list.reduce((mx, s) => ((s.weight_kg ?? 0) > (mx.weight_kg ?? 0) ? s : mx), list[0])
}

/** Parse de descanso "90s"/"2m"/"90" → segundos. */
export function parseRestTime(restTime: string | null | undefined): number {
  if (!restTime) return 0
  const minMatch = restTime.match(/(\d+)\s*m/i)
  if (minMatch) return parseInt(minMatch[1], 10) * 60
  const match = restTime.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

/** mm:ss desde segundos (cronómetro de sesión). */
export function fmtElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Volumen de sesión compacto (kg → "850 kg" / "5.2 t"). null si 0. */
export function fmtVolume(kg: number): string | null {
  if (kg <= 0) return null
  if (kg >= 1000) return `${(kg / 1000).toFixed(kg >= 10000 ? 0 : 1)} t`
  return `${Math.round(kg)} kg`
}
