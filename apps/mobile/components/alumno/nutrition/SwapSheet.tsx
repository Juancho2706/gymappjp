import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { ArrowRightLeft, Check, Star } from 'lucide-react-native'
import { Sheet } from '../../Sheet'
import { Button } from '../../Button'
import { useTheme } from '../../../context/ThemeContext'
import { FONT, TYPE, textStyle } from '../../../lib/typography'
import {
  macrosForFoodItem,
  macrosForSwapOption,
  swapMacroDelta,
  type SwapOption,
} from '../../../lib/nutrition-swaps'
import type { MealMacros } from '../../../lib/nutrition-swaps'
import type { FoodItemForMacros } from '../../../lib/nutrition-utils'
import { EMBER_500, EMBER_700 } from './types'

/**
 * SwapSheet (E4-08) — intercambio interactivo de un alimento por sus
 * `swap_options` + marcado de favoritos. Bottom-sheet DS (mismo patrón que
 * `SubstituteExerciseSheet` del ejecutor): lista el alimento original y cada
 * alternativa con sus macros RECALCULADAS por `@eva/nutrition-engine` (porción
 * del coach) y el delta vs el original, deja elegir una y aplicarla, o volver al
 * original. La estrella marca/desmarca favorito por alimento
 * (`client_food_preferences`, base tier — RLS del alumno).
 *
 * Autocontenido: recibe el ítem + callbacks. La persistencia (applyMealFoodSwap
 * / clearMealFoodSwap / toggleClientFoodFavorite) la orquesta el shell; este
 * componente sólo emite intención.
 */

interface Props {
  open: boolean
  onClose: () => void
  /** Ingrediente sobre el que se abre el sheet (con `swap_options` normalizadas). */
  item: FoodItemForMacros | null
  /** Nombre de la comida (contexto en el header). */
  mealName?: string
  /** food_id del swap aplicado hoy para este ítem (si hay). */
  activeSwappedFoodId?: string | null
  /** food_ids favoritos del alumno. */
  favoriteFoodIds: ReadonlySet<string>
  onToggleFavorite: (foodId: string) => void
  /** Aplica la alternativa elegida. */
  onApply: (option: SwapOption) => void
  /** Vuelve al alimento original del plan (borra el swap). */
  onRevert: () => void
  applying?: boolean
}

function macroLine(m: MealMacros): string {
  return `${Math.round(m.calories)} kcal · P ${Math.round(m.protein)} · C ${Math.round(m.carbs)} · G ${Math.round(m.fats)}`
}

function deltaLabel(kcal: number): string {
  if (kcal === 0) return '= kcal'
  return `${kcal > 0 ? '▲' : '▼'} ${Math.abs(Math.round(kcal))} kcal`
}

