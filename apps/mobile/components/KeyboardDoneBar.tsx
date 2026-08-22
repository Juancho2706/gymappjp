import { InputAccessoryView, Keyboard, Platform, Pressable, Text, View } from 'react-native'
import { useTheme } from '../context/ThemeContext'

/**
 * Barra «Listo» sobre el teclado NUMÉRICO de iOS.
 *
 * Los teclados `decimal-pad` / `number-pad` de iOS no traen tecla de retorno: sin esta barra la
 * única forma de cerrarlos es tocar un hueco vacío o arrastrar la lista, y en el editor de pautas
 * (QA del owner 22-08, reporte de un coach en iPhone) casi todo lo tocable es un botón, así que el
 * teclado «no se baja». Android sí trae su tecla ✓ (y el botón atrás), por eso acá no pinta nada.
 *
 * Uso: montar `<KeyboardDoneBar />` UNA vez dentro del árbol de la pantalla (si el input vive en un
 * `Modal`, dentro del Modal: el accessory se resuelve por `nativeID` dentro de esa ventana) y poner
 * `inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}` en cada `TextInput` numérico.
 */
export const NUMERIC_KEYBOARD_ACCESSORY_ID = 'eva-numeric-keyboard-done'

export function KeyboardDoneBar({ label = 'Listo' }: { label?: string }) {
  const { theme } = useTheme()
  if (Platform.OS !== 'ios') return null
  return (
    <InputAccessoryView nativeID={NUMERIC_KEYBOARD_ACCESSORY_ID} backgroundColor={theme.card}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderTopWidth: 1,
          borderTopColor: theme.border,
          backgroundColor: theme.card,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() => Keyboard.dismiss()}
          hitSlop={8}
          style={{ minHeight: 36, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 999 }}
        >
          <Text style={{ color: theme.primary, fontSize: 16, fontWeight: '700' }}>{label}</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  )
}
