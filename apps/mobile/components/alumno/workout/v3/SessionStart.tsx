import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Play } from 'lucide-react-native'
import { FONT } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { JuicyButton } from './JuicyButton'
import type { ExecTheme } from './exec-theme'

/** Chip de un ejercicio de la mini-lista + su tipo. */
export interface StartExercisePreview {
  name: string
  typeLabel: string
  /** Color del tag de tipo (strength ⇒ acento; cardio/movilidad/roller ⇒ color fijo del META). */
  typeColor: string
}

/** Chip de contexto (semana / fase / variante). `plain` ⇒ neutro (variante). */
export interface StartChip {
  label: string
  plain?: boolean
}

/**
 * Pantalla "Inicio" del ejecutor V3 (E2.2) — traducción RN del `.a3a-start` del mockup
 * concepto-a-v3-core. Da CONTEXTO antes del esfuerzo: eyebrow "Hoy · {día}", título del día, chips
 * (semana/fase/variante — sólo los que existen en los datos, no se inventan), resumen
 * "{N} ejercicios · {M} series · ~{min} min", mini-lista de los primeros ejercicios con su tipo, card
 * "La última vez" (volumen, si hay historial), nota del coach del día (si existe) y el CTA gigante juicy
 * "EMPEZAR" que respira. Si ya hay series logueadas hoy, aparece un botón discreto "Saltar al ejercicio"
 * (sesión a medias → directo al stepper en el paso incompleto).
 *
 * Dark-only vía `exec.surface`; acento vía `exec.accent`. Presentacional puro: todos los derivados
 * (resumen, mini-lista, volumen) los calcula el `ExecutorV3` y llegan como props ya formateadas.
 */
