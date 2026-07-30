import { useEffect, useState } from 'react'
import { Linking, Platform, Text, TouchableOpacity, View } from 'react-native'
import { MotiView } from 'moti'
import { Check, HeartPulse, Loader, Settings, Wifi } from 'lucide-react-native'
import { FONT } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { haptics } from '../../../../lib/haptics'
import { rssiToBars, type BleErrorKind, type UseBleHr } from '../../../../lib/ble-hr'
import { Sheet } from '../../../Sheet'
import { JuicyButton } from './JuicyButton'
import type { ExecTheme } from './exec-theme'

/**
 * "Conectar sensor de pulso" (E6.1, Ola 6) — traducción del mockup concepto-a-v32-momentos
 * pantalla 3. Sheet con radar de anillos que laten desde un corazón mientras busca, lista de
 * dispositivos encontrados con su señal, CTA Conectar, y nota HONESTA sobre Apple/Galaxy Watch.
 *
 * Degradación honesta: el hook `useBleHr` degrada a `unavailable` en Expo Go — este sheet solo se
 * abre desde CardioScreenV3 cuando `isBleAvailable()`. Sin sensor conectado el BPM NO se muestra;
 * jamás se inventa pulso.
 *
 * QA-4/H6: los errores ya no colapsan a un texto rojo suelto sin salida. Cada causa (`errorKind`)
 * trae su copy y su acción concreta (ajustes de Bluetooth, ajustes de EVA, ubicación) y el CTA
 * principal SIEMPRE ofrece un camino: "Conectar" si hay sensor elegido, "Buscar de nuevo" si no.
 */

const HEART = '#f87171' // == --z5 (rojo del corazón del radar)

/** Acción concreta por causa. `null` = solo texto (iOS no permite deep-link al toggle de Bluetooth). */
function errorAction(kind: BleErrorKind | null): { label: string; run: () => void } | null {
  if (!kind) return null
  const isAndroid = Platform.OS === 'android'
  if (kind === 'unauthorized') {
    return { label: 'Abrir ajustes de EVA', run: () => void Linking.openSettings() }
  }
  if (kind === 'powered-off' && isAndroid) {
    return {
      label: 'Abrir ajustes de Bluetooth',
      run: () => void Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS').catch(() => {}),
    }
  }
  if (kind === 'location-off' && isAndroid) {
    return {
      label: 'Abrir ajustes de ubicación',
      run: () => void Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => {}),
    }
  }
  return null
}

/** Pista extra cuando no hay deep-link posible (iOS con el Bluetooth apagado). */
function errorHint(kind: BleErrorKind | null): string | null {
  if (kind === 'powered-off' && Platform.OS === 'ios') return 'Centro de Control → Bluetooth'
  return null
}

