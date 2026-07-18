import { useEffect, useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { BottomSheetTextInput } from '@gorhom/bottom-sheet'
import { Search } from 'lucide-react-native'
import { Sheet } from '../../Sheet'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import type { ExchangeEquivalenceView, ExchangeGroupView } from '../../../lib/nutrition-exchanges.queries'

interface Props {
  /** Id del grupo cuyo sheet mostrar. null = cerrado. */
  openGroupId: string | null
  groups: ExchangeGroupView[]
  equivalences: ExchangeEquivalenceView[]
  onClose: () => void
}

/**
 * ExchangeEquivalencesSheet (E4-07) — bottom sheet DS con las equivalencias de UN
 * grupo de intercambio: cabecera (badge de codigo + macros de referencia por porcion
 * + badge "referencial" si no estan confirmadas), busqueda local y lista
 * alimento → medida casera → gramos. Espejo del web `ExchangeEquivalencesSheet`.
 * Presentacional puro (datos ya resueltos por el endpoint). Un solo grupo a la vez.
 */
export function ExchangeEquivalencesSheet({ openGroupId, groups, equivalences, onClose }: Props) {
  const { theme } = useTheme()
  const [search, setSearch] = useState('')

  const group = useMemo(
    () => (openGroupId ? (groups.find((g) => g.id === openGroupId) ?? null) : null),
    [openGroupId, groups],
  )

  useEffect(() => {
    if (openGroupId) setSearch('')
  }, [openGroupId])

  const foods = useMemo(() => {
    if (!group) return []
    const list = equivalences.filter((f) => f.exchangeGroupId === group.id)
    const term = search.trim().toLowerCase()
    return term ? list.filter((f) => f.name.toLowerCase().includes(term)) : list
  }, [group, equivalences, search])

  return (
    <Sheet
      open={!!openGroupId}
      onClose={onClose}
      snapPoints={['55%', '88%']}
      title={group?.name}
    >
      {group ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: group.color,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontFamily: FONT.uiExtra, fontSize: 12 }}>{group.code}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.mutedForeground, fontFamily: FONT.uiMedium, fontSize: 11.5, lineHeight: 16 }}>
                {`1 porción ≈ ${Math.round(group.refCalories)} kcal · P ${group.refProteinG}g · C ${group.refCarbsG}g · G ${group.refFatsG}g`}
              </Text>
              {!group.macrosConfirmed ? (
                <Text style={{ color: theme.mutedForeground, fontFamily: FONT.uiBold, fontSize: 10, marginTop: 2 }}>
                  Macros referenciales (aprox.)
                </Text>
              ) : null}
            </View>
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              height: 42,
              paddingHorizontal: 12,
              borderRadius: theme.radius.lg,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.muted,
            }}
          >
            <Search size={16} color={theme.mutedForeground} strokeWidth={2} />
            <BottomSheetTextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar alimento…"
              placeholderTextColor={theme.mutedForeground}
              style={{ flex: 1, color: theme.foreground, fontFamily: FONT.ui, fontSize: 14, padding: 0 }}
            />
          </View>

          {foods.length === 0 ? (
            <Text
              style={{
                color: theme.mutedForeground,
                fontFamily: FONT.ui,
                fontSize: 12.5,
                textAlign: 'center',
                paddingVertical: 24,
              }}
            >
              Sin equivalencias para este grupo.
            </Text>
          ) : (
            <View>
              {foods.map((f, i) => (
                <View
                  key={f.foodId}
                  testID={`exchange-equivalence-${f.foodId}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    minHeight: 44,
                    paddingVertical: 8,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: theme.border,
                  }}
                >
                  <Text
                    style={{ flex: 1, color: theme.foreground, fontFamily: FONT.uiSemibold, fontSize: 14 }}
                    numberOfLines={2}
                  >
                    {f.name}
                  </Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text
                      style={{
                        color: f.portionLabel ? theme.foreground : theme.mutedForeground,
                        fontFamily: FONT.uiBold,
                        fontSize: 12.5,
                      }}
                    >
                      {f.portionLabel ?? '—'}
                    </Text>
                    <Text
                      style={{
                        color: theme.mutedForeground,
                        fontFamily: FONT.monoMedium,
                        fontSize: 10.5,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {f.portionGrams != null ? `${f.portionGrams} g` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      ) : (
        <View />
      )}
    </Sheet>
  )
}
