import { Text, View } from 'react-native'
import { AlertTriangle } from 'lucide-react-native'
import { Sheet } from '../Sheet'
import { NutritionMotionButton } from './NutritionV2Kit'
import { useTheme } from '../../context/ThemeContext'

/**
 * Confirmación de "Lo comí" sobre umbral (SPEC cantidades-honestas §4.5, W1.5).
 *
 * Por qué existe: registrar un ítem del plan es UN tap y no había nada entre el tap y las 4.470
 * kcal del "Huevo revuelto 30 un" del plan de Jean. Esto AVISA y no bloquea (misma regla que
 * Atwater): confirmar corre el flujo de siempre, con el mismo payload y la misma idempotency key
 * — la hoja no toca la mutación, solo la demora un tap.
 *
 * Molde: `PublishConfirmSheet` (`quick-edit/QuickEditSheets.tsx:15`) — `Sheet` nativeModal
 * (gorhom vetado bajo reanimated 4) con `dynamicSizing` y los dos `NutritionMotionButton` de
 * 44 pt apilados.
 */
export function ImplausibleIntakeSheet({
  open,
  pending = false,
  title,
  body,
  items,
  confirmLabel = 'Registrar',
  onConfirm,
  onClose,
}: {
  open: boolean
  /** Mutación en vuelo: bloquea los dos botones y pinta el spinner en el primario. */
  pending?: boolean
  title: string
  /** Una línea que explica POR QUÉ preguntamos (`prescribedItemImplausibleCopy` o su par bulk). */
  body: string
  /** Nombres de los ítems sospechosos, cuando la confirmación cubre varios (bulk). */
  items?: string[]
  confirmLabel?: string
  onConfirm: () => void
  onClose: () => void
}) {
  const { theme } = useTheme()
  return (
    <Sheet open={open} onClose={onClose} nativeModal dynamicSizing title={title} accessibilityLabel={title}>
      <View className="flex-row items-start gap-2 rounded-control border border-warning-500/30 bg-warning-500/10 px-3 py-2.5">
        <AlertTriangle color={theme.warning} size={16} style={{ marginTop: 2 }} />
        <Text className="min-w-0 flex-1 text-sm leading-5 text-warning-700">{body}</Text>
      </View>

      {items && items.length > 0 ? (
        <View className="mt-2 gap-1">
          {items.map((name) => (
            <Text key={name} className="text-sm leading-5 text-body">
              · {name}
            </Text>
          ))}
        </View>
      ) : null}

      <View className="mt-3 gap-3">
        <NutritionMotionButton
          accessibilityLabel={confirmLabel}
          pending={pending}
          disabled={pending}
          onPress={onConfirm}
        >
          {confirmLabel}
        </NutritionMotionButton>
        <NutritionMotionButton
          accessibilityLabel="Cancelar el registro"
          tone="neutral"
          disabled={pending}
          onPress={onClose}
        >
          Cancelar
        </NutritionMotionButton>
      </View>
    </Sheet>
  )
}
