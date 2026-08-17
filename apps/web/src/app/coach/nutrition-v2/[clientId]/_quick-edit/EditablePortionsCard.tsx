'use client'

/**
 * Seccion "Porciones a eleccion" del quick-edit (SPEC UX-a, T1.2): hermana de la lista de
 * alimentos DENTRO de la card de franja (EditableSlotCard la monta bajo "+ Agregar
 * alimento"). Misma fila grupo+stepper del builder: circulito con el codigo del grupo
 * (color de identidad `exchangeGroupColor`, letra blanca) + nombre + StepperField adaptado
 * a paso 0,5 (minimo 0,5) + eliminar con snackbar Deshacer. Altas via picker (bottom sheet en
 * movil, dialogo centrado en desktop) con los grupos del plan MAS el catalogo vivo del coach
 * (`portionGroupChoices`): hasta 08-04 solo ofrecia los del plan y el coach que queria sumar
 * otro grupo veia una lista donde todo decia "Ya está en esta comida".
 *
 * F4: el conteo de equivalencias (`portionFoodCounts` del provider) SI viene del catalogo
 * vivo — es la unica lectura viva de esta seccion, y es informativa: dice cuantos alimentos
 * vera el alumno en "1 porción equivale a" y avisa el grupo vacio, que es el defecto real
 * (el alumno abre el sheet y no encuentra ningun ejemplo). Si no llega, se calla.
 *
 * Los cambios cuentan en la barra "N cambios sin publicar" y publican por el pipeline
 * existente (persistAndPublishDraft congela snapshots server-side; cero RPC nuevo).
 * Plan sin porciones => la seccion NO se pinta (capa invisible, SPEC UX-c).
 */

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { exchangeGroupColor } from '@eva/nutrition-engine'
import { AddActionButton, useBrandPrimaryHex } from '@/components/nutrition-v2'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import {
  type QePortionGroup,
  type QePortionTarget,
  type QeSlot,
} from '@eva/nutrition-v2'
import { useQuickEdit, genQuickEditKey } from './QuickEditProvider'
import { QeBottomSheet } from './QeBottomSheet'
import { StepperField } from './StepperField'
import { QE_COPY } from './microcopy'

/**
 * Linea de apoyo con las equivalencias del grupo. `undefined` = el conteo no viajo y NO se
 * pinta nada: mejor callar que mentir un cero (misma semantica que `foodsHint` del picker del
 * builder, `PortionsGroupPicker`).
 */
function foodsHint(count: number | undefined): { text: string; empty: boolean } | null {
  if (count == null) return null
  if (count === 0) return { text: PORTIONS_COPY.builder.groupFoodsEmpty, empty: true }
  return { text: PORTIONS_COPY.builder.groupFoodCount(count), empty: false }
}

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
  const { portionGroups, portionGroupChoices } = useQuickEdit()
  const [pickerOpen, setPickerOpen] = useState(false)
  // Antes del early-return de abajo: los hooks no pueden quedar detrás de un `return null`.
  const brandHex = useBrandPrimaryHex()

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

      {portionGroupChoices.length > 0 ? (
        // Familia N: el alta de un grupo de porciones comparte silueta con el resto de las altas
        // del editor (ícono ilustrado + «+» en el acento de marca). Mismo handler: abre el picker
        // de grupos del catálogo del coach.
        <div className="mt-2">
          <AddActionButton
            icon="porciones"
            label={PORTIONS_COPY.builder.addGroup}
            brandColor={brandHex}
            onClick={() => setPickerOpen(true)}
            data-testid="qe-add-portion-group"
          />
        </div>
      ) : null}

      {/* Una sola vez por seccion (no por fila): que pasa con lo que ya esta publicado. */}
      <p className="mt-2 rounded-control bg-surface-sunken px-2 py-1.5 text-[11px] leading-relaxed text-muted">
        {QE_COPY.portionsPublishNotice}
      </p>

      <GroupPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        groups={portionGroupChoices}
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
  const { dispatch, errors, showErrors, isPending, portionFoodCounts } = useQuickEdit()
  const portionsError = showErrors ? errors[`portion.${target.key}.portions`] : undefined
  // Grupo sin equivalencias: el alumno vera el chip y podra marcar porciones, pero el sheet
  // "1 porción equivale a" le sale vacio. Se avisa ACA, donde el coach ya decidio usarlo.
  const sinAlimentos = portionFoodCounts?.[target.exchangeGroupId] === 0

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
      {sinAlimentos ? (
        <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
          {PORTIONS_COPY.builder.groupFoodsEmpty}.{' '}
          <span className="font-normal text-muted">{PORTIONS_COPY.builder.groupFoodsEmptyHint}</span>
        </p>
      ) : null}
      {portionsError ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{portionsError}</p> : null}
    </div>
  )
}

/**
 * Picker de altas (sheet en movil / dialogo en desktop): lista los grupos del plan y despues
 * el resto del catalogo del coach (circulito + nombre + referencia por porcion + equivalencias
 * que vera el alumno); los ya presentes en la franja quedan deshabilitados ("Ya esta en esta
 * comida").
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
  const { dispatch, portionFoodCounts } = useQuickEdit()

  function handlePick(group: QePortionGroup) {
    dispatch({ type: 'ADD_PORTION_TARGET', variantKey, slotKey, key: genQuickEditKey(), group })
    onPicked()
  }

  return (
    <QeBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={PORTIONS_COPY.builder.addGroup}
      bodyClassName="space-y-2"
    >
      <p className="text-xs leading-5 text-muted">{QE_COPY.portionsPickerHint}</p>
      <ul className="-mx-1 space-y-1 px-1">
        {groups.map((group, index) => {
          const used = usedGroupIds.has(group.exchangeGroupId)
          const foods = foodsHint(portionFoodCounts?.[group.exchangeGroupId])
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
                  {!used && foods ? (
                    <span
                      className={
                        'block truncate text-[11px] ' +
                        (foods.empty ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-subtle')
                      }
                    >
                      {foods.text}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </QeBottomSheet>
  )
}
