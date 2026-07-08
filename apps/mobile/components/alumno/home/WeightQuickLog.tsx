import { useState } from 'react'
import { Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { supabase } from '../../../lib/supabase'
import { getTodayInSantiago } from '../../../lib/date-utils'
import { DANGER_600, SUCCESS_500 } from './types'

/**
 * E1-03 WeightQuickLog (web `weight/WeightQuickLog.tsx`): registro rapido de peso
 * al pie del WeightWidget. Inserta un `check_ins` con la fecha de hoy (Santiago) y
 * dispara `onSaved` para refrescar el dashboard. Separador superior sutil.
 */
export function WeightQuickLog({ clientId, onSaved }: { clientId: string; onSaved: () => void }) {
  const { theme } = useTheme()
  const [value, setValue] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function save() {
    setError(null)
    setSuccess(false)
    const w = parseFloat(value.replace(',', '.'))
    if (isNaN(w) || w < 20 || w > 400) {
      setError('Ingresa un peso válido (20–400 kg).')
      return
    }
    setPending(true)
    const { error: err } = await supabase.from('check_ins').insert({
      client_id: clientId,
      date: getTodayInSantiago().iso,
      weight: w,
    })
    setPending(false)
    if (err) {
      setError('No se pudo guardar. Intenta de nuevo.')
      return
    }
    setValue('')
    setSuccess(true)
    onSaved()
  }

  return (
    <View className="border-t border-subtle" style={{ marginTop: 12, paddingTop: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text className="text-muted" style={{ fontFamily: FONT.uiSemibold, fontSize: 10 }}>Peso rápido (kg)</Text>
        <TextInput
          testID="weight-quick-log-input"
          value={value}
          onChangeText={(t) => setValue(t.replace(/[^0-9.,]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="72.5"
          placeholderTextColor={theme.mutedForeground}
          editable={!pending}
          className="rounded-control bg-surface-sunken border-subtle text-strong"
          style={{ height: 44, borderWidth: 1.5, borderColor: theme.border, paddingHorizontal: 12, fontFamily: FONT.uiSemibold, fontSize: 14, color: theme.foreground, fontVariant: ['tabular-nums'] }}
        />
      </View>
      <TouchableOpacity
        testID="weight-quick-log-save"
        onPress={save}
        disabled={pending}
        activeOpacity={0.85}
        className="rounded-control bg-cta-fill"
        style={{ height: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', opacity: pending ? 0.5 : 1 }}
      >
        <Text className="text-on-sport" style={{ fontFamily: FONT.uiBold, fontSize: 12 }}>{pending ? '…' : 'Guardar'}</Text>
      </TouchableOpacity>
      {error ? <Text style={{ width: '100%', fontFamily: FONT.uiSemibold, fontSize: 12, color: DANGER_600 }}>{error}</Text> : null}
      {success ? <Text style={{ width: '100%', fontFamily: FONT.uiSemibold, fontSize: 12, color: SUCCESS_500 }}>Registrado.</Text> : null}
    </View>
  )
}
