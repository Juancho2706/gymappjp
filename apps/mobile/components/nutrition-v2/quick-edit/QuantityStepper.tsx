import { Pressable, TextInput, View } from 'react-native'
import type { TextStyle } from 'react-native'
import { Minus, Plus } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { NUMERIC_KEYBOARD_ACCESSORY_ID } from '../../KeyboardDoneBar'

/**
 * Stepper numerico tactil del quick-edit: input decimal tap-to-edit (selecciona el
 * valor completo al enfocar — nunca borrar a mano) + botones −/+ de 44pt.
 *
 * ANTI-PATRON Fabric respetado: arbol 100% ESTABLE — el TextInput esta SIEMPRE
 * montado y ni el wrapper ni el input cambian estilos/clases por focus. NUNCA slider
 * (qe-benchmark §NN/g).
 *
 * QA T3.v (hallazgo 2 del owner): el stepper y el selector de unidad de la fila se veian
 * desalineados. La caja siempre midio 44 px, pero el NUMERO no estaba centrado dentro de
 * ella: un `TextInput` de alto fijo sin `paddingVertical: 0` hereda el padding vertical
 * propio del EditText de Android, y sin `textAlignVertical: 'center'` la linea se apoya
 * arriba — mientras la unidad de al lado la centra el flexbox. Es el mismo remedio que ya
 * usa el `Input` del DS (components/Input.tsx: caja con alto y `paddingVertical: 0` en el
 * campo). El alto del grupo queda declarado (`h-11`) para que ninguno de los dos controles
 * pueda medir distinto que el otro.
 */

/**
 * Alto del control tactil de la fila cantidad/unidad. Se exporta para que el selector de
 * unidad (EditableItemRow) declare EXACTAMENTE el mismo numero: si algun dia cambia, los dos
 * cambian juntos y no vuelven a desalinearse.
 */
export const QUANTITY_CONTROL_HEIGHT_CLASS = 'h-11'

/**
 * Metricas de texto compartidas por el numero y la unidad. Apagar el font padding de Android
 * en AMBOS deja los dos glifos con el mismo centro optico dentro de la caja de 44 pt; las
 * cifras tabulares evitan que el ancho baile al teclear.
 */
export const QUANTITY_TEXT_METRICS: TextStyle = {
  includeFontPadding: false,
  fontVariant: ['tabular-nums'],
}

/**
 * Estilo del campo numerico: metricas compartidas + el par que centra la linea en Android
 * (`paddingVertical: 0` mata el padding heredado del EditText, `textAlignVertical: 'center'`
 * la apoya al medio). iOS ya centra solo la linea unica de un TextInput con alto fijo.
 */
const inputTextStyle: TextStyle = {
  ...QUANTITY_TEXT_METRICS,
  paddingVertical: 0,
  textAlignVertical: 'center',
}
export function QuantityStepper({
  value,
  onChange,
  onCommit,
  step,
  accessibilityLabel,
  disabled = false,
}: {
  value: string
  onChange: (value: string) => void
  /**
   * La cantidad quedo FIJA (el campo perdio el foco). Lo usa la porcion pegajosa del editor
   * para recordarla; el quick-edit clasico no manda nada y no escribe memoria.
   */
  onCommit?: () => void
  step: number
  accessibilityLabel: string
  disabled?: boolean
}) {
  const { theme } = useTheme()

  const bump = (direction: 1 | -1) => {
    const parsed = Number(String(value).trim())
    const base = Number.isFinite(parsed) ? parsed : 0
    const next = Math.max(0, Math.round((base + direction * step) * 10) / 10)
    onChange(String(next))
  }

  return (
    <View className={`${QUANTITY_CONTROL_HEIGHT_CLASS} shrink-0 flex-row items-center gap-1.5`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Restar ${step} a ${accessibilityLabel}`}
        disabled={disabled}
        onPress={() => bump(-1)}
        className={`${QUANTITY_CONTROL_HEIGHT_CLASS} w-11 items-center justify-center rounded-control border border-default bg-surface-card`}
      >
        <Minus color={theme.foreground} size={16} />
      </Pressable>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        value={value}
        onChangeText={onChange}
        onBlur={onCommit}
        editable={!disabled}
        keyboardType="decimal-pad"
        // Cerrar el teclado (QA owner 22-08): iOS no trae tecla de retorno en el decimal-pad, así
        // que el campo cuelga la barra «Listo» (`KeyboardDoneBar`, montada por la pantalla);
        // Android usa su tecla ✓ (`done` ⇒ blur ⇒ onCommit).
        inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
        returnKeyType="done"
        selectTextOnFocus
        className={`${QUANTITY_CONTROL_HEIGHT_CLASS} w-16 rounded-control border border-default bg-surface-card text-center text-base font-semibold text-strong`}
        // Centrado vertical del numero dentro de la caja de 44 pt (ver cabecera): sin esto
        // Android apoya la linea arriba y el valor queda mas alto que la unidad de al lado.
        // Estilo ESTATICO — jamas funcion (css-interop descartaria el className entero).
        style={inputTextStyle}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Sumar ${step} a ${accessibilityLabel}`}
        disabled={disabled}
        onPress={() => bump(1)}
        className={`${QUANTITY_CONTROL_HEIGHT_CLASS} w-11 items-center justify-center rounded-control border border-default bg-surface-card`}
      >
        <Plus color={theme.foreground} size={16} />
      </Pressable>
    </View>
  )
}
