/**
 * PortionSlotSection — sección "porciones de la franja" dentro de la card del Hoy
 * (SPEC UX-b): hint + chips interactivos por grupo + botón [Equivalencias] siempre
 * visible. Memoizada por franja (hallazgo M3): marcar una porción solo cambia el
 * bucket `pending`/`voids` de SU franja (referencias estables vía
 * `stablePortionBuckets`), así las demás franjas no re-renderizan.
 *
 * La confirmación inline del exceso ("¿Marcar una porción extra?") vive aquí: tap
 * sobre un grupo completo abre la fila de confirmación en vez de marcar directo.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { MotiView } from 'moti'
import { BookOpen } from 'lucide-react-native'
import { exchangeGroupColor } from '@eva/nutrition-engine'
import type { NutritionSlotExchangeTargetRead } from '@eva/nutrition-v2'
import { PORTIONS_COPY } from '../../../lib/nutrition-portions-copy'
import {
  buildPortionCoverageView,
  nextPortionStep,
  orderedPortionTargets,
  pendingPortionsFor,
  pendingVoidPortionsFor,
  type PendingPortionMark,
  type PendingPortionVoid,
  type PortionCoverageView,
} from '../../../lib/nutrition-v2-portions'
import { useEvaMotion } from '../../../lib/motion'
import { useTheme } from '../../../context/ThemeContext'
import { PortionChip } from './PortionChip'

export function portionTargetColor(target: NutritionSlotExchangeTargetRead): string {
  return exchangeGroupColor({ color: target.color, sortOrder: target.orderIndex })
}

export function coverageViewFor(
  target: NutritionSlotExchangeTargetRead,
  pending: ReadonlyArray<PendingPortionMark>,
  voids: ReadonlyArray<PendingPortionVoid>,
): PortionCoverageView {
  const delta = pendingPortionsFor(pending, target.groupCode)
  return buildPortionCoverageView({
    prescribed: target.portions,
    marcadas: target.marcadas ?? 0,
    derivadas: target.derivadas ?? 0,
    pendingMarcadas: delta.portions,
    pendingUnsynced: delta.unsynced,
    voidedPortions: pendingVoidPortionsFor(voids, target.groupCode),
  })
}

export interface PortionSlotSectionProps {
  slotCode: string
  targets: ReadonlyArray<NutritionSlotExchangeTargetRead>
  /** Delta optimista de ESTA franja (referencia estable por bucket). */
  pending: ReadonlyArray<PendingPortionMark>
  voids: ReadonlyArray<PendingPortionVoid>
  onMark: (
    slotCode: string,
    target: NutritionSlotExchangeTargetRead,
    portions: 1 | 0.5,
    completes: boolean,
  ) => void
  onOpenEquivalences: (slotCode: string, groupCode: string) => void
}

const MARK_LOCK_FALLBACK_MS = 2000

