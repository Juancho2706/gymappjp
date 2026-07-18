import { useRef, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { supabase } from '../../../lib/supabase'
import { getTodayInSantiago } from '../../../lib/date-utils'

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
  const [focused, setFocused] = useState(false)
  // Guarda de reentrada SINCRONA por ref (patron check-in.tsx:204-205): `disabled={pending}`
  // / `if (pending)` solo surten efecto tras re-render (batching React 18), dejando ventana
  // entre dos taps nativos -> insert duplicado. La ref se lee/setea antes de cualquier await.
  const submittingRef = useRef(false)

  async function save() {
    if (submittingRef.current) return
    setError(null)
    setSuccess(false)
    const w = parseFloat(value.replace(',', '.'))
    if (isNaN(w) || w < 20 || w > 400) {
      setError('Ingresa un peso válido (20–400 kg).')
      return
    }
    submittingRef.current = true
    setPending(true)
    try {
      const { error: err } = await supabase.from('check_ins').insert({
        client_id: clientId,
        date: getTodayInSantiago().iso,
        weight: w,
      })
      if (err) {
        setError('No se pudo guardar. Intenta de nuevo.')
        return
      }
      setValue('')
      setSuccess(true)
      onSaved()
    } finally {
      submittingRef.current = false
      setPending(false)
    }
  }

  return (
    <View className="border-t border-subtle" style={{ marginTop: 12, paddingTop: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text className="text-muted" style={{ fontFamily: FONT.uiSemibold, fontSize: 10 }}>Peso rápido (kg)</Text>
        <TextInput
          testID="weight-quick-log-input"
          value={value}
          onChangeText={(t) => setValue(t.replace(/[^0-9.,]/g, ''))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="decimal-pad"
          placeholder="72.5"
          placeholderTextColor={theme.mutedForeground}
          editable={!pending}
          className="rounded-control bg-surface-sunken border-subtle text-strong"
          // Focus = borde marca (web `focus-visible:border-sport-500`). Fabric #45798:
          // NO condicionar el arbol/wrapper; solo cambia el borderColor del propio input.
          style={{ height: 44, borderWidth: 1.5, borderColor: focused ? theme.primary : theme.border, paddingHorizontal: 12, fontFamily: FONT.uiSemibold, fontSize: 14, color: theme.foreground, fontVariant: ['tabular-nums'] }}
        />
      </View>
      <Pressable
        testID="weight-quick-log-save"
        onPress={save}
        disabled={pending}
        className="rounded-control bg-cta-fill"
        style={({ pressed }) => ({ height: 44, minWidth: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', opacity: pending ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}
      >
        <Text className="text-on-sport" style={{ fontFamily: FONT.uiBold, fontSize: 12 }}>{pending ? '…' : 'Guardar'}</Text>
      </Pressable>
      {error ? <Text className="text-danger-600" style={{ width: '100%', fontFamily: FONT.uiSemibold, fontSize: 12 }}>{error}</Text> : null}
      {success ? <Text className="text-success-700" style={{ width: '100%', fontFamily: FONT.uiSemibold, fontSize: 12 }}>Registrado.</Text> : null}
    </View>
  )
}
