import { useState } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { AnimatePresence, MotiView } from 'moti'
import { ChevronDown, HelpCircle, X } from 'lucide-react-native'
import { FONT } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { haptics } from '../../../../lib/haptics'
import type { ExecTheme } from './exec-theme'

/**
 * Panel de ESFUERZO compacto del ejecutor V3 (hero de FUERZA) — traducción RN del `.a3a-effort` del
 * mockup concepto-a-v3-core (pantalla FUERZA). Reemplaza las dos escalas `EffortScale` apiladas por el
 * formato del contrato: header "Esfuerzo" + tag "Opcional" + pills toggle RPE/RIR, y UNA sola escala de
 * ticks (el seleccionado se agranda + late). El eje mostrado se alterna con las pills.
 *
 * PRESENTACIONAL: no toca el motor. Recibe los valores (rpe/rir) y los callbacks `onSelectRpe/onSelectRir`,
 * que en el hero apuntan al MISMO `patch({rpe|rir})` de `ActiveSetRow` (draft + payload intactos). El
 * esfuerzo sigue siendo OPCIONAL: la serie se completa sin tocarlo.
 *
 * RPE = 1..10 (10 ticks). RIR = 0..10 (11 ticks, decisión CEO 8: 0 = al fallo) cuando `allowZeroRir`.
 */

const RPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const RIR_VALUES_ZERO = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const RIR_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export function EffortTicksV3({
  exec,
  rpe,
  rir,
  onSelectRpe,
  onSelectRir,
  allowZeroRir = false,
  reducedMotion = false,
  expanded,
  onToggleExpanded,
}: {
  exec: ExecTheme
  rpe: number | null
  rir: number | null
  onSelectRpe: (v: number) => void
  onSelectRir: (v: number) => void
  allowZeroRir?: boolean
  reducedMotion?: boolean
  /**
   * Panel COLAPSADO por default (QA2 hallazgo 3). El estado real lo levanta `ExerciseScreenV3`
   * (por-ejercicio → persiste entre series, colapsa al cambiar de ejercicio). Sin la prop, estado local.
   */
  expanded?: boolean
  onToggleExpanded?: (v: boolean) => void
}) {
  const s = exec.surface
  // Eje visible. Arranca en RPE salvo que sólo el RIR tenga valor (respeta lo ya capturado).
  const [view, setView] = useState<'rpe' | 'rir'>(rir != null && rpe == null ? 'rir' : 'rpe')
  const [localExpanded, setLocalExpanded] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const isOpen = expanded ?? localExpanded
  const setOpen = (v: boolean) => { if (onToggleExpanded) onToggleExpanded(v); else setLocalExpanded(v) }

  const isRpe = view === 'rpe'
  const values = isRpe ? RPE_VALUES : allowZeroRir ? RIR_VALUES_ZERO : RIR_VALUES
  const current = isRpe ? rpe : rir
  const onSelect = isRpe ? onSelectRpe : onSelectRir
  const endLo = isRpe ? '1' : allowZeroRir ? '0' : '1'
  const endHi = '10'
  const hasValue = rpe != null || rir != null
  // Al tocar una pill: expande (si estaba colapsada) y fija el eje.
  const pickView = (v: 'rpe' | 'rir') => { setView(v); if (!isOpen) setOpen(true) }

  return (
    <View
      testID="effort-panel-v3"
      style={{
        backgroundColor: s.surfaceSunken,
        borderWidth: 1.5,
        borderColor: s.borderSubtle,
        borderRadius: 14,
        paddingTop: 9,
        paddingHorizontal: 11,
        paddingBottom: isOpen ? 10 : 9,
      }}
    >
      {/* Header: fila compacta clickeable (label + Opcional + chevron) + (?) + pills (si expandido o hay valor) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: isOpen ? 9 : 0 }}>
        <Pressable
          testID="effort-toggle-v3"
          onPress={() => { haptics.tap(); setOpen(!isOpen) }}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          accessibilityRole="button"
          accessibilityState={{ expanded: isOpen }}
          accessibilityLabel={isOpen ? 'Colapsar esfuerzo' : 'Registrar esfuerzo (RPE / RIR, opcional)'}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <Text style={{ fontFamily: FONT.uiExtra, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: '#7f7f8c' }}>
            Esfuerzo
          </Text>
          <View style={{ backgroundColor: '#202029', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 }}>
            <Text style={{ fontFamily: FONT.uiExtra, fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase', color: '#6a6a76' }}>
              Opcional
            </Text>
          </View>
          <MotiView animate={{ rotate: isOpen ? '180deg' : '0deg' }} transition={{ type: 'timing', duration: reducedMotion ? 0 : 200 }}>
            <ChevronDown size={14} color="#7f7f8c" />
          </MotiView>
        </Pressable>
        <Pressable
          testID="effort-help-v3"
          onPress={() => setHelpOpen(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="¿Qué son RPE y RIR?"
          style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 999 }}
        >
          <HelpCircle size={18} color="#7f7f8c" />
        </Pressable>
        {(isOpen || hasValue) && (
          <View style={{ flexDirection: 'row', gap: 8, marginLeft: 'auto' }}>
            <EffortPill kind="RPE" value={rpe} on={isOpen && isRpe} exec={exec} onPress={() => pickView('rpe')} />
            <EffortPill kind="RIR" value={rir} on={isOpen && !isRpe} exec={exec} onPress={() => pickView('rir')} />
          </View>
        )}
      </View>

      {/* Escala de ticks (sólo expandido) — el seleccionado sube a 11px + late. Entra por opacity/translate. */}
      <AnimatePresence>
        {isOpen && (
          <MotiView
            from={reducedMotion ? { opacity: 1, translateY: 0 } : { opacity: 0, translateY: -4 }}
            animate={{ opacity: 1, translateY: 0 }}
            exit={reducedMotion ? { opacity: 0, translateY: 0 } : { opacity: 0, translateY: -4 }}
            transition={{ type: 'timing', duration: reducedMotion ? 0 : 200 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              {values.map((v) => {
                const sel = current === v
                return (
                  <Pressable
                    key={v}
                    testID={`effort-tick-${view}-${v}`}
                    onPress={() => { haptics.select(); onSelect(v) }}
                    hitSlop={{ top: 12, bottom: 12, left: 2, right: 2 }}
                    style={{ flex: 1, height: 11, justifyContent: 'center' }}
                    accessibilityRole="button"
                    accessibilityLabel={`${view.toUpperCase()} ${v}`}
                    accessibilityState={{ selected: sel }}
                  >
                    {sel ? (
                      <MotiView
                        from={{ scale: reducedMotion ? 1 : 0.7 }}
                        animate={{ scale: reducedMotion ? 1 : [1, 1.12, 1] }}
                        transition={{ type: 'timing', duration: reducedMotion ? 0 : 2200, loop: !reducedMotion, repeatReverse: true }}
                        style={{
                          height: 11,
                          borderRadius: 3,
                          backgroundColor: exec.accent,
                          // Glow aproximado (mockup: 0 0 0 3px accent 22%) — sombra tenue del acento.
                          shadowColor: exec.accent,
                          shadowOpacity: 0.55,
                          shadowRadius: 4,
                          shadowOffset: { width: 0, height: 0 },
                          elevation: 3,
                        }}
                      />
                    ) : (
                      <View style={{ height: 7, borderRadius: 3, backgroundColor: '#26262f' }} />
                    )}
                  </Pressable>
                )
              })}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }}>
              <Text style={{ fontFamily: FONT.uiExtra, fontSize: 9, color: '#6a6a76', fontVariant: ['tabular-nums'] }}>{endLo}</Text>
              <Text style={{ fontFamily: FONT.uiExtra, fontSize: 9, color: '#6a6a76', fontVariant: ['tabular-nums'] }}>{endHi}</Text>
            </View>
          </MotiView>
        )}
      </AnimatePresence>

      <EffortHelpSheet exec={exec} open={helpOpen} onClose={() => setHelpOpen(false)} reducedMotion={reducedMotion} />
    </View>
  )
}

