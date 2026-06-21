import { useState } from 'react'
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { MotiView } from 'moti'
import { Lightbulb, UtensilsCrossed, X } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../context/ThemeContext'
import type { RecipeRow } from '../../lib/recipes'

/**
 * Ideas de recetas asignadas por el coach (feature L) — lado ALUMNO (mobile). Espejo de
 * apps/web/src/app/c/[coach_slug]/nutrition/_components/RecipeIdeasSection.tsx. Solo lectura, SIN
 * macros, SIN "completar". Tarjeta dashed + badge "Idea"; tap abre un sheet con detalle.
 */

export function RecipeIdeasSection({ recipes }: { recipes: RecipeRow[] }) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const [active, setActive] = useState<RecipeRow | null>(null)

  const amber = '#f59e0b'

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Lightbulb size={16} color={amber} />
        <Text style={[styles.heading, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>
          IDEAS DE RECETAS
        </Text>
      </View>

      {recipes.length === 0 ? (
        <View style={[styles.emptyCard, { borderColor: theme.border }]}>
          <Text style={[styles.emptyText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Tu coach aún no te compartió recetas. Cuando lo haga, aparecerán aquí como inspiración.
          </Text>
        </View>
      ) : (
        recipes.map((recipe) => (
          <TouchableOpacity
            key={recipe.id}
            onPress={() => setActive(recipe)}
            activeOpacity={0.8}
            style={[styles.recipeRow, { borderColor: amber + '66', backgroundColor: amber + '0F' }]}
          >
            <View style={[styles.thumb, { backgroundColor: theme.secondary }]}>
              {recipe.image_url ? (
                <Image source={{ uri: recipe.image_url }} style={styles.thumbImg} contentFit="cover" />
              ) : (
                <UtensilsCrossed size={20} color={theme.mutedForeground} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.recipeName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>
                {recipe.name}
              </Text>
              {recipe.ingredients_text ? (
                <Text style={[styles.recipeSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
                  {recipe.ingredients_text}
                </Text>
              ) : null}
            </View>
            <View style={[styles.ideaBadge, { backgroundColor: amber + '26' }]}>
              <Text style={[styles.ideaText, { color: amber, fontFamily: 'Montserrat_800ExtraBold' }]}>Idea</Text>
            </View>
          </TouchableOpacity>
        ))
      )}

      <Modal visible={!!active} transparent animationType="fade" onRequestClose={() => setActive(null)}>
        <View style={styles.backdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setActive(null)} />
          <MotiView
            from={{ translateY: 400 }}
            animate={{ translateY: 0 }}
            transition={{ type: 'timing', duration: 220 }}
            style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border, paddingBottom: insets.bottom + 20 }]}
          >
            <View style={[styles.grabber, { backgroundColor: theme.mutedForeground }]} />
            {active && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {active.image_url ? (
                  <Image source={{ uri: active.image_url }} style={styles.heroImg} contentFit="cover" />
                ) : null}
                <View style={styles.detailHead}>
                  <View style={{ flex: 1 }}>
                    <View style={[styles.ideaBadge, { backgroundColor: amber + '26', alignSelf: 'flex-start' }]}>
                      <Text style={[styles.ideaText, { color: amber, fontFamily: 'Montserrat_800ExtraBold' }]}>Idea</Text>
                    </View>
                    <Text style={[styles.detailTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                      {active.name}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setActive(null)} style={styles.closeBtn} activeOpacity={0.7}>
                    <X size={20} color={theme.mutedForeground} />
                  </TouchableOpacity>
                </View>

                {active.ingredients_text ? (
                  <View style={styles.detailBlock}>
                    <Text style={[styles.detailLabel, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>
                      INGREDIENTES
                    </Text>
                    <Text style={[styles.detailBody, { color: theme.foreground, fontFamily: theme.fontSans }]}>
                      {active.ingredients_text}
                    </Text>
                  </View>
                ) : null}
                {active.instructions ? (
                  <View style={styles.detailBlock}>
                    <Text style={[styles.detailLabel, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>
                      PREPARACIÓN
                    </Text>
                    <Text style={[styles.detailBody, { color: theme.foreground, fontFamily: theme.fontSans }]}>
                      {active.instructions}
                    </Text>
                  </View>
                ) : null}
                {!active.ingredients_text && !active.instructions ? (
                  <Text style={[styles.detailBody, { color: theme.mutedForeground, fontFamily: theme.fontSans, textAlign: 'center', paddingVertical: 16 }]}>
                    Esta receta no tiene detalles adicionales.
                  </Text>
                ) : null}
              </ScrollView>
            )}
          </MotiView>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { fontSize: 11, letterSpacing: 1 },
  emptyCard: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 16, padding: 18 },
  emptyText: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
  recipeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderStyle: 'dashed', borderRadius: 16, padding: 10 },
  thumb: { width: 56, height: 56, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbImg: { width: '100%', height: '100%' },
  recipeName: { fontSize: 14 },
  recipeSub: { fontSize: 11, marginTop: 2 },
  ideaBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  ideaText: { fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 8, maxHeight: '85%' },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 999, marginBottom: 12, opacity: 0.5 },
  heroImg: { width: '100%', height: 160, borderRadius: 18, marginBottom: 12 },
  detailHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingBottom: 8 },
  detailTitle: { fontSize: 17, marginTop: 6 },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  detailBlock: { gap: 6, paddingVertical: 8 },
  detailLabel: { fontSize: 10, letterSpacing: 1 },
  detailBody: { fontSize: 14, lineHeight: 20 },
})
