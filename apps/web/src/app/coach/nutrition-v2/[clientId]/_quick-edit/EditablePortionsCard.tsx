'use client'

/**
 * Seccion "Porciones a eleccion" del quick-edit (SPEC UX-a, T1.2): hermana de la lista de
 * alimentos DENTRO de la card de franja (EditableSlotCard la monta bajo "+ Agregar
 * alimento"). Misma fila grupo+stepper del builder: circulito con el codigo del grupo
 * (color de identidad `exchangeGroupColor`, letra blanca) + nombre + StepperField adaptado
 * a paso 0,5 (minimo 0,5) + eliminar con snackbar Deshacer. Altas via bottom sheet con los
 * grupos que el plan YA usa (snapshots congelados del read model — el quick-edit no tiene
 * canal de catalogo vivo en F1; grupos nuevos al plan se agregan desde el builder).
 * Los cambios cuentan en la barra "N cambios sin publicar" y publican por el pipeline
 * existente (persistAndPublishDraft congela snapshots server-side; cero RPC nuevo).
 * Plan sin porciones => la seccion NO se pinta (capa invisible, SPEC UX-c).
 */

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { exchangeGroupColor } from '@eva/nutrition-engine'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  type QePortionGroup,
  type QePortionTarget,
  type QeSlot,
} from './quick-edit-state'
import { useQuickEdit, genQuickEditKey } from './QuickEditProvider'
import { StepperField } from './StepperField'
import { QE_COPY } from './microcopy'

/** Circulito de identidad del grupo: color del catalogo SOLO aqui, letra blanca (SPEC UX). */
function GroupDot({ group, sortOrder }: { group: { groupCode: string; color: string | null }; sortOrder: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold leading-none text-white"
      style={{ backgroundColor: exchangeGroupColor({ color: group.color, sortOrder }) }}
    >
      {group.groupCode.slice(0, 3)}
    </span>
  )
}

export function EditablePortionsCard({ variantKey, slot }: { variantKey: string; slot: QeSlot }) {
  const { portionGroups } = useQuickEdit()
  const [pickerOpen, setPickerOpen] = useState(false)

  // Plan sin capa de porciones: CERO UI nueva (SPEC UX-c). Los grupos elegibles derivan
  // del read model, asi que un plan sin targets nunca pinta esta seccion.
  if (portionGroups.length === 0 && slot.portionTargets.length === 0) return null

  const usedGroupIds = new Set(slot.portionTargets.map((target) => target.exchangeGroupId))
  const groupOrder = new Map(portionGroups.map((group, index) => [group.exchangeGroupId, index]))

  return (
    <section aria-label={PORTIONS_COPY.builder.sectionTitle} className="mt-3 border-t border-border-subtle pt-3">
      <p className="text-sm font-medium text-strong">{PORTIONS_COPY.builder.sectionTitle}</p>
      <p className="mt-0.5 text-xs text-muted">{PORTIONS_COPY.builder.sectionHint}</p>

      {slot.portionTargets.length > 0 ? (
        <div className="mt-2 space-y-2">
          {slot.portionTargets.map((target, index) => (
            <PortionTargetRow
              key={target.key}
              variantKey={variantKey}
              slotKey={slot.key}
              target={target}
              index={index}
              sortOrder={groupOrder.get(target.exchangeGroupId) ?? 0}
            />
          ))}
        </div>
      ) : null}

      {portionGroups.length > 0 ? (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-control px-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 active:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          {PORTIONS_COPY.builder.addGroup}
        </button>
      ) : null}

      <GroupPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        groups={portionGroups}
        usedGroupIds={usedGroupIds}
        onPicked={() => setPickerOpen(false)}
        variantKey={variantKey}
        slotKey={slot.key}
      />
    </section>
  )
}

