import { Text, View } from 'react-native'
import { AlertTriangle, RefreshCw } from 'lucide-react-native'
import { Sheet } from '../../Sheet'
import { NutritionMotionButton } from '../NutritionV2Kit'
import { useTheme } from '../../../context/ThemeContext'
import { EDITOR_COPY, QUICK_EDIT_COPY, publishConfirmBody } from './microcopy'

/**
 * Sheets criticos del quick-edit — TODOS en Sheet nativeModal (gorhom vetado bajo
 * reanimated 4; regla del diseno §1.3): confirmacion de publicar, conflicto
 * STALE_BASE (recargar = unica salida segura en F1) y el rechazo de publicacion
 * del servidor.
 */

export function PublishConfirmSheet({
  open,
  publishing,
  studentName,
  futureDate,
  template = false,
  creation = null,
  onConfirm,
  onClose,
}: {
  open: boolean
  publishing: boolean
  studentName: string
  /** Fecha (YYYY-MM-DD) si la version vigente arranca en el futuro; null = hoy. */
  futureDate: string | null
  /** Modo PLANTILLA: se guarda material del coach; nada le llega a un alumno. */
  template?: boolean
  /**
   * Modo CREACION: fecha de vigencia elegida (YYYY-MM-DD) o `null` = hoy. Ausente (`null` de la
   * prop) = edicion, donde el copy habla de "los cambios" sobre la version vigente.
   */
  creation?: { effectiveFrom: string | null } | null
  onConfirm: () => void
  onClose: () => void
}) {
  const title = template
    ? EDITOR_COPY.templateConfirmTitle
    : creation
      ? EDITOR_COPY.createConfirmTitle
      : QUICK_EDIT_COPY.confirmTitle
  const cta = template ? EDITOR_COPY.templateConfirmCta : QUICK_EDIT_COPY.confirmCta
  return (
    <Sheet
      open={open}
      onClose={onClose}
      nativeModal
      dynamicSizing
      title={title}
      accessibilityLabel={title}
    >
      <Text className="text-sm leading-5 text-body">
        {template
          ? EDITOR_COPY.templateConfirmBody
          : creation
            ? EDITOR_COPY.createConfirmBody(studentName, creation.effectiveFrom)
            : publishConfirmBody(studentName, futureDate)}
      </Text>
      <View className="mt-2 gap-3">
        <NutritionMotionButton
          accessibilityLabel={cta}
          pending={publishing}
          disabled={publishing}
          onPress={onConfirm}
        >
          {cta}
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
        <Text className="min-w-0 flex-1 text-sm leading-5 text-body">{QUICK_EDIT_COPY.stale}</Text>
      </View>
      <View className="mt-2">
        <NutritionMotionButton accessibilityLabel={QUICK_EDIT_COPY.reload} onPress={onReload}>
          {QUICK_EDIT_COPY.reload}
        </NutritionMotionButton>
      </View>
    </Sheet>
  )
}

/**
 * Publicación rechazada por el servidor con `UPGRADE_REQUIRED`.
 *
 * OB3 (regla D1 del owner, 2026-08-31: todo está en todos los planes, solo se cobra el cupo de
 * alumnos): antes era `ProUpsellSheet` — candado, título «Nutrición Pro» y un CTA «Ver módulos».
 * Ya no vende ni nombra un tier: es la superficie de un ERROR del servidor, con el mismo tono de
 * mantenimiento que `ModuleOffNotice` (W4.2). Los módulos vienen incluidos con el acceso vigente
 * (`deriveModulesForActiveAccess`), así que este rechazo solo aparece con la cuenta inactiva o con
 * el kill-switch de operador — no hay nada que comprar y no se ofrece ningún camino a pagar.
 */
export function PublishBlockedSheet({
  message,
  onClose,
}: {
  message: string | null
  onClose: () => void
}) {
  const { theme } = useTheme()
  return (
    <Sheet
      open={message !== null}
      onClose={onClose}
      nativeModal
      dynamicSizing
      title="No se pudo publicar"
      accessibilityLabel="No se pudo publicar"
    >
      <View className="flex-row items-start gap-2">
        <AlertTriangle color={theme.warning} size={18} />
        <Text className="min-w-0 flex-1 text-sm leading-5 text-body">
          {message ?? 'Esta función no está disponible en este momento. Tus datos están a salvo.'}
        </Text>
      </View>
      <View className="mt-2">
        <NutritionMotionButton accessibilityLabel="Entendido" tone="neutral" onPress={onClose}>
          Entendido
        </NutritionMotionButton>
      </View>
    </Sheet>
  )
}
