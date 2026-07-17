import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RotateCcw } from 'lucide-react-native'
import { NutritionMotionButton } from '../NutritionV2Kit'
import { useTheme } from '../../../context/ThemeContext'
import { QUICK_EDIT_COPY, dirtyBarLabel } from './microcopy'

/**
 * Barra de publicacion sticky del modo edicion (qe-design §1.2.C adaptado a RN §1.3):
 * contador de cambios + Descartar / Publicar cambios, con safe-area inferior. En error
 * de red/servidor muestra "No se pudo publicar. Reintentar" SIN perder el draft (el
 * reintento reusa la MISMA idempotency key — la maneja el orquestador).
 */
export function PublishBar({
  count,
  publishing,
  errorMessage,
  onDiscard,
  onPublish,
  onRetry,
}: {
  count: number
  publishing: boolean
  errorMessage: string | null
  onDiscard: () => void
  onPublish: () => void
  onRetry: () => void
}) {
  const insets = useSafeAreaInsets()
  const { theme } = useTheme()

  return (
    <View
      className="border-t border-border-subtle bg-surface-app px-4 pt-3"
      style={{ paddingBottom: Math.max(insets.bottom, 8) + 4 }}
    >
      {errorMessage ? (
        <View className="mb-2 flex-row items-center justify-between gap-2 rounded-control border border-danger-500/30 bg-danger-500/10 px-3 py-2">
          <Text className="min-w-0 flex-1 text-xs font-medium text-danger-600">{errorMessage}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={QUICK_EDIT_COPY.retry}
            disabled={publishing}
            onPress={onRetry}
            className="min-h-11 flex-row items-center gap-1.5 rounded-control px-2"
          >
            <RotateCcw color={theme.destructive} size={14} />
            <Text className="text-xs font-bold text-danger-600">{QUICK_EDIT_COPY.retry}</Text>
          </Pressable>
        </View>
      ) : null}

      <View className="flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 text-sm font-semibold text-text-strong" numberOfLines={1}>
          {dirtyBarLabel(count)}
        </Text>
        <NutritionMotionButton
          accessibilityLabel={QUICK_EDIT_COPY.discard}
          tone="neutral"
          disabled={publishing}
          onPress={onDiscard}
        >
          {QUICK_EDIT_COPY.discard}
        </NutritionMotionButton>
        <NutritionMotionButton
          accessibilityLabel={QUICK_EDIT_COPY.publish}
          pending={publishing}
          disabled={publishing || count === 0}
          onPress={onPublish}
        >
          {QUICK_EDIT_COPY.publish}
        </NutritionMotionButton>
      </View>
    </View>
  )
}

/**
 * Snackbar local de Deshacer (5 s, lo temporiza el orquestador): undo LOCAL del draft,
 * nunca toca backend. Flota sobre la barra de publicacion.
 */
export function UndoSnackbar({
  message,
  onUndo,
}: {
  message: string
  onUndo: () => void
}) {
  return (
    <View className="mx-4 mb-2 flex-row items-center justify-between gap-3 rounded-control border border-border-subtle bg-surface-card px-4 py-2 shadow-sm">
      <Text className="min-w-0 flex-1 text-sm text-text-body" numberOfLines={1}>
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={QUICK_EDIT_COPY.undo}
        onPress={onUndo}
        className="min-h-11 items-center justify-center rounded-control px-2"
      >
        <Text className="text-sm font-bold text-primary">{QUICK_EDIT_COPY.undo}</Text>
      </Pressable>
    </View>
  )
}
