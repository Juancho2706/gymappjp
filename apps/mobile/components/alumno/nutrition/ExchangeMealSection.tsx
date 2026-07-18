import { Text, View } from 'react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { ExchangeChips } from './ExchangeChips'
import type { ExchangeMealView } from '../../../lib/nutrition-exchanges.queries'

interface Props {
  /** View-model de intercambios de la comida (o null si no tiene targets). */
  meal: ExchangeMealView | null
  /** Modo de vista local: 'gramos' oculta la seccion (se ve la tarjeta normal). */
  mode?: 'porciones' | 'gramos'
  onChipTap: (groupId: string) => void
}

/**
 * ExchangeMealSection (E4-07) — bloque "En porciones" que se monta DEBAJO de cada
 * MealCard cuando el plan esta en modo intercambios: badge de variante de dia +
 * macros DERIVADOS de los targets + chips de intercambio (tap → sheet de
 * equivalencias) + aviso "referencial" si algun grupo tiene macros sin confirmar.
 * Espejo del render de exchanges dentro del `MealCard` de web, adaptado a un strip
 * propio (no edita la tarjeta base). Presentacional puro. Modo 'gramos' ⇒ null.
 */
export function ExchangeMealSection({ meal, mode = 'porciones', onChipTap }: Props) {
  const { theme } = useTheme()
  if (!meal || mode === 'gramos' || meal.chips.length === 0) return null

  const d = meal.derived

  return (
    <View
      testID="exchange-meal-section"
      style={{
        marginTop: -6,
        backgroundColor: theme.muted,
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: theme.radius.xl,
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text
          style={{
            color: theme.mutedForeground,
            fontFamily: FONT.uiBold,
            fontSize: 9.5,
            letterSpacing: 0.7,
            textTransform: 'uppercase',
          }}
        >
          En porciones
        </Text>
        {meal.variantName ? (
          <View style={{ backgroundColor: theme.secondary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text
              style={{
                color: theme.mutedForeground,
                fontFamily: FONT.uiBold,
                fontSize: 9,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
              }}
            >
              {meal.variantName}
            </Text>
          </View>
        ) : null}
      </View>

      {d ? (
        <Text
          style={{
            color: theme.mutedForeground,
            fontFamily: FONT.monoMedium,
            fontSize: 11,
            fontVariant: ['tabular-nums'],
          }}
        >
          {`${Math.round(d.calories)} kcal · P ${Math.round(d.proteinG)} · C ${Math.round(d.carbsG)} · G ${Math.round(d.fatsG)}`}
        </Text>
      ) : null}

      <ExchangeChips chips={meal.chips} onChipTap={onChipTap} />

      {meal.hasUnconfirmed ? (
        <Text style={{ color: theme.mutedForeground, fontFamily: FONT.ui, fontSize: 10, lineHeight: 14 }}>
          Macros referenciales (aprox.)
        </Text>
      ) : null}
    </View>
  )
}