export function ConnectSensorSheet({
  open,
  onClose,
  ble,
  exec,
  reducedMotion = false,
}: {
  open: boolean
  onClose: () => void
  ble: UseBleHr
  exec: ExecTheme
  reducedMotion?: boolean
}) {
  const { state } = ble
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const streaming = state.status === 'streaming'
  const connecting = state.status === 'connecting'
  const scanning = state.status === 'scanning'
  const action = errorAction(state.errorKind)
  const hint = errorHint(state.errorKind)

  // Al abrir: arranca el scan si está ocioso (permisos JUST-IN-TIME viven dentro de startScan).
  // Al cerrar: detiene el scan (nunca corta un stream activo).
  useEffect(() => {
    if (open && (state.status === 'idle' || state.status === 'error')) void ble.startScan()
    if (!open) ble.stopScan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Autoselecciona el primer dispositivo encontrado si no hay uno elegido; y suelta la selección
  // cuando la lista se vacía (un re-scan limpia `devices`: si no, el CTA quedaba apuntando a un id
  // que ya no existe).
  useEffect(() => {
    if (state.devices.length === 0) {
      if (selectedId != null) setSelectedId(null)
      return
    }
    if (selectedId == null) setSelectedId(state.devices[0].id)
  }, [state.devices, selectedId])

  const s = exec.surface

  return (
    <Sheet
      open={open}
      onClose={onClose}
      forceDark
      nativeModal
      title="Conectar sensor de pulso"
      snapPoints={['70%']}
      dynamicSizing
      accessibilityLabel="Conectar sensor de pulso"
    >
      <View style={{ gap: 4 }}>
        {/* Radar: corazón que late + anillos que se expanden mientras busca. */}
        <Radar scanning={state.status === 'scanning' || connecting} reducedMotion={reducedMotion} />

        {streaming ? (
          <ConnectedState name={state.connectedName} bpm={state.bpm} exec={exec} />
        ) : (
          <>
            {state.status === 'scanning' && state.devices.length === 0 ? (
              <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 13, color: s.textMuted, textAlign: 'center', paddingVertical: 8 }}>
                Buscando sensores cercanos…
              </Text>
            ) : null}

            {state.devices.map((d) => {
              const selected = d.id === selectedId
              return (
                <DeviceRow
                  key={d.id}
                  name={d.name}
                  rssi={d.rssi}
                  selected={selected}
                  subtitle={connecting && selected ? 'Conectando…' : rssiLabel(d.rssi)}
                  exec={exec}
                  onPress={() => setSelectedId(d.id)}
                />
              )
            })}

            {state.error ? (
              <View
                style={{
                  gap: 8,
                  padding: 12,
                  marginTop: 4,
                  borderRadius: 15,
                  borderWidth: 1.5,
                  backgroundColor: hexToRgba(HEART, 0.1),
                  borderColor: hexToRgba(HEART, 0.32),
                }}
              >
                <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 12.5, lineHeight: 17, color: hexToRgba(HEART, 0.95) }}>
                  {state.error}
                </Text>
                {hint ? (
                  <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 11, color: s.textMuted }}>{hint}</Text>
                ) : null}
                {action ? (
                  <TouchableOpacity
                    testID="btn-sensor-error-action"
                    onPress={action.run}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={action.label}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 7,
                      minHeight: 40,
                      paddingHorizontal: 12,
                      borderRadius: 11,
                      borderWidth: 1.5,
                      borderColor: hexToRgba(HEART, 0.4),
                      backgroundColor: hexToRgba(HEART, 0.12),
                    }}
                  >
                    <Settings size={14} color={hexToRgba(HEART, 0.95)} />
                    <Text style={{ fontFamily: FONT.uiBold, fontSize: 12.5, color: hexToRgba(HEART, 0.95) }}>
                      {action.label}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </>
        )}

        <View style={{ marginTop: 10 }}>
          {streaming ? (
            <JuicyButton
              testID="btn-sensor-disconnect"
              label="Desconectar"
              onPress={() => void ble.disconnect()}
              exec={exec}
              height={56}
              reducedMotion={reducedMotion}
              accessibilityLabel="Desconectar el sensor"
            />
          ) : (
            <JuicyButton
              testID="btn-sensor-connect"
              label={connecting ? 'Conectando…' : selectedId ? 'Conectar' : scanning ? 'Buscando…' : 'Buscar de nuevo'}
              icon={<HeartPulse size={18} color={exec.accentText} />}
              onPress={() => {
                void haptics.tap()
                // Sin sensor elegido el CTA reintenta la búsqueda: nunca un estado terminal sin salida.
                if (selectedId) void ble.connect(selectedId)
                else void ble.startScan()
              }}
              exec={exec}
              height={56}
              reducedMotion={reducedMotion}
              disabled={connecting || (scanning && !selectedId)}
              accessibilityLabel={selectedId ? 'Conectar al sensor seleccionado' : 'Buscar sensores de nuevo'}
            />
          )}
        </View>

        {/* Nota HONESTA (mockup): qué cubre BLE y qué no. */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8 }}>
          <View style={{ width: 15, height: 15, borderRadius: 999, borderWidth: 1.5, borderColor: s.textDim, marginTop: 1 }} />
          <Text style={{ flex: 1, fontFamily: FONT.uiSemibold, fontSize: 11, lineHeight: 15.4, color: s.textMuted }}>
            Cintas y brazaletes (<Text style={{ fontFamily: FONT.uiBold, color: hexToRgba(s.text, 0.85) }}>Bluetooth estándar</Text>) · Garmin, Coros, Polar y Suunto funcionan activando <Text style={{ fontFamily: FONT.uiBold, color: hexToRgba(s.text, 0.85) }}>“Difundir frecuencia cardíaca”</Text> en el reloj · Apple Watch y Galaxy Watch no transmiten en vivo: llegan con la app del reloj.
          </Text>
        </View>
      </View>
    </Sheet>
  )
}

function rssiLabel(rssi: number | null): string {
  const bars = rssiToBars(rssi)
  if (bars >= 4) return 'BLE · Señal fuerte'
  if (bars >= 2) return 'BLE · Señal buena'
  if (bars >= 1) return 'BLE · Señal débil'
  return 'BLE · Buscando…'
}

