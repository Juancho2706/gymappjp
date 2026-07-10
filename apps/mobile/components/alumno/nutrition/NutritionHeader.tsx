import { Text, TouchableOpacity, View } from 'react-native'
import { Share2 } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../../context/ThemeContext'
import { FONT, textStyle } from '../../../lib/typography'
import { AmbientBrandGlow } from '../../AmbientBrandGlow'

/**
 * NutritionHeader (E4-01) — header fijo del plan de nutrición con GLOW de marca
 * detrás (espejo del header sticky + glow decorativo de la web
 * `nutrition/page.tsx`). Título "Plan Nutricional" + subtítulo = nombre del plan
 * (paridad con la web; antes decía "Nutrición"). Botón Share circular a la
 * derecha. El glow usa el accent del coach (theme.primary, white-label runtime)
 * via `AmbientBrandGlow`, montado como primer hijo con overflow oculto para que
 * el bloom viva solo detrás del header.
 */
export function NutritionHeader({
  planName,
  onShare,
}: {
  planName?: string | null
  onShare?: () => void
}) {
  const insets = useSafeAreaInsets()
  const { theme } = useTheme()
  return (
    <View
      className="bg-surface-app border-b border-subtle"
      style={{ paddingTop: insets.top, paddingHorizontal: 16, zIndex: 40, overflow: 'hidden' }}
    >
      <AmbientBrandGlow />
      <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            className="text-strong"
            numberOfLines={1}
            style={textStyle('lg', FONT.uiExtra, { lh: 'snug', ls: 'tight' })}
          >
            Plan Nutricional
          </Text>
          {planName ? (
            <Text className="text-muted" numberOfLines={1} style={{ fontFamily: FONT.uiMedium, fontSize: 10, marginTop: 1 }}>
              {planName}
            </Text>
          ) : null}
        </View>
        {onShare ? (
          <TouchableOpacity
            testID="nutrition-share"
            onPress={onShare}
            className="bg-surface-sunken rounded-full items-center justify-center"
            style={{ width: 36, height: 36 }}
            activeOpacity={0.75}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Share2 size={18} color={theme.foreground} strokeWidth={2} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  )
}
