import { useEffect, useMemo, useState } from 'react'
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { MotiView } from 'moti'
import { Search, X } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../context/ThemeContext'
import {
  exchangeGroupColor,
  type ExchangeFoodEquivalence,
  type ExchangeGroup,
} from '../../lib/nutrition-exchanges'

/**
 * Bottom sheet con las equivalencias de UN grupo de intercambio — lado ALUMNO (mobile). Espejo de
 * apps/web/src/app/c/[coach_slug]/nutrition/_components/ExchangeEquivalencesSheet.tsx: alimento +
 * medida casera + gramos, busqueda local. pb-safe, dark mode, targets ~44px.
 */

interface Props {
  group: ExchangeGroup | null
  equivalences: ExchangeFoodEquivalence[]
  onClose: () => void
}

export function ExchangeEquivalencesSheet({ group, equivalences, onClose }: Props) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (group) setSearch('')
  }, [group])

  const foods = useMemo(() => {
    if (!group) return []
    const list = equivalences.filter((f) => f.exchangeGroupId === group.id)
    const term = search.trim().toLowerCase()
    if (!term) return list
    return list.filter((f) => f.name.toLowerCase().includes(term))
  }, [group, equivalences, search])

  return (
    <Modal visible={!!group} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={onClose} />
        <MotiView
          from={{ translateY: 400 }}
          animate={{ translateY: 0 }}
          transition={{ type: 'timing', duration: 220 }}
          style={[
            styles.sheet,
            { backgroundColor: theme.background, borderColor: theme.border, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: theme.mutedForeground }]} />

          {group && (
            <>
              <View style={styles.header}>
                <View style={[styles.codeBadge, { backgroundColor: exchangeGroupColor(group) }]}>
                  <Text style={styles.codeText}>{group.code}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>
                    {group.name}
                  </Text>
                  <Text style={[styles.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                    1 porción ≈ {Math.round(group.refCalories)} kcal · P {group.refProteinG}g · C {group.refCarbsG}g · G{' '}
                    {group.refFatsG}g
                    {!group.macrosConfirmed ? '  (referencial)' : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                  <X size={20} color={theme.mutedForeground} />
                </TouchableOpacity>
              </View>

              <View style={[styles.searchWrap, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
                <Search size={16} color={theme.mutedForeground} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Buscar alimento"
                  placeholderTextColor={theme.mutedForeground}
                  style={[styles.searchInput, { color: theme.foreground, fontFamily: theme.fontSans }]}
                />
              </View>

              <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {foods.length === 0 ? (
                  <Text style={[styles.empty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                    Sin equivalencias para este grupo.
                  </Text>
                ) : (
                  foods.map((f) => (
                    <View key={f.foodId} style={[styles.row, { borderBottomColor: theme.border }]}>
                      <Text style={[styles.foodName, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={2}>
                        {f.name}
                      </Text>
                      <View style={styles.foodMeta}>
                        <Text
                          style={[
                            styles.portionLabel,
                            { color: f.portionLabel ? theme.foreground : theme.mutedForeground, fontFamily: 'Montserrat_700Bold' },
                          ]}
                        >
                          {f.portionLabel ?? '—'}
                        </Text>
                        {f.portionGrams != null && (
                          <Text style={[styles.grams, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                            {f.portionGrams} g
                          </Text>
                        )}
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </>
          )}
        </MotiView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  backdropTouch: { ...StyleSheet.absoluteFillObject },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 8,
    maxHeight: '80%',
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 999, marginBottom: 12, opacity: 0.5 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12 },
  codeBadge: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  codeText: { fontSize: 12, color: '#FFFFFF', fontFamily: 'Montserrat_800ExtraBold' },
  title: { fontSize: 16 },
  sub: { fontSize: 11, marginTop: 2 },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 14, height: '100%' },
  list: { flexGrow: 0 },
  empty: { fontSize: 12, textAlign: 'center', paddingVertical: 32 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  foodName: { fontSize: 14, flex: 1 },
  foodMeta: { alignItems: 'flex-end' },
  portionLabel: { fontSize: 12 },
  grams: { fontSize: 10, marginTop: 1 },
})
