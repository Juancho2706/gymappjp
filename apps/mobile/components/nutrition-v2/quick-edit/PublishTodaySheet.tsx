import { Text, View } from 'react-native'
import { Sheet } from '../../Sheet'
import { NutritionMotionButton } from '../NutritionV2Kit'

/**
 * Paso previo a publicar cuando el alumno YA registró algo hoy (tren «Cantidades honestas», SPEC §6.2,
 * mockup M3, decisión D5 a del owner: «Aplicar hoy» por defecto).
 *
 * Por qué existe: republicar el mismo día rearma el snapshot de hoy con ids nuevos; con el linaje de
 * W3.1 lo que el alumno registró sobre ítems que no cambiaron sigue «Registrado», pero el coach tiene
 * que saberlo ANTES de tocar el día del alumno. «Aplicar desde mañana» deja la versión vigente intacta
 * hoy: cero fantasmas por construcción. Solo se muestra con `entryCount > 0`; el padre decide.
 *
 * Mismo molde que `PublishConfirmSheet` (Sheet nativeModal + `NutritionMotionButton`), copy espejo
 * verbatim del `PublishTodayDialog` web.
 */
export type PublishEffectiveFromChoice = 'today' | 'tomorrow'

export const PUBLISH_TODAY_COPY = {
  title: (slotCount: number, entryCount: number) =>
    slotCount > 0
      ? `Tu alumno ya registró ${slotCount} ${slotCount === 1 ? 'comida' : 'comidas'} hoy`
      : `Tu alumno ya registró ${entryCount} ${entryCount === 1 ? 'alimento' : 'alimentos'} hoy`,
  body: 'Lo que ya registró se conserva. Los ítems que no cambiaste siguen marcados como registrados.',
  applyToday: 'Aplicar hoy',
  applyTomorrow: 'Aplicar desde mañana',
} as const

export function PublishTodaySheet({
  open,
  publishing,
  slotCount,
  entryCount,
  onChoose,
  onClose,
}: {
  open: boolean
  publishing: boolean
  /** Franjas con al menos un registro activo hoy (manda en el copy si > 0). */
  slotCount: number
  /** Registros activos hoy (respaldo del copy cuando no hay franja, p. ej. solo «Fuera del plan»). */
  entryCount: number
  onChoose: (choice: PublishEffectiveFromChoice) => void
  /** Cerrar = seguir editando; nada se publica. */
  onClose: () => void
}) {
  const title = PUBLISH_TODAY_COPY.title(slotCount, entryCount)
  return (
    <Sheet open={open} onClose={onClose} nativeModal dynamicSizing title={title} accessibilityLabel={title}>
      <Text className="text-sm leading-5 text-body">{PUBLISH_TODAY_COPY.body}</Text>
      <View className="mt-2 gap-3">
        <NutritionMotionButton
          accessibilityLabel={PUBLISH_TODAY_COPY.applyToday}
          pending={publishing}
          disabled={publishing}
          onPress={() => onChoose('today')}
        >
          {PUBLISH_TODAY_COPY.applyToday}
        </NutritionMotionButton>
        <NutritionMotionButton
          accessibilityLabel={PUBLISH_TODAY_COPY.applyTomorrow}
          tone="neutral"
          disabled={publishing}
          onPress={() => onChoose('tomorrow')}
        >
          {PUBLISH_TODAY_COPY.applyTomorrow}
        </NutritionMotionButton>
      </View>
    </Sheet>
  )
}