function PortionSlotSectionBase({
  slotCode,
  targets,
  pending,
  voids,
  onMark,
  onOpenEquivalences,
}: PortionSlotSectionProps) {
  const { reduced, duration } = useEvaMotion()
  const { theme } = useTheme()
  const [confirmGroup, setConfirmGroup] = useState<string | null>(null)
  const [lockedGroups, setLockedGroups] = useState<ReadonlySet<string>>(() => new Set())
  const lockedGroupsRef = useRef<Set<string>>(new Set())
  const lockTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const previousPendingRef = useRef(pending)
  const orderedTargets = useMemo(() => orderedPortionTargets(targets), [targets])

  const releaseLocks = useCallback(() => {
    for (const timer of lockTimersRef.current.values()) clearTimeout(timer)
    lockTimersRef.current.clear()
    lockedGroupsRef.current = new Set()
    setLockedGroups(lockedGroupsRef.current)
  }, [])

  useEffect(() => {
    if (previousPendingRef.current !== pending) {
      previousPendingRef.current = pending
      releaseLocks()
    }
  }, [pending, releaseLocks])

  useEffect(
    () => () => {
      for (const timer of lockTimersRef.current.values()) clearTimeout(timer)
      lockTimersRef.current.clear()
    },
    [],
  )

  const lockGroup = useCallback((groupCode: string): boolean => {
    if (lockedGroupsRef.current.has(groupCode)) return false
    const next = new Set(lockedGroupsRef.current)
    next.add(groupCode)
    lockedGroupsRef.current = next
    setLockedGroups(next)
    const oldTimer = lockTimersRef.current.get(groupCode)
    if (oldTimer) clearTimeout(oldTimer)
    lockTimersRef.current.set(
      groupCode,
      setTimeout(() => {
        const unlocked = new Set(lockedGroupsRef.current)
        unlocked.delete(groupCode)
        lockedGroupsRef.current = unlocked
        lockTimersRef.current.delete(groupCode)
        setLockedGroups(unlocked)
      }, MARK_LOCK_FALLBACK_MS),
    )
    return true
  }, [])

  const openConfirm = useCallback((groupCode: string) => {
    setConfirmGroup(groupCode)
  }, [])

  const closeConfirm = useCallback(() => {
    setConfirmGroup(null)
  }, [])

  const handlePress = useCallback(
    (target: NutritionSlotExchangeTargetRead) => {
      const view = coverageViewFor(target, pending, voids)
      const step = nextPortionStep(view)
      if (step.requiresConfirm) {
        openConfirm(target.groupCode)
        return
      }
      closeConfirm()
      if (!lockGroup(target.groupCode)) return
      const completes = view.coverage + step.portions + 1e-9 >= view.prescribed
      onMark(slotCode, target, step.portions, completes)
    },
    [closeConfirm, lockGroup, onMark, openConfirm, pending, slotCode, voids],
  )

  const handleConfirmExtra = useCallback(
    (target: NutritionSlotExchangeTargetRead) => {
      closeConfirm()
      if (!lockGroup(target.groupCode)) return
      onMark(slotCode, target, 1, false)
    },
    [closeConfirm, lockGroup, onMark, slotCode],
  )

  if (targets.length === 0) return null

  return (
    <View className="mt-3 border-t border-border-subtle pt-3">
      <Text className="mb-1 text-xs text-text-muted">{PORTIONS_COPY.student.slotHint}</Text>
      {orderedTargets.map((target) => (
        <View key={target.id}>
          <PortionChip
            target={target}
            view={coverageViewFor(target, pending, voids)}
            color={portionTargetColor(target)}
            onPress={() => handlePress(target)}
            onLongPress={() => onOpenEquivalences(slotCode, target.groupCode)}
            disabled={lockedGroups.has(target.groupCode)}
          />
          {confirmGroup === target.groupCode ? (
            <MotiView
              from={reduced ? undefined : { opacity: 0, translateY: -2 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: duration('fast') }}
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              className="mb-1 flex-row flex-wrap items-center gap-2 rounded-control border border-warning-500/30 bg-warning-500/10 px-3 py-2"
            >
              <Text className="min-w-0 flex-1 text-xs leading-4 text-warning-700">
                {PORTIONS_COPY.student.extraConfirm(target.groupName)}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={PORTIONS_COPY.student.extraCancelAria}
                onPress={closeConfirm}
                className="min-h-9 items-center justify-center rounded-control border border-border-default bg-surface-card px-3"
              >
                <Text className="text-xs font-semibold text-text-strong">
                  {PORTIONS_COPY.student.extraCancel}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={PORTIONS_COPY.student.extraConfirm(target.groupName)}
                onPress={() => handleConfirmExtra(target)}
                className="min-h-9 items-center justify-center rounded-control border border-warning-500 bg-warning-500 px-3"
              >
                <Text className="text-xs font-semibold text-on-warning">
                  {PORTIONS_COPY.student.extraConfirmYes}
                </Text>
              </Pressable>
            </MotiView>
          ) : null}
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${PORTIONS_COPY.student.equivalences} de esta comida`}
        onPress={() => onOpenEquivalences(slotCode, orderedTargets[0].groupCode)}
        className="mt-2 min-h-9 flex-row items-center gap-1.5 self-start rounded-control px-2.5"
      >
        <BookOpen color={theme.primary} size={16} />
        <Text className="text-sm font-semibold text-primary">{PORTIONS_COPY.student.equivalences}</Text>
      </Pressable>
    </View>
  )
}

export const PortionSlotSection = memo(PortionSlotSectionBase)
