/**
 * Banner del día que NO es hoy dentro del tab "Hoy" del alumno (week view).
 *
 * Dice dos cosas y nada más: qué día se está mirando y cómo volver. Hoy es la ÚNICA superficie con
 * registro (decisión del SPEC), así que el pasado y el futuro se muestran en solo lectura; el copy
 * lo explica sin culpa y sin rojo — el pasado no se juzga y el futuro todavía no pasó.
 *
 * Presentacional puro: tokens del DS (superficie hundida + hairline), cero color de marca crudo.
 */
import { Pressable, Text, View } from 'react-native'
import { CalendarDays, RotateCcw } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'

export type ReadOnlyDayBannerProps = {
  /** Fecha `YYYY-MM-DD` que se está mirando. */
  isoDate: string
  /** `past` = ya ocurrió (resultados congelados); `future` = vista previa del plan. */
  tone: 'past' | 'future'
  onBackToToday: () => void
}

/**
 * "lunes, 27 de julio" — fecha larga en español con tildes. Se construye en UTC a propósito: la
 * fecha ya viene resuelta en la zona del alumno y leerla en la zona del dispositivo la correría un
 * día (misma convención que `nutritionDayOfWeekFromIso` del paquete compartido).
 */
function formatLongDayLabel(isoDate: string): string {
  const parsed = Date.parse(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(parsed)) return isoDate
  return new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(parsed))
}

export function ReadOnlyDayBanner({ isoDate, tone, onBackToToday }: ReadOnlyDayBannerProps) {
  const { theme } = useTheme()
  const dayLabel = formatLongDayLabel(isoDate)
  const detail =
    tone === 'past'
      ? 'Solo lectura: hoy es el único día en el que puedes registrar.'
      : 'Vista previa de tu plan: vas a poder registrar cuando llegue el día.'

  return (
    <View
      accessibilityRole="summary"
      className="gap-3 rounded-card border border-subtle bg-surface-sunken p-3"
    >
      <View className="flex-row items-start gap-2">
        <CalendarDays color={theme.textSecondary} size={16} style={{ marginTop: 2 }} />
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold leading-5 text-strong">
            Estás viendo el {dayLabel}
          </Text>
          <Text className="mt-0.5 text-xs leading-5 text-muted">{detail}</Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver a hoy"
        onPress={onBackToToday}
        className="min-h-11 flex-row items-center justify-center gap-2 rounded-control border border-default bg-surface-card px-3 active:opacity-70"
      >
        <RotateCcw color={theme.primary} size={16} />
        <Text className="text-sm font-semibold text-primary">Volver a hoy</Text>
      </Pressable>
    </View>
  )
}
