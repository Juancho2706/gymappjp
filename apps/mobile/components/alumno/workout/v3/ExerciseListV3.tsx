import { Fragment } from 'react'
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Check, Undo2, X } from 'lucide-react-native'
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
            Plan completo
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
            const state = item.complete ? 'done' : isNow ? 'now' : 'todo'
            const word =
              state === 'done'
                ? `✓ ${item.doneSets}/${item.totalSets}`
                : state === 'now'
                  ? 'ahora'
                  : item.doneSets > 0
                    ? `${item.doneSets}/${item.totalSets}`
                    : 'pendiente'
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
                    // is-now sin borde extra (mockup): solo tiñe el fondo con la marca al 10%.
                    borderWidth: 1.5,
                    borderColor: isNow ? 'transparent' : s.border,
                    backgroundColor: isNow
                      ? hexToRgba(exec.accent, 0.1)
                      : pressed
                        ? s.surfaceRaised
                        : s.surface,
                  })}
                  accessibilityRole="button"
                  accessibilityLabel={`Ir a ${item.title}, ${item.doneSets} de ${item.totalSets} series${isNow ? ', ejercicio actual' : ''}`}
                >
                  {/* Icono de estado (mockup `.a3a-sstate`): hecho = marca + check; ahora = aro de marca +
                      punto; pendiente = cuadro gris hundido. */}
                  <ExecStateIcon state={state} exec={exec} />

                  {/* Nombre (mockup `.snm`, 13/800; actual en blanco). */}
                  <Text
                    style={{ flex: 1, minWidth: 0, fontFamily: FONT.uiExtra, fontSize: 13, color: isNow ? '#fff' : '#d4d4dc' }}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>

                  {/* Palabra de estado (mockup `.ssub`). */}
                  <Text
                    style={{ flexShrink: 0, fontFamily: FONT.uiExtra, fontSize: 11, color: state === 'todo' ? '#7f7f8c' : exec.accent, fontVariant: ['tabular-nums'] }}
                  >
                    {word}
                  </Text>
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

/**
 * Icono de estado de una fila del plan (mockup `.a3a-sstate`, 20px): `done` = cuadro de marca con
 * check (tinta on-accent); `now` = aro de marca con punto; `todo` = cuadro gris hundido. Dark-only.
 */
function ExecStateIcon({ state, exec }: { state: 'done' | 'now' | 'todo'; exec: ExecTheme }) {
  if (state === 'done') {
    return (
      <View style={{ width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: exec.accent }}>
        <Check size={12} color={exec.accentText} strokeWidth={3} />
      </View>
    )
  }
  if (state === 'now') {
    return (
      <View style={{ width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba(exec.accent, 0.25), borderWidth: 2, borderColor: exec.accent }}>
        <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: exec.accent }} />
      </View>
    )
  }
  return <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: '#26262f', borderWidth: 2, borderColor: '#3a3a45' }} />
}
