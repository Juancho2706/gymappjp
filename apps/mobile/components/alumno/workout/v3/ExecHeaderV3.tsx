import { Pressable, Text, View } from 'react-native'
import { MotiView } from 'moti'
import { List, Settings } from 'lucide-react-native'
import { FONT, TYPE } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import type { ExecTheme } from './exec-theme'

/** Estado de un dot de progreso por ejercicio. */
export type ExecDotState = 'done' | 'now' | 'todo'

/**
 * Header del Ejecutor V3 (E2.1) — traduccion RN del header "Fuerza" del mockup concepto-a-v3-core:
 *  · fila superior: dots de progreso por ejercicio (hecho=lleno, actual=late, futuro=track) + boton
 *    tuerca a la derecha.
 *  · fila inferior: "Ejercicio X de Y" + cronometro de sesion.
 *
 * Dark-only: los colores salen de `exec.surface` (fijos) y de `exec.accent` (dinamico por
 * executor_theme). El dot activo "late" con una animacion sutil de Reanimated (via moti `loop`); con
 * reduce-motion queda estatico y solo lo distingue el color/glow.
 */
export function ExecHeaderV3({
  dots,
  currentExerciseNum,
  totalExercises,
  elapsedLabel,
  exec,
  reducedMotion = false,
  onOpenList,
  onOpenSettings,
}: {
  /** Un estado por ejercicio (block), en orden de render. */
  dots: ExecDotState[]
  currentExerciseNum: number
  totalExercises: number
  elapsedLabel: string
  exec: ExecTheme
  reducedMotion?: boolean
  /** Abre la vista lista "Ver todo" (E2.6) — capa de navegacion sobre el stepper. */
  onOpenList: () => void
  onOpenSettings: () => void
}) {
  const s = exec.surface
  return (
    <View
      className="px-4 pb-3 pt-2"
      style={{ borderBottomWidth: 1, borderBottomColor: s.borderSubtle, backgroundColor: s.appBg }}
    >
      {/* Fila 1 — dots + tuerca */}
      <View className="flex-row items-center gap-3">
        <View className="flex-1 flex-row items-center" style={{ gap: 7 }}>
          {dots.length === 0 ? (
            <View className="h-[9px] flex-1 rounded-full" style={{ backgroundColor: s.dotTrack }} />
          ) : (
            dots.map((state, i) => (
              <ProgressDot key={i} state={state} accent={exec.accent} track={s.dotTrack} reducedMotion={reducedMotion} />
            ))
          )}
        </View>
        <Pressable
          testID="btn-exec-v3-list"
          onPress={onOpenList}
          hitSlop={8}
          className="h-9 w-9 items-center justify-center rounded-[11px]"
          style={{ backgroundColor: s.surface, borderWidth: 1.5, borderColor: s.borderStrong }}
          accessibilityRole="button"
          accessibilityLabel="Ver todos los ejercicios"
        >
          <List size={19} color={s.textMuted} />
        </Pressable>
        <Pressable
          testID="btn-exec-v3-settings"
          onPress={onOpenSettings}
          hitSlop={8}
          className="h-9 w-9 items-center justify-center rounded-[11px]"
          style={{ backgroundColor: s.surface, borderWidth: 1.5, borderColor: s.borderStrong }}
          accessibilityRole="button"
          accessibilityLabel="Ajustes del entrenamiento"
        >
          <Settings size={19} color={s.textMuted} />
        </Pressable>
      </View>

      {/* Fila 2 — contador + cronometro */}
      <View className="mt-2.5 flex-row items-center justify-between gap-2">
        <Text style={{ fontFamily: FONT.uiExtra, fontSize: 12 }} numberOfLines={1}>
          <Text style={{ color: s.text, fontFamily: FONT.uiExtra }}>Ejercicio {currentExerciseNum}</Text>
          <Text style={{ color: s.textMuted, fontFamily: FONT.uiExtra }}> de {totalExercises}</Text>
        </Text>
        <Text style={[TYPE.mono, { color: s.textMuted, fontSize: 12 }]}>{elapsedLabel}</Text>
      </View>
    </View>
  )
}

/**
 * Un dot de progreso (segmento). `done` = acento suave; `now` = acento pleno con glow que late;
 * `todo` = track apagado. El "late" es un glow absoluto que pulsa opacidad+escala en loop (moti),
 * gateado por reduce-motion.
 */
function ProgressDot({
  state,
  accent,
  track,
  reducedMotion,
}: {
  state: ExecDotState
  accent: string
  track: string
  reducedMotion: boolean
}) {
  const barColor = state === 'now' ? accent : state === 'done' ? hexToRgba(accent, 0.55) : track
  const beats = state === 'now' && !reducedMotion
  return (
    <View className="relative h-[9px] flex-1 justify-center">
      {state === 'now' && (
        // Glow del dot activo. Con reduce-motion queda fijo (sin loop); con motion pulsa suavemente.
        <MotiView
          pointerEvents="none"
          className="absolute rounded-full"
          style={{ top: -3, bottom: -3, left: -3, right: -3, backgroundColor: hexToRgba(accent, 0.28) }}
          from={{ opacity: beats ? 0.5 : 0.32, scale: 1 }}
          animate={{ opacity: beats ? 0.15 : 0.32, scale: beats ? 1.12 : 1 }}
          transition={beats ? { type: 'timing', duration: 900, loop: true, repeatReverse: true } : { type: 'timing', duration: 0 }}
        />
      )}
      <View className="h-[9px] w-full rounded-full" style={{ backgroundColor: barColor }} />
    </View>
  )
}