export function SessionStart({
  exec,
  eyebrow,
  dayTitle,
  chips,
  summaryLine,
  exercises,
  moreCount,
  lastVolumeLabel,
  coachNote,
  coachName,
  hasPartialSession,
  reducedMotion = false,
  onStart,
  onSkipToExercise,
}: {
  exec: ExecTheme
  eyebrow: string
  dayTitle: string
  chips: StartChip[]
  summaryLine: string
  exercises: StartExercisePreview[]
  moreCount: number
  lastVolumeLabel: string | null
  coachNote: string | null
  coachName: string
  hasPartialSession: boolean
  reducedMotion?: boolean
  onStart: () => void
  onSkipToExercise: () => void
}) {
  const s = exec.surface

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: s.appBg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Eyebrow "Hoy · {día}" */}
        <View
          style={{
            alignSelf: 'flex-start',
            borderRadius: 999,
            borderWidth: 1.5,
            borderColor: hexToRgba(exec.accent, 0.3),
            backgroundColor: hexToRgba(exec.accent, 0.12),
            paddingHorizontal: 12,
            paddingVertical: 5,
            marginBottom: 12,
          }}
        >
          <Text style={{ fontFamily: FONT.uiExtra, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: exec.accent }}>
            {eyebrow}
          </Text>
        </View>

        {/* Título del día */}
        <Text style={{ fontFamily: FONT.displayBlack, fontSize: 34, letterSpacing: -1, lineHeight: 36, color: s.text, marginBottom: 12 }}>
          {dayTitle}
        </Text>

        {/* Chips de contexto (semana / fase / variante) — sólo los presentes. */}
        {chips.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
            {chips.map((c, i) => (
              <View
                key={`${c.label}-${i}`}
                style={{
                  borderRadius: 999,
                  borderWidth: 1.5,
                  paddingHorizontal: 11,
                  paddingVertical: 5,
                  backgroundColor: c.plain ? s.surfaceRaised : hexToRgba(exec.accent, 0.16),
                  borderColor: c.plain ? s.borderStrong : hexToRgba(exec.accent, 0.34),
                }}
              >
                <Text
                  style={{ fontFamily: FONT.uiBold, fontSize: 12, color: c.plain ? s.textMuted : hexToRgba(exec.accent, 0.95) }}
                >
                  {c.label}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Resumen "{N} ejercicios · {M} series · ~{min} min" */}
        <Text style={{ fontFamily: FONT.uiExtra, fontSize: 13, letterSpacing: 0.1, color: hexToRgba(s.text, 0.85), marginBottom: 16, fontVariant: ['tabular-nums'] }}>
          {summaryLine}
        </Text>

        {/* Mini-lista de los primeros ejercicios + su tipo. */}
        {exercises.length > 0 && (
          <View
            style={{ backgroundColor: s.surface, borderWidth: 2, borderColor: s.border, borderRadius: 18, paddingHorizontal: 6, paddingVertical: 4, marginBottom: 14 }}
          >
            {exercises.map((ex, i) => (
              <View
                key={`${ex.name}-${i}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 11,
                  paddingHorizontal: 10,
                  paddingVertical: 9,
                  borderTopWidth: i === 0 ? 0 : 1.5,
                  borderTopColor: s.borderSubtle,
                }}
              >
                <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: s.borderSubtle, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: FONT.displayBlack, fontSize: 12, color: s.textMuted, fontVariant: ['tabular-nums'] }}>{i + 1}</Text>
                </View>
                <Text style={{ flex: 1, fontFamily: FONT.uiBold, fontSize: 14, color: s.text }} numberOfLines={1}>
                  {ex.name}
                </Text>
                <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: hexToRgba(ex.typeColor, 0.14) }}>
                  <Text style={{ fontFamily: FONT.uiExtra, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: ex.typeColor }}>
                    {ex.typeLabel}
                  </Text>
                </View>
              </View>
            ))}
            {moreCount > 0 && (
              <Text style={{ textAlign: 'center', fontFamily: FONT.uiExtra, fontSize: 11, color: s.textDim, paddingVertical: 5, fontVariant: ['tabular-nums'] }}>
                + {moreCount} ejercicio{moreCount === 1 ? '' : 's'} más
              </Text>
            )}
          </View>
        )}

        {/* Card "La última vez" (volumen) — sólo si hay historial. */}
        {lastVolumeLabel && (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <View style={{ flex: 1, backgroundColor: s.surfaceSunken, borderWidth: 1.5, borderColor: s.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 }}>
              <Text style={{ fontFamily: FONT.uiExtra, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: s.textMuted, marginBottom: 4 }}>
                La última vez
              </Text>
              <Text style={{ fontFamily: FONT.displayBlack, fontSize: 18, letterSpacing: -0.2, color: s.text, fontVariant: ['tabular-nums'] }}>
                {lastVolumeLabel}
              </Text>
            </View>
          </View>
        )}

        {/* Nota del coach del día — sólo si existe. */}
        {coachNote && (
          <View
            style={{
              position: 'relative',
              backgroundColor: hexToRgba(exec.accent, 0.12),
              borderWidth: 1.5,
              borderColor: hexToRgba(exec.accent, 0.26),
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginBottom: 14,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: exec.accent }} />
              <Text style={{ fontFamily: FONT.uiExtra, fontSize: 11, letterSpacing: 0.3, color: exec.accent }} numberOfLines={1}>
                {coachName}
              </Text>
            </View>
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 14, lineHeight: 19, color: hexToRgba(s.text, 0.94) }}>
              {coachNote}
            </Text>
          </View>
        )}

        {/* Empuje al fondo: CTA + saltar. */}
        <View style={{ flex: 1, minHeight: 16 }} />

        {hasPartialSession && (
          <Text
            onPress={onSkipToExercise}
            suppressHighlighting
            accessibilityRole="button"
            accessibilityLabel="Saltar al ejercicio en curso"
            style={{ alignSelf: 'center', fontFamily: FONT.uiExtra, fontSize: 12, letterSpacing: 0.4, color: s.textMuted, paddingVertical: 12, marginBottom: 2 }}
          >
            Saltar al ejercicio
          </Text>
        )}

        <JuicyButton
          testID="btn-start-session-v3"
          label="EMPEZAR"
          onPress={onStart}
          exec={exec}
          height={64}
          fontSize={20}
          breathing
          reducedMotion={reducedMotion}
          accessibilityLabel="Empezar el entrenamiento"
          icon={<Play size={18} color={exec.accentText} fill={exec.accentText} />}
        />
      </ScrollView>
    </SafeAreaView>
  )
}
