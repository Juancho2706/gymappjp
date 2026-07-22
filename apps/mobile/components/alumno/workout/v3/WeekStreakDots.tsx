import { Text, View } from 'react-native'
import { FONT } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import type { ExecTheme } from './exec-theme'
import type { WeeklyStreak, WeekDotState } from './weekly-streak'

/**
 * Racha semanal (E4.4) — fila "RACHA SEMANAL · {copy} · dots Lun→Dom", traduccion RN del `.a2-streak` del
 * mockup concepto-a-v2 (Inicio y Final). Presentacional puro: recibe el `WeeklyStreak` ya derivado
 * (helper `weekly-streak.ts`). Se AUTO-OCULTA (render null) cuando no hay senal honesta que mostrar
 * (`hasSignal === false`) — nunca pinta "0 de 0". Sin guilt-copy: la ausencia de sesion es un dot neutro.
 *
 * Estados del dot:
 *   · done    — relleno de acento (dia entrenado).
 *   · today   — anillo de acento hueco (hoy, aun sin sesion).
 *   · pending — punto tenue del track (dia con plan sin hacer).
 *   · rest    — punto muy tenue mas pequeno (descanso, sin plan).
 */
export function WeekStreakDots({
  streak,
  exec,
  compact = false,
}: {
  streak: WeeklyStreak
  exec: ExecTheme
  /** Variante ligera para el Inicio (sin card, solo la fila). */
  compact?: boolean
}) {
  if (!streak.hasSignal) return null
  const s = exec.surface

  const row = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text
        style={{ fontFamily: FONT.uiExtra, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: s.textMuted }}
      >
        Racha semanal
      </Text>
      <Text style={{ fontFamily: FONT.displayBlack, fontSize: 13, color: s.text, fontVariant: ['tabular-nums'] }}>
        {streak.copy}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginLeft: 'auto' }}>
        {streak.dots.map((d) => (
          <Dot key={d.iso} state={d.state} exec={exec} />
        ))}
      </View>
    </View>
  )

  if (compact) return row

  return (
    <View
      style={{
        backgroundColor: s.surfaceSunken,
        borderWidth: 1.5,
        borderColor: s.border,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      {row}
    </View>
  )
}

function Dot({ state, exec }: { state: WeekDotState; exec: ExecTheme }) {
  const accent = exec.accent
  const track = exec.surface.dotTrack
  if (state === 'done') {
    return <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: accent }} />
  }
  if (state === 'today') {
    return (
      <View
        style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: accent, backgroundColor: hexToRgba(accent, 0.18) }}
      />
    )
  }
  if (state === 'pending') {
    return <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: track }} />
  }
  // rest — punto tenue mas pequeno (descanso).
  return <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: hexToRgba(exec.surface.textDim, 0.5) }} />
}
