import { Text, TextInput, View } from 'react-native'
import { Sheet } from '../../Sheet'
import { NutritionMotionButton } from '../NutritionV2Kit'
import { useTheme } from '../../../context/ThemeContext'
import { QUICK_EDIT_COPY } from './microcopy'

/**
 * Sheet de la nota del coach («el globito» — SPEC nutrition-coach-notes, N2/N-C): la MISMA
 * hoja para la nota de franja (`slot.instructions`) y la del grupo de porciones
 * (`target.notes`), espejo RN del `QeBottomSheet` web de N-B. Textarea + contador de
 * caracteres + «Limpiar nota». Cero estado propio del texto: el valor vive en el arbol del
 * editor (dispatch por tecla, misma gramatica que el resto de los campos — N5), asi que
 * draft/undo/publish la tratan como cualquier otra edicion y cerrar el sheet no "guarda"
 * nada: ya estaba guardado. Limpiar = onChange('') (la proyeccion normaliza a null, N-A).
 *
 * `nativeModal`: mismo camino que el resto de las hojas criticas del quick-edit (gorhom
 * vetado bajo reanimated 4, ver `Sheet.nativeModal`); su `KeyboardAvoidingView` interno es
 * el que mantiene visible el textarea con el teclado abierto.
 */
export function CoachNoteSheet({
  open,
  onClose,
  title,
  hint,
  value,
  maxLength,
  placeholder,
  disabled = false,
  error = null,
  onChange,
}: {
  open: boolean
  onClose: () => void
  /** Titulo y nombre accesible del sheet («Nota para Desayuno» / «Nota para Verduras»). */
  title: string
  /** Donde la vera el alumno — la nota no es chat (N4), y decirlo evita esa expectativa. */
  hint: string
  /** Texto CRUDO del arbol (`slot.instructions ?? ''` / `target.notes ?? ''`). */
  value: string
  /** Tope del contrato (`SLOT_INSTRUCTIONS_MAX` / `PORTION_NOTES_MAX`). */
  maxLength: number
  placeholder: string
  disabled?: boolean
  /** Error de validacion local del campo (p.ej. nota sobre el tope en un draft restaurado). */
  error?: string | null
  onChange: (value: string) => void
}) {
  const { theme } = useTheme()
  const hasText = value.trim() !== ''

  return (
    <Sheet
      open={open}
      onClose={onClose}
      nativeModal
      dynamicSizing
      title={title}
      description={hint}
      accessibilityLabel={title}
    >
      <TextInput
        accessibilityLabel={title}
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        autoFocus
        multiline
        maxLength={maxLength}
        textAlignVertical="top"
        placeholder={placeholder}
        placeholderTextColor={theme.mutedForeground}
        className="min-h-28 rounded-control border border-default bg-surface-card px-2.5 py-2 text-sm leading-6 text-body"
      />
      {/* Error a la izquierda (si lo hay) + contador a la derecha. El `maxLength` del input ya
          corta el tipeo en el tope; el contador solo informa cuanto espacio queda. */}
      <View className="flex-row items-center justify-between gap-2">
        {error ? (
          <Text className="min-w-0 flex-1 text-xs font-medium text-danger-600">{error}</Text>
        ) : (
          <View className="min-w-0 flex-1" />
        )}
        <Text
          className="shrink-0 font-mono text-[11px] text-muted"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {QUICK_EDIT_COPY.noteCounter(value.length, maxLength)}
        </Text>
      </View>
      <View className="flex-row gap-3">
        <NutritionMotionButton
          accessibilityLabel={QUICK_EDIT_COPY.noteClear}
          tone="neutral"
          disabled={disabled || !hasText}
          onPress={() => onChange('')}
        >
          {QUICK_EDIT_COPY.noteClear}
        </NutritionMotionButton>
        <View className="flex-1">
          <NutritionMotionButton accessibilityLabel={QUICK_EDIT_COPY.noteDone} onPress={onClose}>
            {QUICK_EDIT_COPY.noteDone}
          </NutritionMotionButton>
        </View>
      </View>
    </Sheet>
  )
}
