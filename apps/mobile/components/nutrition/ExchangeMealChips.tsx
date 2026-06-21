import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useTheme } from '../../context/ThemeContext'
import {
  exchangeGroupColor,
  formatPortions,
  type ExchangeGroup,
} from '../../lib/nutrition-exchanges'

/**
 * Chips de codigos de la comida ("2C · 1LAC · 1F") — lado ALUMNO (mobile). Espejo de
 * apps/web/src/app/c/[coach_slug]/nutrition/_components/ExchangeMealChips.tsx. Tap en un chip =>
 * el padre abre el sheet de equivalencias del grupo. Targets ~44px de alto tactil.
 */

interface Props {
  targets: { exchangeGroupId: string; portions: number }[]
  groups: ExchangeGroup[]
  onChipTap: (group: ExchangeGroup) => void
}

export function ExchangeMealChips({ targets, groups, onChipTap }: Props) {
  const { theme } = useTheme()
  const byId = new Map(groups.map((g) => [g.id, g]))
  const rows = targets
    .map((t) => ({ group: byId.get(t.exchangeGroupId), portions: t.portions }))
    .filter((r): r is { group: ExchangeGroup; portions: number } => !!r.group && r.portions > 0)
    .sort((a, b) =>
      a.group.sortOrder !== b.group.sortOrder
        ? a.group.sortOrder - b.group.sortOrder
        : a.group.code.localeCompare(b.group.code)
    )

  if (rows.length === 0) return null

  return (
    <View style={styles.wrap}>
      {rows.map(({ group, portions }) => (
        <TouchableOpacity
          key={group.id}
          onPress={() => onChipTap(group)}
          activeOpacity={0.75}
          style={[styles.chip, { borderColor: theme.border, backgroundColor: theme.background }]}
        >
          <View style={[styles.codeBadge, { backgroundColor: exchangeGroupColor(group) }]}>
            <Text style={styles.codeText}>{group.code}</Text>
          </View>
          <Text style={[styles.label, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            {formatPortions(portions)}
            {group.code}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 32,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  codeBadge: { width: 18, height: 18, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  codeText: { fontSize: 8, color: '#FFFFFF', fontFamily: 'Montserrat_800ExtraBold' },
  label: { fontSize: 11 },
})
