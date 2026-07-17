import { Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Lock, RefreshCw } from 'lucide-react-native'
import { Sheet } from '../../Sheet'
import { NutritionMotionButton } from '../NutritionV2Kit'
import { useTheme } from '../../../context/ThemeContext'
import { QUICK_EDIT_COPY, publishConfirmBody } from './microcopy'

/**
 * Sheets criticos del quick-edit — TODOS en Sheet nativeModal (gorhom vetado bajo
 * reanimated 4; regla del diseno §1.3): confirmacion de publicar, conflicto
 * STALE_BASE (recargar = unica salida segura en F1) y upsell Pro suave.
 */

export function PublishConfirmSheet({
  open,
  publishing,
  studentName,
  futureDate,
  onConfirm,
  onClose,
}: {
  open: boolean
  publishing: boolean
  studentName: string
  /** Fecha (YYYY-MM-DD) si la version vigente arranca en el futuro; null = hoy. */
  futureDate: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      nativeModal
      dynamicSizing
      title={QUICK_EDIT_COPY.confirmTitle}
      accessibilityLabel={QUICK_EDIT_COPY.confirmTitle}
    >
      <Text className="text-sm leading-5 text-text-body">
        {publishConfirmBody(studentName, futureDate)}
      </Text>
      <View className="mt-2 gap-3">
        <NutritionMotionButton
          accessibilityLabel={QUICK_EDIT_COPY.confirmCta}
          pending={publishing}
          disabled={publishing}
          onPress={onConfirm}
        >
          {QUICK_EDIT_COPY.confirmCta}
        </NutritionMotionButton>
        <NutritionMotionButton
          accessibilityLabel={QUICK_EDIT_COPY.keepEditing}
          tone="neutral"
          disabled={publishing}
          onPress={onClose}
        >
          {QUICK_EDIT_COPY.keepEditing}
        </NutritionMotionButton>
      </View>
    </Sheet>
  )
}

export function StaleBaseSheet({
  open,
  onReload,
}: {
  open: boolean
  onReload: () => void
}) {
  const { theme } = useTheme()
  return (
    <Sheet
      open={open}
      onClose={onReload}
      nativeModal
      dynamicSizing
      showCloseButton={false}
      title="Plan actualizado en otra sesión"
      accessibilityLabel="Plan actualizado en otra sesión"
    >
      <View className="flex-row items-start gap-2">
        <RefreshCw color={theme.primary} size={18} />
        <Text className="min-w-0 flex-1 text-sm leading-5 text-text-body">{QUICK_EDIT_COPY.stale}</Text>
      </View>
      <View className="mt-2">
        <NutritionMotionButton accessibilityLabel={QUICK_EDIT_COPY.reload} onPress={onReload}>
          {QUICK_EDIT_COPY.reload}
        </NutritionMotionButton>
      </View>
    </Sheet>
  )
}

export function ProUpsellSheet({
  message,
  onClose,
}: {
  message: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const { theme } = useTheme()
  return (
    <Sheet
      open={message !== null}
      onClose={onClose}
      nativeModal
      dynamicSizing
      title="Nutrición Pro"
      accessibilityLabel="Nutrición Pro"
    >
      <View className="flex-row items-start gap-2">
        <Lock color={theme.primary} size={18} />
        <Text className="min-w-0 flex-1 text-sm leading-5 text-text-body">
          {message ?? 'Esta función requiere el complemento Nutrición Pro.'}
        </Text>
      </View>
      <View className="mt-2 flex-row gap-3">
        <NutritionMotionButton accessibilityLabel="Cerrar" tone="neutral" onPress={onClose}>
          Ahora no
        </NutritionMotionButton>
        <View className="flex-1">
          <NutritionMotionButton
            accessibilityLabel="Ver módulos"
            onPress={() => {
              onClose()
              router.push('/coach/modules')
            }}
          >
            Ver módulos
          </NutritionMotionButton>
        </View>
      </View>
    </Sheet>
  )
}