// ─── Radar: corazón + anillos que se expanden (Reanimated/Moti) ──────────────────────────────────
function Radar({ scanning, reducedMotion }: { scanning: boolean; reducedMotion: boolean }) {
  return (
    <View style={{ height: 92, alignItems: 'center', justifyContent: 'center', marginVertical: 4 }}>
      {scanning && !reducedMotion
        ? [0, 800, 1600].map((delay) => (
            <MotiView
              key={delay}
              pointerEvents="none"
              from={{ scale: 0.3, opacity: 0.9 }}
              animate={{ scale: 3.1, opacity: 0 }}
              transition={{ type: 'timing', duration: 2400, loop: true, delay, repeatReverse: false }}
              style={{ position: 'absolute', width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: hexToRgba(HEART, 0.65) }}
            />
          ))
        : null}
      {/* Corazón central que late. */}
      <MotiView
        from={{ scale: 1 }}
        animate={{ scale: scanning && !reducedMotion ? 1.12 : 1 }}
        transition={{ type: 'timing', duration: 1000, loop: scanning && !reducedMotion, repeatReverse: true }}
        style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba(HEART, 0.18), borderWidth: 1.5, borderColor: hexToRgba(HEART, 0.4) }}
      >
        <HeartPulse size={22} color={HEART} />
      </MotiView>
    </View>
  )
}

// ─── Fila de dispositivo encontrado ──────────────────────────────────────────────────────────────
function DeviceRow({
  name,
  rssi,
  subtitle,
  selected,
  exec,
  onPress,
}: {
  name: string
  rssi: number | null
  subtitle: string
  selected: boolean
  exec: ExecTheme
  onPress: () => void
}) {
  const s = exec.surface
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 15,
        borderWidth: 1.5,
        backgroundColor: selected ? hexToRgba(exec.accent, 0.08) : s.surfaceRaised,
        borderColor: selected ? hexToRgba(exec.accent, 0.55) : s.border,
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? hexToRgba(exec.accent, 0.16) : s.surfaceRaised, borderWidth: 1.5, borderColor: selected ? hexToRgba(exec.accent, 0.4) : s.borderStrong }}>
        <HeartPulse size={18} color={selected ? HEART : s.textMuted} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: FONT.uiBold, fontSize: 15, color: s.text }} numberOfLines={1}>{name}</Text>
        <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 11, color: s.textMuted, marginTop: 2 }} numberOfLines={1}>{subtitle}</Text>
      </View>
      <SignalBars rssi={rssi} color={selected ? exec.accent : s.textDim} />
      {selected ? <Check size={16} color={exec.accent} strokeWidth={2.6} /> : null}
    </TouchableOpacity>
  )
}

function SignalBars({ rssi, color }: { rssi: number | null; color: string }) {
  const bars = rssiToBars(rssi)
  const heights = [5, 8, 11, 15]
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 15 }}>
      {heights.map((h, i) => (
        <View key={i} style={{ width: 3.5, height: h, borderRadius: 1, backgroundColor: i < bars ? color : '#3a3a45' }} />
      ))}
    </View>
  )
}

// ─── Estado conectado (streaming) ────────────────────────────────────────────────────────────────
function ConnectedState({ name, bpm, exec }: { name: string | null; bpm: number | null; exec: ExecTheme }) {
  const s = exec.surface
  return (
    <View style={{ alignItems: 'center', gap: 8, paddingVertical: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: hexToRgba(HEART, 0.14), borderWidth: 1.5, borderColor: hexToRgba(HEART, 0.35) }}>
        <Wifi size={14} color={HEART} />
        <Text style={{ fontFamily: FONT.uiBold, fontSize: 13, color: hexToRgba(HEART, 0.95) }}>Conectado</Text>
      </View>
      <Text style={{ fontFamily: FONT.uiBold, fontSize: 15, color: s.text }}>{name ?? 'Sensor de pulso'}</Text>
      {bpm != null ? (
        <Text style={{ fontFamily: FONT.displayBlack, fontSize: 40, color: HEART, fontVariant: ['tabular-nums'] }}>
          {bpm} <Text style={{ fontFamily: FONT.uiBold, fontSize: 15, color: s.textMuted }}>bpm</Text>
        </Text>
      ) : (
        <Loader size={20} color={s.textMuted} />
      )}
    </View>
  )
}
