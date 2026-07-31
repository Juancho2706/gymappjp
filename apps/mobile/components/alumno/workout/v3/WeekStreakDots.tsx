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
 *   · done        — relleno de acento (dia entrenado ENTERO: 100% de las series esperadas).
 *   · in_progress — anillo de acento con nucleo pequeno relleno: sesion empezada y sin cerrar (1–99%,
 *                   spec `workout-day-in-progress`). Se lee "arrancado" sin mentir "hecho"; es el mismo
 *                   tercer estado que la day-card de la home ("En progreso").
 *   · today       — anillo de acento hueco (hoy, aun sin sesion).
 *   · pending     — punto tenue del track CON borde (dia ASIGNADO sin hacer, pasado o futuro; sin culpa).
 *   · rest        — dia SIN asignacion (sin plan ni descanso explicito: ambos persisten igual, sin fila de
 *                   plan). NEUTRO: no cuenta al denominador ni corta la cadena, y se pinta DISTINTO — punto
 *                   ~6px muy tenue SIN borde — para que la cadena de dias entrenados salte el hueco sin
 *                   parecer un eslabon roto (antes rest y pending se veian identicos).
 *
 * ANCHO (QA device 360px): la fila es label + copy + 7 dots. Con el copy largo ("7 de 7 esta semana") los
 * tres no caben en 360px, y antes los dots se salian de pantalla en AMBOS call-sites (Inicio y Final).
 * Contrato de reparto: los DOTS nunca encogen (`flexShrink: 0`) — son el dato; label y copy viven en un
 * grupo que SI encoge (el label con mas peso, porque es decorativo) y elipsan a una linea. Los diametros
 * del track se bajaron un punto (halo 20 / dot 14 / gap 7) para que el peor caso quepa sin comerse el copy.
 */
/** Geometria del track (ver nota de ANCHO): peor caso = 7×HALO + 6×GAP = 182px. */
const DOT_HALO = 20
const DOT_CORE = 14
const DOT_TRACK = 14
const DOT_REST = 6
const DOT_GAP = 7

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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {/* Grupo que ENCOGE: label (peso 3, decorativo) + copy (peso 1, el dato legible). `minWidth: 0`
          habilita el shrink real en yoga; sin el, el texto empuja los dots fuera de pantalla. */}
      <View style={{ flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{ flexShrink: 3, fontFamily: FONT.uiExtra, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: s.textMuted }}
        >
          Racha semanal
        </Text>
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{ flexShrink: 1, fontFamily: FONT.displayBlack, fontSize: 13, color: s.text, fontVariant: ['tabular-nums'] }}
        >
          {streak.copy}
        </Text>
      </View>
      <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: DOT_GAP, marginLeft: 'auto' }}>
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
 * Dot del contrato (.a2-sd, concepto-a-v2), reescalado a `DOT_TRACK` (14px, borde 2px) para que los 7
 * quepan en 360px. El `done` (on) rellena de acento con borde y un halo del acento al 20% (aproximado en
 * RN con un anillo exterior, ya que RN no tiene box-shadow con spread crisp). `pending` (asignado sin
 * hacer) = #26262f con borde #33333f, sin culpa. `rest` (QA6) rompe con el mockup a proposito: dia SIN
 * asignacion = punto ~6px tenue SIN borde.
 */
function Dot({ state, exec }: { state: WeekDotState; exec: ExecTheme }) {
  const accent = exec.accent
  if (state === 'done') {
    return (
      <View
        style={{ width: DOT_HALO, height: DOT_HALO, borderRadius: DOT_HALO / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba(accent, 0.2) }}
      >
        <View style={{ width: DOT_CORE, height: DOT_CORE, borderRadius: DOT_CORE / 2, backgroundColor: accent, borderWidth: 2, borderColor: hexToRgba(accent, 0.55) }} />
      </View>
    )
  }
  if (state === 'in_progress') {
    // Mismo diametro que `today` (no rompe el ritmo del track) pero con nucleo relleno: la sesion existe,
    // solo que sin cerrar. Sin halo — ese lo reserva `done`.
    return (
      <View
        style={{ width: DOT_TRACK, height: DOT_TRACK, borderRadius: DOT_TRACK / 2, borderWidth: 2, borderColor: hexToRgba(accent, 0.7), backgroundColor: '#26262f', alignItems: 'center', justifyContent: 'center' }}
      >
        <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: accent }} />
      </View>
    )
  }
  if (state === 'today') {
    return (
      <View
        style={{ width: DOT_TRACK, height: DOT_TRACK, borderRadius: DOT_TRACK / 2, borderWidth: 2, borderColor: hexToRgba(accent, 0.7), backgroundColor: '#26262f' }}
      />
    )
  }
  if (state === 'rest') {
    // Dia SIN asignacion (o descanso explicito): NEUTRO — punto pequeno y tenue, SIN borde de "fallo".
    // Recede para que la cadena de dias asignados salte el hueco sin romperse. Se centra en el ritmo del
    // track porque la fila usa alignItems:'center'.
    return <View style={{ width: DOT_REST, height: DOT_REST, borderRadius: DOT_REST / 2, backgroundColor: '#33333f', opacity: 0.7 }} />
  }
  // pending — dia ASIGNADO sin hacer (pasado o futuro), sin culpa — punto del track con borde tenue.
  return <View style={{ width: DOT_TRACK, height: DOT_TRACK, borderRadius: DOT_TRACK / 2, borderWidth: 2, borderColor: '#33333f', backgroundColor: '#26262f' }} />
}
