import { useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { Lightbulb, UtensilsCrossed } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT, TYPE } from '../../../lib/typography'
import { Sheet } from '../../Sheet'
import { EMBER_500, EMBER_600 } from '../home/types'
import type { RecipeRow } from '../../../lib/recipes.queries'

/**
 * E4-15 · RecipeIdeasSection (alumno) — espejo de
 * `apps/web/.../nutrition/_components/RecipeIdeasSection.tsx`.
 *
 * Recetas-idea que el coach asigna como inspiracion. Seccion SEPARADA del plan:
 * solo lectura, SIN macros, SIN "marcar completada". Visualmente distinta de las
 * comidas (tarjeta dashed + badge "Idea", acento ember = warm/inspiracion del DS).
 * Tap en una tarjeta abre el Sheet DS con ingredientes + preparacion.
 *
 * Gating: el RENDER de esta seccion lo decide el shell (sectionFlags.recipes,
 * fail-open igual que web). Aqui solo pintamos las recetas ya resueltas por RLS.
 */
export function RecipeIdeasSection({ recipes }: { recipes: RecipeRow[] }) {
  const { theme } = useTheme()
  const [active, setActive] = useState<RecipeRow | null>(null)

  return (
    <View accessibilityLabel="Ideas de recetas" style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Lightbulb size={16} color={EMBER_500} strokeWidth={2.4} />
        <Text className="text-strong" style={TYPE.title}>
          Ideas de recetas
        </Text>
      </View>

      {recipes.length === 0 ? (
        <View
          className="rounded-card border border-subtle bg-surface-sunken"
          style={{ borderStyle: 'dashed', paddingHorizontal: 16, paddingVertical: 24, alignItems: 'center' }}
        >
          <Text className="text-muted" style={[TYPE.caption, { textAlign: 'center' }]}>
            Tu coach aun no te compartio recetas. Cuando lo haga, apareceran aqui como inspiracion.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {recipes.map((recipe) => (
            <TouchableOpacity
              key={recipe.id}
              testID={`recipe-idea-card-${recipe.id}`}
              onPress={() => setActive(recipe)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={recipe.name}
              className="rounded-card border border-ember-500/40 bg-ember-500/[0.06]"
              style={{ borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 }}
            >
              <View
                className="bg-surface-card"
                style={{ width: 56, height: 56, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}
              >
                {recipe.image_url ? (
                  <Image source={{ uri: recipe.image_url }} style={{ width: 56, height: 56 }} contentFit="cover" />
                ) : (
                  <UtensilsCrossed size={20} color={theme.mutedForeground} strokeWidth={2} />
                )}
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className="text-strong" style={{ fontFamily: FONT.uiBold, fontSize: 14 }} numberOfLines={1}>
                  {recipe.name}
                </Text>
                {recipe.ingredients_text ? (
                  <Text className="text-muted" style={{ fontFamily: FONT.ui, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                    {recipe.ingredients_text}
                  </Text>
                ) : null}
              </View>

              <View className="bg-ember-500/15 rounded-pill" style={{ paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text
                  className="text-ember-600"
                  style={{ fontFamily: FONT.uiExtra, fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' }}
                >
                  Idea
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Sheet open={active !== null} onClose={() => setActive(null)} title={active?.name} snapPoints={['55%', '88%']}>
        {active ? (
          <View style={{ gap: 18 }}>
            {active.image_url ? (
              <View className="bg-surface-sunken" style={{ height: 160, borderRadius: 16, overflow: 'hidden' }}>
                <Image source={{ uri: active.image_url }} style={{ flex: 1 }} contentFit="cover" />
              </View>
            ) : null}

            <View className="bg-ember-500/15 rounded-pill" style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Lightbulb size={11} color={EMBER_600} strokeWidth={2.6} />
              <Text
                className="text-ember-600"
                style={{ fontFamily: FONT.uiExtra, fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' }}
              >
                Idea
              </Text>
            </View>

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
                  Preparacion
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
