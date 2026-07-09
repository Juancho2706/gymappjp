import { Pressable, Text, View } from 'react-native'
import { Check, ChevronRight } from 'lucide-react-native'
import type { ReconciledSessionLog } from '@eva/workout-engine'
import { TYPE } from '../../../lib/typography'

/**
 * Fila de una serie (mobile). Espeja la fila de `LogSetForm` de web pero adaptada al patrón mobile:
 * la serie logueada muestra su marca (verde) y la activa es un tap que abre el TypedKeypad. Cero
 * `TextInput` crudo — el registro pasa 100% por el teclado tipado (contrato de la ola).
 */
export function SetRow({
  setNumber,
  log,
  isActive,
  onPress,
}: {
  setNumber: number
  log?: ReconciledSessionLog
  isActive: boolean
  onPress: () => void
}) {
  const logged = !!log
  const pending = log?._pending === true

  const valueLine = logged
    ? `${log?.reps_done ?? '-'} reps${log?.weight_kg != null ? ` · ${log.weight_kg} kg` : ''}${log?.rpe != null ? ` · RPE ${log.rpe}` : ''}${log?.rir != null ? ` · RIR ${log.rir}` : ''}`
    : 'Tocá para registrar'

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
          <Check size={15} color="#5C9DFF" strokeWidth={2.6} />
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
        <Text
          style={TYPE.mono}
          className={`text-[13px] ${logged ? (pending ? 'text-warning-500' : 'text-on-dark') : 'text-on-dark-muted'}`}
          numberOfLines={1}
        >
          {valueLine}
          {pending ? ' · sin sincronizar' : ''}
        </Text>
      </View>
      {!logged && <ChevronRight size={18} color="#5C9DFF" />}
    </Pressable>
  )
}
