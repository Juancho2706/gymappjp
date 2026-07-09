import { Text, View } from 'react-native'
import { CalendarDays } from 'lucide-react-native'
import { FONT } from '../../../lib/typography'

const SKY_500 = '#0EA5E9'
const SKY_700 = '#0369A1'

/**
 * FilteredMealsBanner (E4-04, gap 1.6/2.6) — "Hoy ves X de Y comidas del plan…".
 * Espejo del banner sky de la web `NutritionShell`: aparece cuando el plan tiene
 * más comidas de las que aplican al día seleccionado (las demás están fijadas a
 * otro día de la semana). El monolito NO lo tenía.
 */
export function FilteredMealsBanner({ visible, total }: { visible: number; total: number }) {
  if (!(total > visible && visible > 0)) return null
  return (
    <View
      testID="nutrition-filtered-banner"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        borderWidth: 1,
        borderColor: SKY_500 + '33',
        backgroundColor: SKY_500 + '1A',
        borderRadius: 14,
        paddingVertical: 9,
        paddingHorizontal: 14,
      }}
    >
      <CalendarDays size={15} color={SKY_700} strokeWidth={2} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, fontFamily: FONT.uiMedium, fontSize: 12, lineHeight: 17, color: SKY_700 }}>
        Hoy ves {visible} de {total} comidas del plan. Las demás están fijadas a otro día de la semana; prueba otra
        fecha en el calendario o consulta con tu coach.
      </Text>
    </View>
  )
}
