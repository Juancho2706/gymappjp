import { Pressable, Text, View } from 'react-native'
import { Check, ChevronRight, CloudOff } from 'lucide-react-native'
import type { ReconciledSessionLog, TypedKeypadMode } from '@eva/workout-engine'
import { FONT, TYPE } from '../../../lib/typography'
import { fmtTypedLoggedLine } from './workout-ui'

const SPORT_400 = '#5C9DFF'
const WARNING_500 = '#F5A524' // --color-warning-500 (serie sin sincronizar)

/**
 * Fila de una serie (mobile). Espeja el chip recap de `LogSetForm` de web: la serie logueada muestra
 * su marca (`{peso} × {reps}` en mono, "×" atenuada) + RPE/RIR, y la activa es un tap que abre el
 * TypedKeypad. El prompt "Tocá para registrar" va en Hanken (sans), NO en mono — el mono se reserva a
 * las métricas (paridad web: la frase es cuerpo, los números son datos).
 *
 * `typedMode` (cardio/movilidad/roller) muta la línea de valores a las columnas `actual_*`/`reps_done`
 * (E2-10). Ausente ⇒ strength (peso × reps · RPE/RIR).
 */
export function SetRow({
  setNumber,
  log,
  isActive,
  typedMode,
  onPress,
}: {
  setNumber: number
  log?: ReconciledSessionLog
  isActive: boolean
  typedMode?: TypedKeypadMode | null
  onPress: () => void
}) {
  const logged = !!log
  const pending = log?._pending === true

  return (
    <Pressable
      testID={`set-row-${setNumber}`}
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-control border px-3 py-2.5 ${
        logged
          ? 'border-sport-500/30 bg-sport-500/[0.06]'
          : isActive
            ? 'border-sport-500/50 bg-white/[0.04]'
            : 'border-inverse/50 bg-white/[0.02]'
      }`}
      accessibilityRole="button"
      accessibilityLabel={logged ? `Editar serie ${setNumber}` : `Registrar serie ${setNumber}`}
    >
      <View
        className={`h-7 w-7 items-center justify-center rounded-full ${
          logged ? 'bg-sport-500/20' : 'bg-white/[0.06]'
        }`}
      >
        {logged ? (
          <Check size={15} color={SPORT_400} strokeWidth={2.6} />
        ) : (
          <Text style={TYPE.mono} className="text-[12px] text-on-dark-muted">
            {setNumber}
          </Text>
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text style={TYPE.eyebrow} className="text-on-dark-muted">
          Serie {setNumber}
        </Text>
        {!logged ? (
          <Text style={TYPE.caption} className="text-[13px] text-on-dark-muted" numberOfLines={1}>
            Tocá para registrar
          </Text>
        ) : typedMode ? (
          <Text
            style={TYPE.mono}
            className={`text-[13px] ${pending ? 'text-warning-500' : 'text-on-dark'}`}
            numberOfLines={1}
          >
            {fmtTypedLoggedLine(log, typedMode)}
          </Text>
        ) : (
          <View className="flex-row flex-wrap items-center gap-x-2">
            <Text
              style={TYPE.mono}
              className={`text-[13px] font-mono-bold ${pending ? 'text-warning-500' : 'text-on-dark'}`}
            >
              {log?.weight_kg ?? '–'}
              <Text className="text-on-dark-muted"> × </Text>
              {log?.reps_done ?? '–'}
            </Text>
            {log?.rpe != null && (
              <Text style={TYPE.mono} className="text-[11px] text-on-dark-muted">RPE {log.rpe}</Text>
            )}
            {log?.rir != null && (
              <Text style={TYPE.mono} className="text-[11px] text-on-dark-muted">RIR {log.rir}</Text>
            )}
          </View>
        )}
      </View>
      {!logged ? (
        <ChevronRight size={18} color={SPORT_400} />
      ) : pending ? (
        <View className="flex-row items-center gap-1">
          <CloudOff size={13} color={WARNING_500} />
          <Text
            style={{ fontFamily: FONT.uiBold, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' }}
            className="text-warning-500"
          >
            Sin sincronizar
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}
