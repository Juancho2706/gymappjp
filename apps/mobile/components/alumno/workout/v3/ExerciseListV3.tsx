import { Fragment } from 'react'
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Check, ChevronRight, Undo2, X } from 'lucide-react-native'
import { FONT } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { JuicyButton } from './JuicyButton'
import type { ExecTheme } from './exec-theme'

/** Fila del listado "Ver todo" (E2.6) — una por paso del stepper (bloque suelto o superserie). */
export interface ExerciseListItem {
  key: string
  /** Indice del paso en el stepper (destino del salto). */
  index: number
  /** Seccion del paso (Calentamiento / Bloque principal / …) — encabeza los grupos. */
  sectionTitle: string
  /** Warmup/cooldown ⇒ eyebrow atenuado. */
  muted: boolean
  title: string
  typeLabel: string
  typeColor: string
  doneSets: number
  totalSets: number
  complete: boolean
}

/**
 * Vista lista "Ver todo" del ejecutor V3 (E2.6) — CAPA de navegacion sobre el stepper (Modal fullscreen).
 * El stepper sigue montado DEBAJO (no se desmonta el arbol de captura): esta vista solo lista los
 * ejercicios con su progreso y permite SALTAR a cualquier paso. Secciones con filas compactas por
 * ejercicio (nombre, dots de series hechas/total, chip de tipo); el ejercicio del paso ACTUAL va
 * resaltado con el acento y una insignia "AHORA". Tap en una fila = saltar a ese paso. FAB juicy
 * "Volver al ejercicio" cierra la capa sin cambiar de paso.
 */
export function ExerciseListV3({
  open,
  onClose,
  items,
  currentIndex,
  onJumpTo,
  exec,
  reducedMotion = false,
}: {
  open: boolean
  onClose: () => void
  items: ExerciseListItem[]
  currentIndex: number
  onJumpTo: (index: number) => void
  exec: ExecTheme
  reducedMotion?: boolean
}) {
  const s = exec.surface

  return (
    <Modal
      transparent={false}
      visible={open}
      animationType={reducedMotion ? 'none' : 'slide'}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: s.appBg }}>
        {/* Cabecera */}
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: s.borderSubtle }}
        >
          <Text style={{ fontFamily: FONT.displayBlack, fontSize: 20, letterSpacing: -0.4, color: s.text }}>
            Todos los ejercicios
          </Text>
          <Pressable
            testID="btn-exercise-list-close"
            onPress={onClose}
            hitSlop={8}
            style={{ height: 36, width: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: s.surface, borderWidth: 1.5, borderColor: s.borderStrong }}
            accessibilityRole="button"
            accessibilityLabel="Cerrar la lista de ejercicios"
          >
            <X size={19} color={s.textMuted} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, gap: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {items.map((item, i) => {
            const isNow = item.index === currentIndex
            const prev = items[i - 1]
            const showSection = !prev || prev.sectionTitle !== item.sectionTitle
            return (
              <Fragment key={item.key}>
                {showSection && (
                  <Text
                    style={{ fontFamily: FONT.uiBold, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: item.muted ? s.textDim : hexToRgba(exec.accent, 0.85), marginTop: i === 0 ? 0 : 10, marginBottom: 2 }}
                  >
                    {item.sectionTitle}
                  </Text>
                )}
                <Pressable
                  testID={`exercise-list-row-${item.index}`}
                  onPress={() => onJumpTo(item.index)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderRadius: 16,
                    borderWidth: isNow ? 2 : 1.5,
                    borderColor: isNow ? hexToRgba(exec.accent, 0.6) : s.border,
                    backgroundColor: isNow
                      ? hexToRgba(exec.accent, 0.1)
                      : pressed
                        ? s.surfaceRaised
                        : s.surface,
                  })}
                  accessibilityRole="button"
                  accessibilityLabel={`Ir a ${item.title}, ${item.doneSets} de ${item.totalSets} series${isNow ? ', ejercicio actual' : ''}`}
                >
                  {/* Estado: check si completo, si no dots hechas/total. */}
                  <View style={{ width: 24, alignItems: 'center' }}>
                    {item.complete ? (
                      <View style={{ height: 24, width: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: hexToRgba(exec.accent, 0.2) }}>
                        <Check size={14} color={exec.accent} strokeWidth={2.8} />
                      </View>
                    ) : (
                      <Text style={{ fontFamily: FONT.monoBold, fontSize: 12, color: s.textMuted, fontVariant: ['tabular-nums'] }}>
                        {item.doneSets}/{item.totalSets}
                      </Text>
                    )}
                  </View>

                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <Text style={{ fontFamily: FONT.uiBold, fontSize: 15, color: s.text }} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {/* Dots hechas/total + chip de tipo. */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        {Array.from({ length: Math.min(item.totalSets, 10) }).map((_, d) => (
                          <View
                            key={d}
                            style={{ height: 6, width: 6, borderRadius: 999, backgroundColor: d < item.doneSets ? exec.accent : hexToRgba(s.text, 0.16) }}
                          />
                        ))}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: hexToRgba(item.typeColor, 0.14) }}>
                        <Text style={{ fontFamily: FONT.uiBold, fontSize: 10, color: item.typeColor }}>
                          {item.typeLabel}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Insignia "AHORA" del paso actual, o chevron de salto. */}
                  {isNow ? (
                    <View style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: exec.accent }}>
                      <Text style={{ fontFamily: FONT.uiExtra, fontSize: 10, letterSpacing: 0.6, color: exec.accentText }}>
                        AHORA
                      </Text>
                    </View>
                  ) : (
                    <ChevronRight size={18} color={s.textDim} />
                  )}
                </Pressable>
              </Fragment>
            )
          })}
        </ScrollView>

        {/* FAB juicy "Volver al ejercicio" — cierra la capa sin cambiar de paso. */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <JuicyButton
            testID="btn-back-to-exercise"
            label="Volver al ejercicio"
            onPress={onClose}
            exec={exec}
            reducedMotion={reducedMotion}
            icon={<Undo2 size={18} color={exec.accentText} strokeWidth={2.4} />}
            accessibilityLabel="Volver al ejercicio actual"
          />
        </View>
      </SafeAreaView>
    </Modal>
  )
}