export function SwapSheet({
  open,
  onClose,
  item,
  mealName,
  activeSwappedFoodId,
  favoriteFoodIds,
  onToggleFavorite,
  onApply,
  onRevert,
  applying,
}: Props) {
  const originalFoodId = item?.foods.id ?? ''
  const options = useMemo<SwapOption[]>(() => item?.swap_options ?? [], [item])

  // Selección default = swap activo si hay, si no el original.
  const appliedId = activeSwappedFoodId ?? originalFoodId
  const [selected, setSelected] = useState<string>(appliedId)

  useEffect(() => {
    if (open) setSelected(appliedId)
  }, [open, appliedId])

  const originalMacros = item ? macrosForFoodItem(item) : null
  const noChange = selected === appliedId

  function handleConfirm() {
    if (!item) return
    if (selected === originalFoodId) {
      onRevert()
    } else {
      const opt = options.find((o) => o.food_id === selected)
      if (opt) onApply(opt)
    }
    onClose()
  }

  const footer = (
    <Button
      label={selected === originalFoodId ? 'Usar original' : 'Aplicar cambio'}
      leftIcon={Check}
      variant="sport"
      onPress={handleConfirm}
      disabled={noChange || !item}
      loading={applying}
      full
      size="lg"
      testID="swap-apply"
    />
  )

  return (
    <Sheet open={open} onClose={onClose} snapPoints={['85%']} footer={footer} scrollable>
      <View style={styles.headerBlock}>
        <View style={styles.eyebrowRow}>
          <ArrowRightLeft size={14} color={EMBER_500} strokeWidth={2.4} />
          <Text style={TYPE.eyebrow} className="text-muted">
            Cambiar alimento
          </Text>
        </View>
        <Text
          style={textStyle('xl', FONT.displayBold, { lh: 'snug', ls: 'tight' })}
          className="text-strong mt-1"
          numberOfLines={2}
        >
          {item?.foods.name ?? 'Alimento'}
        </Text>
        <Text style={TYPE.caption} className="text-muted mt-1">
          {mealName ? `${mealName} · ` : ''}Elige una alternativa que dejó tu coach. El cambio vale solo por hoy.
        </Text>
      </View>

      {/* Alimento original (seleccionable → volver a él) */}
      {item ? (
        <SwapRow
          testID={`swap-option-${originalFoodId || 'original'}`}
          name={item.foods.name}
          badge="Original"
          macros={originalMacros ? macroLine(originalMacros) : ''}
          delta={null}
          selected={selected === originalFoodId}
          favorite={favoriteFoodIds.has(originalFoodId)}
          onSelect={() => setSelected(originalFoodId)}
          onToggleFavorite={originalFoodId ? () => onToggleFavorite(originalFoodId) : undefined}
        />
      ) : null}

      {/* Alternativas */}
      {options.length === 0 ? (
        <Text style={TYPE.caption} className="text-muted">
          Tu coach no configuró alternativas para este alimento.
        </Text>
      ) : (
        options.map((opt) => {
          const m = macrosForSwapOption(opt)
          const d = item ? swapMacroDelta(item, opt) : null
          return (
            <SwapRow
              key={opt.food_id}
              testID={`swap-option-${opt.food_id}`}
              name={opt.name}
              badge={null}
              macros={macroLine(m)}
              delta={d ? deltaLabel(d.calories) : null}
              selected={selected === opt.food_id}
              favorite={favoriteFoodIds.has(opt.food_id)}
              onSelect={() => setSelected(opt.food_id)}
              onToggleFavorite={() => onToggleFavorite(opt.food_id)}
            />
          )
        })
      )}
    </Sheet>
  )
}

function SwapRow({
  testID,
  name,
  badge,
  macros,
  delta,
  selected,
  favorite,
  onSelect,
  onToggleFavorite,
}: {
  testID: string
  name: string
  badge: string | null
  macros: string
  delta: string | null
  selected: boolean
  favorite: boolean
  onSelect: () => void
  onToggleFavorite?: () => void
}) {
  const { theme } = useTheme()
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onSelect}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`flex-row items-center rounded-control ${
        selected ? 'bg-sport-500/10 border-2 border-sport-500' : 'bg-surface-card border border-subtle'
      }`}
      style={styles.optRow}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={styles.nameRow}>
          <Text style={textStyle('sm', FONT.uiBold, { lh: 'snug' })} className="text-strong" numberOfLines={1}>
            {name}
          </Text>
          {badge ? (
            <View className="rounded-pill" style={[styles.badge, { backgroundColor: EMBER_500 + '20' }]}>
              <Text style={{ color: EMBER_700, fontSize: 9, fontFamily: FONT.uiBold, letterSpacing: 0.5 }}>
                {badge.toUpperCase()}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.metaRow}>
          <Text style={[styles.macros, { color: theme.mutedForeground, fontFamily: FONT.mono }]} numberOfLines={1}>
            {macros}
          </Text>
          {delta ? (
            <Text style={[styles.delta, { color: EMBER_700, fontFamily: FONT.uiBold }]}>{delta}</Text>
          ) : null}
        </View>
      </View>

      {/* Favorito (estrella) — tap aislado, no selecciona la fila */}
      {onToggleFavorite ? (
        <TouchableOpacity
          testID={`swap-favorite-${testID.replace('swap-option-', '')}`}
          onPress={onToggleFavorite}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
          accessibilityState={{ selected: favorite }}
          style={styles.starBtn}
        >
          <Star
            size={18}
            color={favorite ? EMBER_500 : theme.mutedForeground}
            fill={favorite ? EMBER_500 : 'transparent'}
            strokeWidth={2}
          />
        </TouchableOpacity>
      ) : null}

      <View
        className={`items-center justify-center rounded-pill ${selected ? 'bg-sport-500' : 'border border-default'}`}
        style={styles.check}
      >
        {selected ? <Check size={15} color={theme.primaryForeground} strokeWidth={2.6} /> : null}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  headerBlock: { gap: 2 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  optRow: { gap: 10, padding: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { paddingHorizontal: 7, paddingVertical: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  macros: { fontSize: 11, flexShrink: 1 },
  delta: { fontSize: 10.5 },
  starBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  check: { width: 28, height: 28 },
})