function PortionTargetRow({
  variantKey,
  slotKey,
  target,
  index,
  sortOrder,
}: {
  variantKey: string
  slotKey: string
  target: QePortionTarget
  index: number
  sortOrder: number
}) {
  const { dispatch, errors, showErrors, isPending } = useQuickEdit()
  const portionsError = showErrors ? errors[`portion.${target.key}.portions`] : undefined

  function handleRemove() {
    const removed = target
    dispatch({ type: 'REMOVE_PORTION_TARGET', variantKey, slotKey, targetKey: target.key })
    toast(PORTIONS_COPY.builder.groupRemoved(removed.groupName), {
      duration: 5000,
      action: {
        label: QE_COPY.undo,
        onClick: () => dispatch({ type: 'RESTORE_PORTION_TARGET', variantKey, slotKey, index, target: removed }),
      },
    })
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <GroupDot group={target} sortOrder={sortOrder} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-strong">{target.groupName}</span>
            {!target.macrosConfirmed ? (
              <span className="block truncate text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                {PORTIONS_COPY.builder.referentialBadge}
              </span>
            ) : null}
          </span>
        </div>
        {/* Stepper de ancho fijo (SPEC UX-a: en <380px trunca el nombre, nunca el stepper). */}
        <div className="w-36 shrink-0">
          <StepperField
            label={`Porciones de ${target.groupName}`}
            value={target.portions}
            invalid={Boolean(portionsError)}
            disabled={isPending}
            onChange={(value) =>
              dispatch({ type: 'SET_PORTION_TARGET', variantKey, slotKey, targetKey: target.key, value })
            }
            onStep={(direction) =>
              dispatch({ type: 'STEP_PORTION_TARGET', variantKey, slotKey, targetKey: target.key, direction })
            }
          />
        </div>
        <button
          type="button"
          aria-label={`Quitar porciones de ${target.groupName}`}
          title="Quitar grupo"
          disabled={isPending}
          onClick={handleRemove}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-border-subtle bg-surface-card text-muted transition-colors hover:bg-surface-sunken hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:text-rose-400"
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      {portionsError ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{portionsError}</p> : null}
    </div>
  )
}

/**
 * Bottom sheet de altas: lista los grupos del plan (circulito + nombre + referencia por
 * porcion); los ya presentes en la franja quedan deshabilitados ("Ya esta en esta comida").
 */
function GroupPickerSheet({
  open,
  onOpenChange,
  groups,
  usedGroupIds,
  variantKey,
  slotKey,
  onPicked,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: QePortionGroup[]
  usedGroupIds: Set<string>
  variantKey: string
  slotKey: string
  onPicked: () => void
}) {
  const { dispatch } = useQuickEdit()

  function handlePick(group: QePortionGroup) {
    dispatch({ type: 'ADD_PORTION_TARGET', variantKey, slotKey, key: genQuickEditKey(), group })
    onPicked()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-card bg-surface-card text-body dark:bg-surface-card">
        <SheetHeader className="border-border-subtle bg-transparent p-4 pb-2 dark:border-border-subtle">
          <SheetTitle className="pr-10 font-display text-lg font-semibold normal-case tracking-tight text-strong">
            {PORTIONS_COPY.builder.addGroup}
          </SheetTitle>
        </SheetHeader>
        <ul className="max-h-[60vh] space-y-1 overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom,0px),1rem)]">
          {groups.map((group, index) => {
            const used = usedGroupIds.has(group.exchangeGroupId)
            return (
              <li key={group.exchangeGroupId}>
                <button
                  type="button"
                  disabled={used}
                  onClick={() => handlePick(group)}
                  className="flex min-h-12 w-full items-center gap-3 rounded-control px-2 py-2 text-left transition-colors hover:bg-surface-sunken active:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <GroupDot group={group} sortOrder={index} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-strong">{group.groupName}</span>
                      {!group.macrosConfirmed ? (
                        <span className="shrink-0 rounded-pill border border-amber-300 bg-amber-50 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                          {PORTIONS_COPY.builder.referentialBadge}
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {used
                        ? PORTIONS_COPY.builder.groupUsed
                        : `1 porción ≈ ${Math.round(group.ref.calories)} kcal · ${Math.round(group.ref.carbsG)} C · ${Math.round(group.ref.proteinG)} P`}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </SheetContent>
    </Sheet>
  )
}
