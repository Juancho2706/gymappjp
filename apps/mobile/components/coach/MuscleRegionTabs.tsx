import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { MUSCLE_GROUP_REGIONS, type MuscleGroupRegionId } from '@eva/workout-engine'
import { useTheme } from '../../context/ThemeContext'
import { SHADOWS } from '../../lib/shadows'
import { FONT } from '../../lib/typography'
import { HapticPressable } from '../HapticPressable'

/**
* Pestañas de región del selector «Grupo muscular» (mockup QA 02-09, opción B).
*
* Es un `SegmentedTabs` que SCROLLEA: el componente del DS reparte los segmentos con
* `flex: 1` y con 6 regiones («Movilidad» es la más larga) los rótulos se cortan en un
* teléfono de 390 px. Acá cada pestaña se dimensiona por su contenido y la fila scrollea
* en horizontal, con los MISMOS tokens que `SegmentedTabs` — track `surface-sunken`
* (theme.secondary) radio 14 con padding 3, pill activa `surface-card` radio 11 +
* `shadow-sm`, rótulo `text-strong` @700 vs `text-muted` @600 — para que se lea como el
* mismo control.
*
* Los colores van por `style` y no por `className` a propósito: `HapticPressable` pasa el
* `style` al MotiView interior y el `className` al Pressable exterior, así que mezclarlos
* dejaría el fondo de la pill sin el radio ni el padding (mismo criterio que `SegmentedTabs`).
*
* Vive en `components/coach/` y no en el DS porque su única razón de existir es esta
* taxonomía; si aparece un segundo caso de segmentado scrolleable, sube a `components/`.
*/
export function MuscleRegionTabs({
  value,
  onChange,
  /** Contador por región; por defecto, la cantidad de grupos que ofrece la pestaña. */
  countFor,
}: {
  value: MuscleGroupRegionId
  onChange: (id: MuscleGroupRegionId) => void
  countFor?: (id: MuscleGroupRegionId) => number
}) {
  const { theme } = useTheme()

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={[styles.track, { backgroundColor: theme.secondary }]}
      contentContainerStyle={styles.trackContent}
      accessibilityRole="tablist"
    >
      {MUSCLE_GROUP_REGIONS.map((region) => {
        const active = region.id === value
        const count = countFor?.(region.id) ?? region.groups.length
        return (
          <HapticPressable
            key={region.id}
            onPress={() => onChange(region.id)}
            testID={`muscle-region-${region.id}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${region.label}, ${count} ${count === 1 ? 'grupo' : 'grupos'}`}
            style={[
              styles.tab,
              { backgroundColor: active ? theme.card : 'transparent' },
              active ? SHADOWS[theme.scheme].sm : null,
            ]}
          >
            <Text
              numberOfLines={1}
              style={{
                color: active ? theme.foreground : theme.mutedForeground,
                fontFamily: active ? FONT.uiBold : FONT.uiSemibold,
                fontSize: 13,
              }}
            >
              {region.label}
            </Text>
            <View
              style={[
                styles.countPill,
                { backgroundColor: active ? theme.secondary : 'transparent' },
              ]}
            >
              <Text
                style={{
                  color: theme.mutedForeground,
                  fontFamily: FONT.uiBold,
                  fontSize: 10,
                  textAlign: 'center',
                }}
              >
                {count}
              </Text>
            </View>
          </HapticPressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  // maxHeight + flexGrow 0: sin eso el ScrollView horizontal se estira dentro de la hoja.
  track: { borderRadius: 14, maxHeight: 42, flexGrow: 0 },
  trackContent: { padding: 3, gap: 2, alignItems: 'center' },
  // Segmento: radio = --radius-md − 3 (igual que SegmentedTabs), ancho por contenido.
  tab: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 11,
    paddingHorizontal: 12,
  },
  countPill: { minWidth: 18, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 9 },
})