/** Mini-sheet oscura V3 que explica RPE y RIR (QA2 hallazgo 3). Mirror del mismo sheet en web. */
function EffortHelpSheet({
  exec,
  open,
  onClose,
  reducedMotion,
}: {
  exec: ExecTheme
  open: boolean
  onClose: () => void
  reducedMotion: boolean
}) {
  const accent = exec.accent
  return (
    <Modal transparent visible={open} animationType="none" onRequestClose={onClose}>
      <Pressable
        testID="effort-help-scrim-v3"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Cerrar ayuda de esfuerzo"
        style={{ flex: 1, backgroundColor: 'rgba(6,6,10,0.66)', justifyContent: 'flex-end', paddingHorizontal: 12, paddingBottom: 24 }}
      >
        <MotiView
          from={reducedMotion ? { opacity: 0 } : { opacity: 0, translateY: 24 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: reducedMotion ? 0 : 220 }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ backgroundColor: '#16161d', borderWidth: 1.5, borderColor: '#2a2a34', borderRadius: 20, padding: 16, gap: 4 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontFamily: FONT.displayBlack, fontSize: 15, letterSpacing: -0.15, color: '#f4f4f6' }}>Esfuerzo</Text>
              <Pressable
                testID="effort-help-close-v3"
                onPress={onClose}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
                style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: '#202029', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={16} color="#9a9aa6" />
              </Pressable>
            </View>
            <HelpRow k="RPE" bold="Esfuerzo percibido:" rest=" qué tan dura se sintió la serie, del 1 al 10 (10 = no podías más)." accent={accent} />
            <View style={{ height: 1, backgroundColor: '#24242e' }} />
            <HelpRow k="RIR" bold="Reps en reserva:" rest=" cuántas repeticiones te quedaban en el tanque (0 = llegaste al fallo)." accent={accent} />
          </Pressable>
        </MotiView>
      </Pressable>
    </Modal>
  )
}

function HelpRow({ k, bold, rest, accent }: { k: string; bold: string; rest: string; accent: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 10 }}>
      <View
        style={{
          alignSelf: 'flex-start',
          borderRadius: 999,
          borderWidth: 1.5,
          paddingHorizontal: 9,
          paddingVertical: 4,
          backgroundColor: hexToRgba(accent, 0.16),
          borderColor: hexToRgba(accent, 0.4),
        }}
      >
        <Text style={{ fontFamily: FONT.uiExtra, fontSize: 11, letterSpacing: 0.4, color: hexToRgba(accent, 0.95) }}>{k}</Text>
      </View>
      <Text style={{ flex: 1, fontFamily: FONT.ui, fontSize: 13, lineHeight: 20, color: '#c1c1cc' }}>
        <Text style={{ fontFamily: FONT.uiBold, color: '#e8e8ee' }}>{bold}</Text>
        {rest}
      </Text>
    </View>
  )
}

/** Pill RPE/RIR: apagada = surface + borde neutro; activa = tinte del acento (mockup `.a3a-epill.on`). */
function EffortPill({
  kind,
  value,
  on,
  exec,
  onPress,
}: {
  kind: 'RPE' | 'RIR'
  value: number | null
  on: boolean
  exec: ExecTheme
  onPress: () => void
}) {
  return (
    <Pressable
      testID={`effort-pill-${kind.toLowerCase()}`}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Ver escala ${kind}`}
      accessibilityState={{ selected: on }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1.5,
        backgroundColor: on ? hexToRgba(exec.accent, 0.16) : '#1c1c24',
        borderColor: on ? hexToRgba(exec.accent, 0.4) : '#33333f',
      }}
    >
      <Text style={{ fontFamily: FONT.uiExtra, fontSize: 11, letterSpacing: 0.4, color: on ? hexToRgba(exec.accent, 0.95) : '#9a9aa6' }}>
        {kind}
      </Text>
      <Text
        style={{
          fontFamily: FONT.uiExtra,
          fontSize: 11,
          color: value != null ? (on ? '#fff' : '#9a9aa6') : '#5f5f6b',
          fontVariant: ['tabular-nums'],
        }}
      >
        {value != null ? String(value) : '—'}
      </Text>
    </Pressable>
  )
}
