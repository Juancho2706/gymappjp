import { useState } from 'react'
import { LayoutAnimation, Platform, StyleSheet, Text, TouchableOpacity, UIManager, View } from 'react-native'
import { ChevronDown } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { NutrientRangeBar, type NutrientIntent } from './NutrientRangeBar'
import type { MicroTarget } from '../../lib/nutrition-micros'

/**
 * Acordeon "Micronutrientes" (cerrado por defecto) — lado ALUMNO (mobile). Espejo de
 * apps/web/src/app/c/[coach_slug]/nutrition/_components/MicrosPanel.tsx. Sodio (cap) + fibra
 * (aimup) base; azucar/grasas avanzados con Nutricion Pro. Sin meta => valor plano + "sin meta".
 */

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

export interface MicrosPanelProps {
  sodiumMg: number | null
  fiberG: number | null
  sugarG?: number | null
  saturatedFatG?: number | null
  unsaturatedFatG?: number | null
  sodiumTarget?: MicroTarget
  fiberTarget?: MicroTarget
  sugarTarget?: MicroTarget
  saturatedFatTarget?: MicroTarget
  unsaturatedFatTarget?: MicroTarget
  proEnabled?: boolean
}

function hasAnyBound(t?: MicroTarget): boolean {
  return t != null && (t.floor != null || t.target != null || t.ceiling != null)
}

function roundish(n: number): number {
  return Math.abs(n) < 10 ? Math.round(n * 10) / 10 : Math.round(n)
}

export function MicrosPanel({
  sodiumMg,
  fiberG,
  sugarG = null,
  saturatedFatG = null,
  unsaturatedFatG = null,
  sodiumTarget,
  fiberTarget,
  sugarTarget,
  saturatedFatTarget,
  unsaturatedFatTarget,
  proEnabled = false,
}: MicrosPanelProps) {
  const { theme } = useTheme()
  const [open, setOpen] = useState(false)

  const rows: { key: string; label: string; value: number | null; unit: string; intent: NutrientIntent; target?: MicroTarget }[] = [
    { key: 'sodio', label: 'Sodio', value: sodiumMg, unit: 'mg', intent: 'cap', target: sodiumTarget },
    { key: 'fibra', label: 'Fibra', value: fiberG, unit: 'g', intent: 'aimup', target: fiberTarget },
  ]
  if (proEnabled) {
    rows.push(
      { key: 'azucar', label: 'Azúcar', value: sugarG, unit: 'g', intent: 'cap', target: sugarTarget },
      { key: 'grasa-saturada', label: 'Grasa saturada', value: saturatedFatG, unit: 'g', intent: 'cap', target: saturatedFatTarget },
      { key: 'grasa-insaturada', label: 'Grasa insaturada', value: unsaturatedFatG, unit: 'g', intent: 'aimup', target: unsaturatedFatTarget }
    )
  }

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setOpen((v) => !v)
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
      <TouchableOpacity style={styles.header} onPress={toggle} activeOpacity={0.75}>
        <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Micronutrientes</Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <ChevronDown size={16} color={theme.mutedForeground} />
        </View>
      </TouchableOpacity>

      {open && (
        <View style={styles.body}>
          {rows.map((row) => {
            if (row.value == null && !hasAnyBound(row.target)) {
              return (
                <View key={row.key} style={styles.plainRow}>
                  <View style={styles.plainHead}>
                    <Text style={[styles.plainLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{row.label}</Text>
                    <Text style={[styles.plainValue, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>— {row.unit}</Text>
                  </View>
                  <Text style={[styles.noGoal, { color: theme.mutedForeground }]}>sin meta definida</Text>
                </View>
              )
            }
            if (!hasAnyBound(row.target)) {
              return (
                <View key={row.key} style={styles.plainRow}>
                  <View style={styles.plainHead}>
                    <Text style={[styles.plainLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{row.label}</Text>
                    <Text style={[styles.plainValue, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                      {roundish(row.value ?? 0)}
                      {row.unit}
                    </Text>
                  </View>
                  <Text style={[styles.noGoal, { color: theme.mutedForeground }]}>sin meta definida</Text>
                </View>
              )
            }
            return (
              <NutrientRangeBar
                key={row.key}
                label={row.label}
                value={row.value ?? 0}
                unit={row.unit}
                intent={row.intent}
                floor={row.target?.floor}
                target={row.target?.target}
                ceiling={row.target?.ceiling}
              />
            )
          })}

          {!proEnabled && (
            <Text style={[styles.proHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Nutrición Pro desbloquea más micros (azúcar, grasas).
            </Text>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, minHeight: 44 },
  title: { fontSize: 14 },
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 14 },
  plainRow: { gap: 2 },
  plainHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  plainLabel: { fontSize: 11 },
  plainValue: { fontSize: 11 },
  noGoal: { fontSize: 10, opacity: 0.6 },
  proHint: { fontSize: 10, lineHeight: 14, opacity: 0.7, paddingTop: 2 },
})
