import { Text, View } from 'react-native'
import { History } from 'lucide-react-native'
import { FONT } from '../../../lib/typography'

const AMBER_500 = '#F59E0B'
const AMBER_700 = '#B45309'

/**
 * HistoricBanner (E4-04) — aviso de día histórico (solo lectura), espejo del
 * banner ámbar de la web `NutritionShell`. Reemplaza el banner surface-sunken
 * del monolito.
 */
export function HistoricBanner() {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1,
        borderColor: AMBER_500 + '33',
        backgroundColor: AMBER_500 + '1A',
        borderRadius: 14,
        paddingVertical: 9,
        paddingHorizontal: 14,
      }}
    >
      <History size={15} color={AMBER_700} strokeWidth={2} />
      <Text style={{ flex: 1, fontFamily: FONT.uiMedium, fontSize: 12, lineHeight: 17, color: AMBER_700 }}>
        Día histórico — puedes revisar tu adherencia, pero no editar registros.
      </Text>
    </View>
  )
}
