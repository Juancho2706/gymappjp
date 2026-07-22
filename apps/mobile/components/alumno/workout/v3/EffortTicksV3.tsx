import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { MotiView } from 'moti'
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
}: {
  exec: ExecTheme
  rpe: number | null
  rir: number | null
  onSelectRpe: (v: number) => void
  onSelectRir: (v: number) => void
  allowZeroRir?: boolean
  reducedMotion?: boolean
}) {
  const s = exec.surface
  // Eje visible. Arranca en RPE salvo que sólo el RIR tenga valor (respeta lo ya capturado).
  const [view, setView] = useState<'rpe' | 'rir'>(rir != null && rpe == null ? 'rir' : 'rpe')

  const isRpe = view === 'rpe'
  const values = isRpe ? RPE_VALUES : allowZeroRir ? RIR_VALUES_ZERO : RIR_VALUES
  const current = isRpe ? rpe : rir
  const onSelect = isRpe ? onSelectRpe : onSelectRir
  const endLo = isRpe ? '1' : allowZeroRir ? '0' : '1'
  const endHi = '10'

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
        paddingBottom: 10,
      }}
    >
      {/* Header: label + tag Opcional + pills RPE/RIR */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9 }}>
        <Text style={{ fontFamily: FONT.uiExtra, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: '#7f7f8c' }}>
          Esfuerzo
        </Text>
        <View style={{ backgroundColor: '#202029', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 }}>
          <Text style={{ fontFamily: FONT.uiExtra, fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase', color: '#6a6a76' }}>
            Opcional
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginLeft: 'auto' }}>
          <EffortPill kind="RPE" value={rpe} on={isRpe} exec={exec} onPress={() => setView('rpe')} />
          <EffortPill kind="RIR" value={rir} on={!isRpe} exec={exec} onPress={() => setView('rir')} />
        </View>
      </View>

      {/* Escala de ticks — el seleccionado sube a 11px + late */}
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
