/**
 * PortionEquivalencesSheet — sheet de equivalencias V2 (SPEC UX-b): lista de
 * alimentos que equivalen a 1 porción del grupo, resuelta DESDE el read-model del
 * Today (`exchangeFoods` — hallazgo F3: el cliente jamás consulta `exchange_groups`
 * ni `foods`). Espejo del `ExchangeEquivalencesSheet` V1 (referencia visual) sobre
 * los snapshots congelados. Tabs si la franja tiene varios grupos; badge "Valores
 * referenciales" si `macrosConfirmed=false`; CTAs al pie: marcar (mismo camino que
 * el tap del chip, con confirmación de exceso) y registrar alimento (flujo
 * existente con la franja preseleccionada + aviso anti-duplicado).
 *
 * Render por `nativeModal` (gotcha gorhom 5.2.14 + reanimated 4: el sheet gorhom
 * es frágil bajo Fabric — patrón Sheet nativeModal existente del repo).
 */
import { useEffect, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import type {
  NutritionExchangeFoodRead,
  NutritionSlotExchangeTargetRead,
} from '@eva/nutrition-v2'
import { Sheet } from '../../Sheet'
import { NutritionMotionButton } from '../../nutrition-v2'
import { PORTIONS_COPY } from '../../../lib/nutrition-portions-copy'
import {
  formatPortionsCl,
  nextPortionStep,
  type PortionCoverageView,
} from '../../../lib/nutrition-v2-portions'
import { GroupDot } from './PortionChip'
import { portionTargetColor } from './PortionSlotSection'

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export interface PortionEquivalencesSheetProps {
  /** null = cerrado. `groupCode` es el grupo inicialmente activo. */
  open: { slotCode: string; groupCode: string } | null
  /** Targets de la franja abierta (tabs si hay más de uno). */
  targets: ReadonlyArray<NutritionSlotExchangeTargetRead>
  /** Catálogo de equivalencias del read-model (todas; se filtra por grupo). */
  exchangeFoods: ReadonlyArray<NutritionExchangeFoodRead>
  /** Vista de cobertura por groupCode de la franja abierta (para exceso/dup). */
  views: Readonly<Record<string, PortionCoverageView>>
  onClose: () => void
  onMark: (target: NutritionSlotExchangeTargetRead, portions: 1 | 0.5) => void
  onRegister: () => void
}

export function PortionEquivalencesSheet({
  open,
  targets,
  exchangeFoods,
  views,
  onClose,
  onMark,
  onRegister,
}: PortionEquivalencesSheetProps) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [confirmExtra, setConfirmExtra] = useState(false)

  useEffect(() => {
    setActiveGroup(open?.groupCode ?? null)
    setConfirmExtra(false)
  }, [open])

  const target = useMemo(
    () =>
      targets.find((t) => t.groupCode === (activeGroup ?? open?.groupCode)) ??
      targets[0] ??
      null,
    [activeGroup, open, targets],
  )

  const foods = useMemo(
    () => (target ? exchangeFoods.filter((f) => f.groupCode === target.groupCode) : []),
    [exchangeFoods, target],
  )

  const view = target ? views[target.groupCode] : undefined
  const step = view ? nextPortionStep(view) : { portions: 1 as const, requiresConfirm: false }
  const showDupWarning = view != null && view.marcadas > 0

  const handleMark = () => {
    if (!target) return
    if (step.requiresConfirm && !confirmExtra) {
      setConfirmExtra(true)
      return
    }
    setConfirmExtra(false)
    onMark(target, step.portions)
  }

  return (
    <Sheet
      open={open != null}
      onClose={onClose}
      nativeModal
      title={target ? PORTIONS_COPY.student.sheetTitle(target.groupName) : undefined}
      snapPoints={['88%']}
      accessibilityLabel={
        target ? PORTIONS_COPY.student.sheetTitle(target.groupName) : PORTIONS_COPY.student.equivalences
      }
      footer={
        target ? (
          <View className="gap-2">
            {confirmExtra ? (
              <Text className="text-xs leading-4 text-warning-700">
                {PORTIONS_COPY.student.extraConfirm(target.groupName)}
              </Text>
            ) : null}
            {showDupWarning ? (
              <Text className="text-xs leading-4 text-text-muted">
                {PORTIONS_COPY.student.dupWarning(
                  `${formatPortionsCl(view?.marcadas ?? 0)} ${(view?.marcadas ?? 0) === 1 ? 'porción' : 'porciones'}`,
                  target.groupName,
                )}
              </Text>
            ) : null}
            <NutritionMotionButton
              accessibilityLabel={`${PORTIONS_COPY.student.sheetMark} de ${target.groupName}`}
              onPress={handleMark}
            >
              {PORTIONS_COPY.student.sheetMark}
            </NutritionMotionButton>
            <NutritionMotionButton
              accessibilityLabel={`${PORTIONS_COPY.student.sheetRegister} en esta comida`}
              tone="neutral"
              onPress={onRegister}
            >
              {PORTIONS_COPY.student.sheetRegister}
            </NutritionMotionButton>
          </View>
        ) : undefined
      }
    >
      {target ? (
        <View className="gap-4">
          {targets.length > 1 ? (
            <View className="flex-row flex-wrap gap-2">
              {targets.map((t) => {
                const active = t.groupCode === target.groupCode
                return (
                  <Pressable
                    key={t.id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={t.groupName}
                    onPress={() => {
                      setActiveGroup(t.groupCode)
                      setConfirmExtra(false)
                    }}
                    className={cx(
                      'min-h-9 flex-row items-center gap-1.5 rounded-pill border px-2.5 py-1',
                      active ? 'border-primary bg-primary/10' : 'border-border-subtle bg-surface-sunken',
                    )}
                  >
                    <GroupDot code={t.groupCode} color={portionTargetColor(t)} size={16} />
                    <Text
                      className={cx(
                        'text-xs font-semibold',
                        active ? 'text-primary' : 'text-text-muted',
                      )}
                    >
                      {t.groupName}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          ) : null}

          <View className="flex-row items-center gap-3">
            <GroupDot code={target.groupCode} color={portionTargetColor(target)} size={36} />
            <View className="min-w-0 flex-1">
              <Text className="text-xs leading-4 text-text-muted">
                {`1 porción ≈ ${Math.round(target.ref.calories)} kcal · P ${formatPortionsCl(target.ref.proteinG)} g · C ${formatPortionsCl(target.ref.carbsG)} g · G ${formatPortionsCl(target.ref.fatsG)} g`}
              </Text>
              {!target.macrosConfirmed ? (
                <View className="mt-1 self-start rounded-pill border border-warning-500/30 bg-warning-500/10 px-2 py-0.5">
                  <Text className="text-[10px] font-semibold text-warning-700">
                    {PORTIONS_COPY.builder.referentialBadge}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <Text className="text-sm font-semibold text-text-strong">
            {PORTIONS_COPY.student.sheetSubtitle}
          </Text>

          {foods.length === 0 ? (
            <Text className="py-6 text-center text-sm text-text-muted">
              Aún no hay alimentos de referencia para este grupo.
            </Text>
          ) : (
            <View>
              {foods.map((food, index) => (
                <View
                  key={food.foodId}
                  className={cx(
                    'min-h-11 flex-row items-center justify-between gap-3 py-2',
                    index > 0 && 'border-t border-border-subtle',
                  )}
                >
                  <Text className="min-w-0 flex-1 text-sm font-semibold text-text-strong" numberOfLines={2}>
                    {food.name}
                    {food.brand ? (
                      <Text className="text-xs font-normal text-text-muted">{` · ${food.brand}`}</Text>
                    ) : null}
                  </Text>
                  <View className="items-end">
                    <Text
                      className={cx(
                        'text-xs font-bold',
                        food.portionLabel ? 'text-text-strong' : 'text-text-muted',
                      )}
                    >
                      {food.portionLabel ?? '—'}
                    </Text>
                    <Text
                      className="font-mono text-[10px] text-text-muted"
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      {food.portionGrams != null ? `${food.portionGrams} g` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : (
        <View />
      )}
    </Sheet>
  )
}
