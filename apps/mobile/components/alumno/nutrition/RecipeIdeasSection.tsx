import { useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { Clock3, Lightbulb, Scale, UtensilsCrossed } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT, TYPE } from '../../../lib/typography'
import { Sheet } from '../../Sheet'
import { EMBER_500, EMBER_600 } from '../home/types'
import type { RecipeRow } from '../../../lib/recipes.queries'

/**
 * Recetas asignadas al alumno, paridad con web:
 * - idea Base: inspiración;
 * - structured: preparación cuantificable con macros por porción.
 */
export function RecipeIdeasSection({ recipes }: { recipes: RecipeRow[] }) {
  const { theme } = useTheme()
  const [active, setActive] = useState<RecipeRow | null>(null)

  return (
    <View accessibilityLabel="Recetas compartidas" style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <UtensilsCrossed size={16} color={EMBER_500} strokeWidth={2.4} />
        <Text className="text-strong" style={TYPE.title}>Recetas</Text>
      </View>

      {recipes.length === 0 ? (
        <View
          className="rounded-card border border-subtle bg-surface-sunken"
          style={{ borderStyle: 'dashed', paddingHorizontal: 16, paddingVertical: 24, alignItems: 'center' }}
        >
          <Text className="text-muted" style={[TYPE.caption, { textAlign: 'center' }]}>
            Tu profesional todavía no te compartió recetas.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {recipes.map((recipe) => {
            const structured = recipe.recipe_mode === 'structured'
            return (
              <TouchableOpacity
                key={recipe.id}
                testID={`recipe-card-${recipe.id}`}
                onPress={() => setActive(recipe)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={recipe.name}
                className={structured
                  ? 'rounded-card border border-ember-500/30 bg-ember-500/[0.06]'
                  : 'rounded-card border border-amber-500/40 bg-amber-500/[0.06]'}
                style={{
                  borderStyle: structured ? 'solid' : 'dashed',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 10,
                  minHeight: 78,
                }}
              >
                <View
                  className="bg-surface-card"
                  style={{ width: 56, height: 56, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}
                >
                  {recipe.image_url ? (
                    <Image source={{ uri: recipe.image_url }} style={{ width: 56, height: 56 }} contentFit="cover" />
                  ) : structured ? (
                    <Scale size={20} color={EMBER_500} strokeWidth={2.2} />
                  ) : (
                    <Lightbulb size={20} color={theme.mutedForeground} strokeWidth={2} />
                  )}
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text className="text-strong" style={{ fontFamily: FONT.uiBold, fontSize: 14 }} numberOfLines={1}>
                    {recipe.name}
                  </Text>
                  {structured ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 4 }}>
                      <Text style={{ color: EMBER_600, fontFamily: FONT.monoBold, fontSize: 10.5 }}>
                        {Math.round(recipe.calories_per_serving ?? 0)} kcal
                      </Text>
                      <Text className="text-muted" style={{ fontFamily: FONT.monoMedium, fontSize: 10.5 }}>
                        P {Math.round(recipe.protein_g_per_serving ?? 0)}g
                      </Text>
                      <Text className="text-muted" style={{ fontFamily: FONT.monoMedium, fontSize: 10.5 }}>
                        C {Math.round(recipe.carbs_g_per_serving ?? 0)}g
                      </Text>
                      <Text className="text-muted" style={{ fontFamily: FONT.monoMedium, fontSize: 10.5 }}>
                        G {Math.round(recipe.fats_g_per_serving ?? 0)}g
                      </Text>
                    </View>
                  ) : recipe.ingredients_text ? (
                    <Text className="text-muted" style={{ fontFamily: FONT.ui, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                      {recipe.ingredients_text}
                    </Text>
                  ) : null}
                </View>

                <View
                  className={structured ? 'bg-ember-500/15 rounded-pill' : 'bg-amber-500/15 rounded-pill'}
                  style={{ paddingHorizontal: 8, paddingVertical: 2 }}
                >
                  <Text
                    style={{
                      color: EMBER_600,
                      fontFamily: FONT.uiExtra,
                      fontSize: 9,
                      letterSpacing: 0.6,
                      textTransform: 'uppercase',
                    }}
                  >
                    {structured ? 'Calculada' : 'Idea'}
                  </Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      )}

      <Sheet open={active !== null} onClose={() => setActive(null)} title={active?.name} snapPoints={['60%', '90%']}>
        {active ? (
          <View style={{ gap: 18 }}>
            {active.image_url ? (
              <View className="bg-surface-sunken" style={{ height: 160, borderRadius: 16, overflow: 'hidden' }}>
                <Image source={{ uri: active.image_url }} style={{ flex: 1 }} contentFit="cover" />
              </View>
            ) : null}

            <View
              className={active.recipe_mode === 'structured' ? 'bg-ember-500/15 rounded-pill' : 'bg-amber-500/15 rounded-pill'}
              style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3 }}
            >
              {active.recipe_mode === 'structured' ? (
                <Scale size={11} color={EMBER_600} strokeWidth={2.6} />
              ) : (
                <Lightbulb size={11} color={EMBER_600} strokeWidth={2.6} />
              )}
              <Text
                className="text-ember-600"
                style={{ fontFamily: FONT.uiExtra, fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' }}
              >
                {active.recipe_mode === 'structured' ? 'Receta calculada' : 'Idea'}
              </Text>
            </View>

            {active.description ? (
              <Text className="text-muted" style={{ fontFamily: FONT.ui, fontSize: 13, lineHeight: 19 }}>
                {active.description}
              </Text>
            ) : null}

            {active.recipe_mode === 'structured' ? (
              <View className="rounded-card border border-ember-500/20 bg-ember-500/[0.07]" style={{ padding: 16, gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                  <View>
                    <Text style={{ color: EMBER_600, fontFamily: FONT.uiExtra, fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                      Por porción
                    </Text>
                    <Text className="text-strong" style={{ fontFamily: FONT.monoBold, fontSize: 24, marginTop: 3 }}>
                      {Math.round(active.calories_per_serving ?? 0)} kcal
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 3 }}>
                    <Text className="text-muted" style={{ fontFamily: FONT.monoMedium, fontSize: 11 }}>
                      P {Math.round(active.protein_g_per_serving ?? 0)}g · C {Math.round(active.carbs_g_per_serving ?? 0)}g
                    </Text>
                    <Text className="text-muted" style={{ fontFamily: FONT.monoMedium, fontSize: 11 }}>
                      G {Math.round(active.fats_g_per_serving ?? 0)}g · Fibra {Math.round(active.fiber_g_per_serving ?? 0)}g
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <Text className="text-muted" style={{ fontFamily: FONT.uiSemibold, fontSize: 11.5 }}>
                    {active.servings} {active.servings === 1 ? 'porción' : 'porciones'}
                  </Text>
                  {active.prep_time_minutes != null ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Clock3 size={13} color={theme.mutedForeground} />
                      <Text className="text-muted" style={{ fontFamily: FONT.uiSemibold, fontSize: 11.5 }}>
                        {active.prep_time_minutes} min
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            {active.ingredients_text ? (
              <View style={{ gap: 6 }}>
                <Text className="text-muted" style={{ fontFamily: FONT.uiExtra, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>
                  Ingredientes
                </Text>
                <Text className="text-strong" style={{ fontFamily: FONT.ui, fontSize: 14, lineHeight: 22 }}>
                  {active.ingredients_text}
                </Text>
              </View>
            ) : null}

            {active.instructions ? (
              <View style={{ gap: 6 }}>
                <Text className="text-muted" style={{ fontFamily: FONT.uiExtra, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>
                  Preparación
                </Text>
                <Text className="text-strong" style={{ fontFamily: FONT.ui, fontSize: 14, lineHeight: 22 }}>
                  {active.instructions}
                </Text>
              </View>
            ) : null}

            {!active.ingredients_text && !active.instructions ? (
              <Text className="text-muted" style={[TYPE.caption, { textAlign: 'center', paddingVertical: 20 }]}>
                Esta receta no tiene detalles adicionales.
              </Text>
            ) : null}
          </View>
        ) : null}
      </Sheet>
    </View>
  )
}
