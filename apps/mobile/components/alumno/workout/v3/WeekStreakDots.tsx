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
 * Estados del dot (QA6, decision CEO 2026-07-22 — la racha cuenta DIAS ASIGNADOS COMPLETADOS):
 *   · done    — relleno de acento (dia entrenado).
 *   · today   — anillo de acento hueco (hoy, aun sin sesion).
 *   · pending — punto tenue del track CON borde (dia ASIGNADO sin hacer, pasado o futuro; sin culpa).
 *   · rest    — dia SIN asignacion (sin plan ni descanso explicito: ambos persisten igual, sin fila de
 *               plan). NEUTRO: no cuenta al denominador ni corta la cadena, y se pinta DISTINTO — punto
 *               ~7px muy tenue SIN borde — para que la cadena de dias entrenados salte el hueco sin
 *               parecer un eslabon roto (antes rest y pending se veian identicos).
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
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

/**
 * Dot del contrato (.a2-sd, concepto-a-v2): 16px, borde 2px. El `done` (on) rellena de acento con
 * borde y un halo de 3px del acento al 20% (aproximado en RN con un anillo exterior, ya que RN no
 * tiene box-shadow con spread crisp). `pending` (asignado sin hacer) = #26262f con borde #33333f, sin
 * culpa. `rest` (QA6) rompe con el mockup a proposito: dia SIN asignacion = punto ~7px tenue SIN borde.
 */
function Dot({ state, exec }: { state: WeekDotState; exec: ExecTheme }) {
  const accent = exec.accent
  if (state === 'done') {
    return (
      <View
        style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba(accent, 0.2) }}
      >
        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: accent, borderWidth: 2, borderColor: hexToRgba(accent, 0.55) }} />
      </View>
    )
  }
  if (state === 'today') {
    return (
      <View
        style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: hexToRgba(accent, 0.7), backgroundColor: '#26262f' }}
      />
    )
  }
  if (state === 'rest') {
    // Dia SIN asignacion (o descanso explicito): NEUTRO — punto pequeno y tenue, SIN borde de "fallo".
    // Recede para que la cadena de dias asignados salte el hueco sin romperse. Se centra en el ritmo de
    // 16px del track porque la fila usa alignItems:'center'.
    return <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#33333f', opacity: 0.7 }} />
  }
  // pending — dia ASIGNADO sin hacer (pasado o futuro), sin culpa — punto del track con borde tenue.
  return <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#33333f', backgroundColor: '#26262f' }} />
}
