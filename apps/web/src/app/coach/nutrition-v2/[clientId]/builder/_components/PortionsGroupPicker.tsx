'use client'

/**
 * Picker de grupos de intercambio para "Porciones a elección" (T1.1 — SPEC UX-a/UX-c):
 * popover en desktop, bottom sheet en móvil (mismo patrón split del repo). Los 9
 * grupos system van PRIMERO y los custom del coach después (orden del controller);
 * cada opción muestra circulito + nombre + macros de referencia por porción; los
 * grupos ya usados en la franja quedan deshabilitados; `macros_confirmed=false`
 * lleva badge "Valores referenciales" en tono warning.
 *
 * El catálogo se carga vía server action al abrir (los services V1 jamás entran al
 * bundle cliente — boundary F4). Error de carga => estado con reintento; los items
 * fijos de la franja nunca se bloquean (SPEC UX-c).
 */

import { useState, useSyncExternalStore } from 'react'
import { Loader2, Plus, RefreshCcw } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { NUTRITION_MOTION } from '@eva/nutrition-v2'
import type { ExchangeGroup } from '@eva/nutrition-engine'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import { PortionsGroupDot } from './PortionsGroupDot'
import type { PortionsController } from './PortionsSection'

// matchMedia md-up (mismo patrón que useIsDesktopMd del builder de workouts, copiado
// para no acoplar módulos): desktop => popover, móvil => bottom sheet.
function subscribeMd(cb: () => void) {
  const mq = window.matchMedia('(min-width: 768px)')
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

function useIsDesktopMd(): boolean {
  return useSyncExternalStore(
    subscribeMd,
    () => window.matchMedia('(min-width: 768px)').matches,
    () => true,
  )
}

const ghostTriggerClass =
  'inline-flex min-h-9 items-center gap-1.5 rounded-control px-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Hint de referencia por porción: "1 porción ≈ 70 kcal · 15 C · 2 P · 0 G" (desde ref_*). */
function refHint(group: ExchangeGroup): string {
  const kcal = Math.round(group.refCalories)
  const c = Math.round(group.refCarbsG)
  const p = Math.round(group.refProteinG)
  const g = Math.round(group.refFatsG)
  return `1 porción ≈ ${kcal} kcal · ${c} C · ${p} P · ${g} G`
}

function GroupOption({
  group,
  used,
  onPick,
}: {
  group: ExchangeGroup
  used: boolean
  onPick: () => void
}) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.button
      type="button"
      disabled={used}
      onClick={onPick}
      whileTap={used || reduceMotion ? undefined : { scale: NUTRITION_MOTION.press.scale }}
      className="flex min-h-12 w-full items-center gap-2.5 rounded-control px-2 py-1.5 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      <PortionsGroupDot group={group} size="md" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-strong">{group.name}</span>
          {!group.macrosConfirmed ? (
            <span className="shrink-0 rounded-pill border border-amber-300/60 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
              {PORTIONS_COPY.builder.referentialBadge}
            </span>
          ) : null}
        </span>
        <span className="block truncate text-xs text-muted">
          {used ? PORTIONS_COPY.builder.groupUsed : refHint(group)}
        </span>
      </span>
    </motion.button>
  )
}

/** Contenido compartido popover/sheet: loading, error con reintento, o lista. */
function GroupList({
  controller,
  usedGroupIds,
  onPick,
}: {
  controller: PortionsController
  usedGroupIds: string[]
  onPick: (exchangeGroupId: string) => void
}) {
  const { groups, groupsLoading, groupsError } = controller
  if (groupsLoading && groups == null) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        {PORTIONS_COPY.builder.pickerLoading}
      </div>
    )
  }
  if (groups == null) {
    // Estado de error del catálogo con reintento (SPEC UX-c). La franja sigue editable.
    return (
      <div className="flex flex-col items-center gap-2 py-5 text-center">
        <p className="text-sm text-muted">{groupsError ?? PORTIONS_COPY.builder.pickerError}</p>
        <button
          type="button"
          onClick={controller.retryGroups}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RefreshCcw aria-hidden="true" className="h-3.5 w-3.5" />
          {PORTIONS_COPY.builder.pickerRetry}
        </button>
      </div>
    )
  }

  const used = new Set(usedGroupIds)
  const system = groups.filter((g) => g.isSystem)
  const custom = groups.filter((g) => !g.isSystem)
  return (
    <div className="space-y-0.5">
      {system.map((group) => (
        <GroupOption key={group.id} group={group} used={used.has(group.id)} onPick={() => onPick(group.id)} />
      ))}
      {custom.length > 0 ? <div className="my-1 border-t border-border-subtle" aria-hidden="true" /> : null}
      {custom.map((group) => (
        <GroupOption key={group.id} group={group} used={used.has(group.id)} onPick={() => onPick(group.id)} />
      ))}
    </div>
  )
}

export function PortionsGroupPicker({
  slotName,
  usedGroupIds,
  controller,
  onPick,
}: {
  slotName: string
  usedGroupIds: string[]
  controller: PortionsController
  onPick: (exchangeGroupId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const isDesktop = useIsDesktopMd()

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) controller.ensureGroupsLoaded()
  }

  function pick(exchangeGroupId: string) {
    onPick(exchangeGroupId)
    setOpen(false)
  }

  const triggerLabel = `${PORTIONS_COPY.builder.addGroup} a ${slotName || 'la franja'}`

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger aria-label={triggerLabel} className={ghostTriggerClass}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          {PORTIONS_COPY.builder.addGroup}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="max-h-96 w-80 overflow-y-auto rounded-card border border-border-subtle bg-surface-card p-1.5 text-body shadow-lg"
        >
          <GroupList controller={controller} usedGroupIds={usedGroupIds} onPick={pick} />
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <>
      <button type="button" aria-label={triggerLabel} onClick={() => handleOpenChange(true)} className={ghostTriggerClass}>
        <Plus aria-hidden="true" className="h-4 w-4" />
        {PORTIONS_COPY.builder.addGroup}
      </button>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] rounded-t-card bg-surface-card text-body dark:bg-surface-card"
        >
          <SheetHeader className="border-border-subtle bg-transparent p-4 pb-2 dark:border-border-subtle">
            <SheetTitle className="pr-10 font-display text-base font-semibold normal-case tracking-tight text-strong">
              {PORTIONS_COPY.builder.addGroup}
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(env(safe-area-inset-bottom,0px),0.75rem)] pt-1">
            <GroupList controller={controller} usedGroupIds={usedGroupIds} onPick={pick} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
