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
import { Copy, Loader2, MoreVertical, Plus, RefreshCcw } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { NUTRITION_MOTION } from '@eva/nutrition-v2'
import type { ExchangeGroup } from '@eva/nutrition-engine'
import { EXCHANGE_GROUP_NAME_MAX } from '@eva/schemas/nutrition-exchanges'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import { PortionsGroupDot } from './PortionsGroupDot'
import {
  PortionsGroupForm,
  suggestFreeExchangeGroupCode,
  type ExchangeGroupFormValues,
} from './PortionsGroupForm'
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

/**
 * Segunda linea de la fila: cuantas equivalencias vera el alumno. `undefined` = el conteo no
 * viajo (falla tolerada del catalogo) y no se pinta nada — mejor callar que mentir un cero.
 */
function foodsHint(count: number | undefined): { text: string; empty: boolean } | null {
  if (count == null) return null
  if (count === 0) return { text: PORTIONS_COPY.builder.groupFoodsEmpty, empty: true }
  return { text: PORTIONS_COPY.builder.groupFoodCount(count), empty: false }
}

function GroupOption({
  group,
  used,
  foodCount,
  onPick,
}: {
  group: ExchangeGroup
  used: boolean
  foodCount: number | undefined
  onPick: () => void
}) {
  const reduceMotion = useReducedMotion()
  const foods = foodsHint(foodCount)
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
    </motion.button>
  )
}

/**
 * Menú ⋯ de una fila PROPIA (jamás en las system: `xg_update/xg_delete` las niegan y el
 * schema las rechaza). Se resuelve inline en vez de con un dropdown portaleado para no
 * anidar Radix dentro del popover/sheet del picker.
 */
function CustomGroupRow({
  group,
  used,
  foodCount,
  menuOpen,
  confirmingDelete,
  busy,
  onPick,
  onToggleMenu,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  group: ExchangeGroup
  used: boolean
  foodCount: number | undefined
  menuOpen: boolean
  confirmingDelete: boolean
  busy: boolean
  onPick: () => void
  onToggleMenu: () => void
  onEdit: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) {
  const copy = PORTIONS_COPY.groupEditor
  return (
    <div>
      <div className="flex items-center gap-0.5">
        <div className="min-w-0 flex-1">
          <GroupOption group={group} used={used} foodCount={foodCount} onPick={onPick} />
        </div>
        <button
          type="button"
          aria-label={copy.manageAria(group.name)}
          aria-expanded={menuOpen}
          onClick={onToggleMenu}
          className="inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-sunken hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreVertical aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      {menuOpen && !confirmingDelete ? (
        <div className="mb-1 ml-9 flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="min-h-9 rounded-control px-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {copy.edit}
          </button>
          <button
            type="button"
            onClick={onAskDelete}
            className="min-h-9 rounded-control px-2 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-rose-400"
          >
            {copy.delete}
          </button>
        </div>
      ) : null}

      {confirmingDelete ? (
        <div className="mb-1 ml-9 rounded-control border border-border-subtle bg-surface-sunken p-2">
          <p className="text-xs font-semibold text-strong">{copy.deleteConfirmTitle(group.name)}</p>
          <p className="mt-0.5 text-[11px] text-muted">{copy.deleteInUseNotice}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={onCancelDelete}
              disabled={busy}
              className="min-h-9 flex-1 rounded-control border border-border-default bg-surface-card px-2 text-xs font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {copy.cancel}
            </button>
            <button
              type="button"
              onClick={onConfirmDelete}
              disabled={busy}
              className="min-h-9 flex-1 rounded-control bg-rose-600 px-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {copy.deleteConfirm}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Contenido compartido popover/sheet: loading, error con reintento, o lista. */
function GroupList({
  controller,
  usedGroupIds,
  onPick,
  onCreate,
  onDuplicate,
  onEdit,
  busy,
  actionError,
}: {
  controller: PortionsController
  usedGroupIds: string[]
  onPick: (exchangeGroupId: string) => void
  onCreate: () => void
  onDuplicate: (group: ExchangeGroup) => void
  onEdit: (group: ExchangeGroup) => void
  busy: boolean
  actionError: string | null
}) {
  const { groups, groupsLoading, groupsError } = controller
  const [menuGroupId, setMenuGroupId] = useState<string | null>(null)
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null)
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
        // Los grupos del sistema son inmutables (RLS `xg_update` los niega), asi que en vez de
        // "Editar" ofrecen "Duplicar": es la respuesta al pedido real del coach ("el cereal
        // aporta 15 g de carbos y yo trabajo con 20"). Se crea un grupo PROPIO con los macros
        // precargados, sin tocar el del sistema ni los planes que ya lo usan.
        <div key={group.id} className="flex items-center gap-0.5">
          <div className="min-w-0 flex-1">
            <GroupOption
              group={group}
              used={used.has(group.id)}
              foodCount={controller.groupFoodCounts[group.id]}
              onPick={() => onPick(group.id)}
            />
          </div>
          <button
            type="button"
            aria-label={PORTIONS_COPY.groupEditor.duplicateAria(group.name)}
            title={PORTIONS_COPY.groupEditor.duplicate}
            onClick={() => onDuplicate(group)}
            className="inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-sunken hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Copy aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      ))}
      <div className="my-1 border-t border-border-subtle" aria-hidden="true" />
      {custom.map((group) => (
        <CustomGroupRow
          key={group.id}
          group={group}
          used={used.has(group.id)}
          foodCount={controller.groupFoodCounts[group.id]}
          menuOpen={menuGroupId === group.id}
          confirmingDelete={deletingGroupId === group.id}
          busy={busy}
          onPick={() => onPick(group.id)}
          onToggleMenu={() => {
            setDeletingGroupId(null)
            setMenuGroupId((prev) => (prev === group.id ? null : group.id))
          }}
          onEdit={() => {
            setMenuGroupId(null)
            onEdit(group)
          }}
          onAskDelete={() => setDeletingGroupId(group.id)}
          onCancelDelete={() => setDeletingGroupId(null)}
          onConfirmDelete={() => {
            void controller.deleteGroup(group.id).then(() => {
              setDeletingGroupId(null)
              setMenuGroupId(null)
            })
          }}
        />
      ))}

      {/* Entrada a la creación: SIEMPRE al final de la lista custom (SPEC UX P-A). */}
      <button
        type="button"
        onClick={onCreate}
        className="flex min-h-12 w-full items-center gap-2.5 rounded-control px-2 py-1.5 text-left text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-primary/60"
        >
          <Plus className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold">{PORTIONS_COPY.groupEditor.createRow}</span>
      </button>

      {actionError ? (
        <p role="alert" className="px-2 pb-1 text-xs font-medium text-rose-600 dark:text-rose-400">
          {actionError}
        </p>
      ) : null}
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
  // 'list' = catálogo; 'form' = alta/edición de un grupo propio DENTRO del mismo popover/sheet.
  // `preset` = creacion PRECARGADA desde un grupo del sistema ("Duplicar y ajustar").
  const [editing, setEditing] = useState<{
    group: ExchangeGroup | null
    preset?: ExchangeGroupFormValues
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const isDesktop = useIsDesktopMd()

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      controller.ensureGroupsLoaded()
    } else {
      setEditing(null)
      setActionError(null)
    }
  }

  function pick(exchangeGroupId: string) {
    onPick(exchangeGroupId)
    setOpen(false)
  }

  async function submitGroup(values: ExchangeGroupFormValues) {
    if (!editing) return
    setBusy(true)
    setActionError(null)
    const res = editing.group
      ? await controller.updateGroup(editing.group.id, values)
      : await controller.createGroup(values)
    setBusy(false)
    if (!res.ok) {
      setActionError(res.error)
      return
    }
    // Vuelve a la lista SIN cerrar el picker: el grupo recién creado ya aparece y queda
    // seleccionable de inmediato (criterio de aceptación P-A).
    setEditing(null)
  }

  async function deleteGroup(groupId: string) {
    setBusy(true)
    setActionError(null)
    const res = await controller.deleteGroup(groupId)
    setBusy(false)
    if (!res.ok) setActionError(res.error)
    return res
  }

  const listProps = {
    controller: { ...controller, deleteGroup },
    usedGroupIds,
    onPick: pick,
    onCreate: () => {
      setActionError(null)
      setEditing({ group: null })
    },
    onDuplicate: (group: ExchangeGroup) => {
      setActionError(null)
      // El codigo se sugiere LIBRE contra el catalogo ya cargado (la unicidad la impone el
      // servicio igual; esto solo evita el viaje que iba a fallar).
      const taken = (controller.groups ?? []).map((candidate) => candidate.code)
      setEditing({
        group: null,
        preset: {
          name: PORTIONS_COPY.groupEditor
            .duplicateSuffix(group.name)
            .slice(0, EXCHANGE_GROUP_NAME_MAX),
          code: suggestFreeExchangeGroupCode(group.code, taken),
          refCalories: group.refCalories,
          refProteinG: group.refProteinG,
          refCarbsG: group.refCarbsG,
          refFatsG: group.refFatsG,
          color: group.color,
        },
      })
    },
    onEdit: (group: ExchangeGroup) => {
      setActionError(null)
      setEditing({ group })
    },
    busy,
    actionError,
  }

  const body = editing ? (
    <PortionsGroupForm
      // Remonta el form al cambiar de grupo: el estado local arranca del grupo correcto.
      key={editing.group?.id ?? (editing.preset ? 'duplicado-' + editing.preset.code : 'nuevo')}
      group={editing.group}
      initial={editing.preset ?? null}
      submitting={busy}
      serverError={actionError}
      onCancel={() => {
        setEditing(null)
        setActionError(null)
      }}
      onSubmit={(values) => void submitGroup(values)}
    />
  ) : (
    <GroupList {...listProps} />
  )

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
          {body}
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
              {editing
                ? editing.group
                  ? PORTIONS_COPY.groupEditor.editTitle
                  : PORTIONS_COPY.groupEditor.createTitle
                : PORTIONS_COPY.builder.addGroup}
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(env(safe-area-inset-bottom,0px),0.75rem)] pt-1">
            {body}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
