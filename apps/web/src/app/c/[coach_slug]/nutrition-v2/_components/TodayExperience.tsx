'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Pencil, Plus, ScanBarcode, Trash2, Utensils } from 'lucide-react'
import {
  createNutritionMacroValue,
  type FoodCatalogItem,
  type NutritionIntakeReadItem,
  type NutritionTodayReadModel,
} from '@eva/nutrition-v2'
import {
  FoodRow,
  MacroBudget,
  NutritionCard,
  NutritionMotionButton,
  NutritionStatePanel,
  PlanVersionBadge,
  StrategyBadge,
} from '@/components/nutrition-v2'
import { formatNutritionShortDate } from '@/lib/date-utils'
import { TodayModal } from './TodayModal'
import {
  buildCatalogIntakePayload,
  buildCorrectionPayload,
  buildPrescribedIntakePayload,
  buildVoidPayload,
  consumedEntries,
  contextFromToday,
  entryToFoodRow,
  isPrescriptionConsumed,
  mealSlotOptions,
  newIdempotencyKey,
} from './nutrition-today.logic'
import {
  closeDayAction,
  correctIntakeAction,
  recordIntakeAction,
  searchFoodCatalogAction,
  voidIntakeAction,
} from '../_actions/intake.actions'

type DialogState =
  | { kind: 'none' }
  | { kind: 'register' }
  | { kind: 'edit'; entry: NutritionIntakeReadItem }
  | { kind: 'void'; entry: NutritionIntakeReadItem }
  | { kind: 'close' }

export function TodayExperience({
  today,
  clientId,
  revalidatePath,
  scanHref,
}: {
  today: NutritionTodayReadModel
  clientId: string
  revalidatePath: string
  scanHref: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' })

  const ctx = useMemo(() => contextFromToday(today, clientId), [today, clientId])
  const entries = useMemo(() => consumedEntries(today), [today])
  const slotOptions = useMemo(() => mealSlotOptions(today), [today])

  function runMutation(
    id: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
    onSuccess?: () => void,
  ) {
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      try {
        const res = await action()
        if (!res.ok) {
          setError(res.error ?? 'No se pudo completar la acción.')
          return
        }
        onSuccess?.()
        router.refresh()
      } finally {
        setBusyId(null)
      }
    })
  }

  const closeDialog = () => setDialog({ kind: 'none' })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {today.plan ? <StrategyBadge strategy={today.plan.strategy} /> : null}
        {today.plan ? (
          <PlanVersionBadge
            version={today.plan.versionNumber}
            status={today.plan.status}
            effectiveLabel={`desde ${formatNutritionShortDate(today.plan.effectiveFrom)}`}
          />
        ) : null}
        {today.snapshotId ? (
          <span className="inline-flex items-center gap-1.5 rounded-pill border border-emerald-300/60 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Día registrado
          </span>
        ) : null}
      </div>

      <MacroBudget
        calories={{ consumed: today.consumed.calories, target: today.targets.calories ?? 0 }}
        macros={[
          createNutritionMacroValue('protein', {
            consumed: today.consumed.proteinG,
            target: today.targets.proteinG ?? 0,
          }),
          createNutritionMacroValue('carbs', {
            consumed: today.consumed.carbsG,
            target: today.targets.carbsG ?? 0,
          }),
          createNutritionMacroValue('fats', {
            consumed: today.consumed.fatsG,
            target: today.targets.fatsG ?? 0,
          }),
        ]}
      />

      {error ? (
        <div
          aria-live="assertive"
          className="flex items-start gap-2 rounded-card border border-rose-300/60 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-700/50 dark:bg-rose-950/30 dark:text-rose-300"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* CTA principal unico */}
      <div className="flex flex-wrap gap-2">
        <NutritionMotionButton onClick={() => setDialog({ kind: 'register' })}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Registrar alimento
        </NutritionMotionButton>
        <Link
          href={scanHref}
          className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken"
        >
          <ScanBarcode className="h-4 w-4" aria-hidden="true" />
          Escanear
        </Link>
      </div>

      {/* Prescripcion del dia con "Lo comi" por item */}
      <PrescribedSection
        today={today}
        busyId={busyId}
        isPending={isPending}
        onEat={(slot, item) => {
          const id = `eat:${item.id}`
          runMutation(id, () =>
            recordIntakeAction({
              payload: buildPrescribedIntakePayload({
                context: ctx,
                slot,
                item,
                idempotencyKey: newIdempotencyKey('intake'),
              }),
              revalidatePath,
            }),
          )
        }}
      />

      {/* Consumido hoy */}
      <section aria-label="Consumido hoy" className="space-y-3">
        <div className="flex items-center gap-2">
          <Utensils className="h-4 w-4 text-primary dark:text-primary" aria-hidden="true" />
          <h2 className="font-display text-lg font-semibold text-strong">Consumido hoy</h2>
        </div>
        {entries.length === 0 ? (
          <NutritionStatePanel
            icon="empty"
            title="Todavía no registras alimentos"
            description="Marca lo que comiste del plan o agrega un alimento libre para llenar tu presupuesto del día."
          />
        ) : (
          <NutritionCard>
            <div className="divide-y divide-border-subtle">
              {entries.map((entry) => (
                <FoodRow
                  key={entry.id}
                  food={entryToFoodRow(entry)}
                  actions={
                    <div className="flex items-center gap-1">
                      <IconButton
                        label="Editar cantidad"
                        onClick={() => setDialog({ kind: 'edit', entry })}
                        disabled={isPending}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label="Retirar registro"
                        tone="danger"
                        onClick={() => setDialog({ kind: 'void', entry })}
                        disabled={isPending}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                    </div>
                  }
                />
              ))}
            </div>
          </NutritionCard>
        )}
      </section>

      {/* Cierre del dia */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-subtle bg-surface-card p-4 shadow-sm">
        <div className="min-w-0">
          <p className="font-display text-base font-semibold text-strong">Cerrar mi día</p>
          <p className="mt-0.5 text-sm text-muted">
            Congela tus objetivos y registros de hoy en tu historial.
          </p>
        </div>
        <NutritionMotionButton tone="neutral" onClick={() => setDialog({ kind: 'close' })}>
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Cerrar mi día
        </NutritionMotionButton>
      </div>

      {dialog.kind === 'register' ? (
        <RegisterFoodDialog
          clientId={clientId}
          slotOptions={slotOptions}
          onClose={closeDialog}
          onSubmit={(food, quantity, unit, mealSlotCode) => {
            runMutation(
              'register',
              () =>
                recordIntakeAction({
                  payload: buildCatalogIntakePayload({
                    context: ctx,
                    food,
                    quantity,
                    unit,
                    mealSlotCode,
                    idempotencyKey: newIdempotencyKey('intake'),
                  }),
                  revalidatePath,
                }),
              closeDialog,
            )
          }}
          submitting={isPending && busyId === 'register'}
        />
      ) : null}

      {dialog.kind === 'edit' ? (
        <EditQuantityDialog
          entry={dialog.entry}
          onClose={closeDialog}
          submitting={isPending && busyId === `edit:${dialog.entry.id}`}
          onSubmit={(newQuantity, reason) => {
            runMutation(
              `edit:${dialog.entry.id}`,
              () =>
                correctIntakeAction({
                  payload: buildCorrectionPayload({
                    context: ctx,
                    entry: dialog.entry,
                    newQuantity,
                    reason,
                    idempotencyKey: newIdempotencyKey('correction'),
                  }),
                  revalidatePath,
                }),
              closeDialog,
            )
          }}
        />
      ) : null}

      {dialog.kind === 'void' ? (
        <VoidEntryDialog
          entry={dialog.entry}
          onClose={closeDialog}
          submitting={isPending && busyId === `void:${dialog.entry.id}`}
          onSubmit={(reason) => {
            runMutation(
              `void:${dialog.entry.id}`,
              () =>
                voidIntakeAction({
                  payload: buildVoidPayload({
                    context: ctx,
                    entry: dialog.entry,
                    reason,
                    idempotencyKey: newIdempotencyKey('void'),
                  }),
                  revalidatePath,
                }),
              closeDialog,
            )
          }}
        />
      ) : null}

      {dialog.kind === 'close' ? (
        <TodayModal
          title="Cerrar mi día"
          description="Se guardará una foto de tus objetivos y registros de hoy. Puedes seguir registrando después."
          open
          onClose={closeDialog}
          footer={
            <div className="flex justify-end gap-2">
              <NutritionMotionButton tone="neutral" onClick={closeDialog}>
                Cancelar
              </NutritionMotionButton>
              <NutritionMotionButton
                pending={isPending && busyId === 'close'}
                onClick={() =>
                  runMutation(
                    'close',
                    () =>
                      closeDayAction({
                        clientId,
                        localDate: today.localDate,
                        timezone: today.timezone,
                        revalidatePath,
                      }),
                    closeDialog,
                  )
                }
              >
                Confirmar cierre
              </NutritionMotionButton>
            </div>
          }
        >
          <p className="text-sm text-body">
            Tu coach verá el resumen de este día tal como quedó al cerrarlo.
          </p>
        </TodayModal>
      ) : null}
    </div>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  tone = 'neutral',
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  tone?: 'neutral' | 'danger'
  children: React.ReactNode
}) {
  return (
    <button
      aria-label={label}
      className={
        tone === 'danger'
          ? 'inline-flex h-10 w-10 items-center justify-center rounded-control text-rose-600 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-950/30'
          : 'inline-flex h-10 w-10 items-center justify-center rounded-control text-muted hover:bg-surface-sunken hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
      }
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

function PrescribedSection({
  today,
  busyId,
  isPending,
  onEat,
}: {
  today: NutritionTodayReadModel
  busyId: string | null
  isPending: boolean
  onEat: (
    slot: NutritionTodayReadModel['mealSlots'][number],
    item: NutritionTodayReadModel['mealSlots'][number]['prescriptionItems'][number],
  ) => void
}) {
  const slotsWithPrescription = today.mealSlots.filter((slot) => slot.prescriptionItems.length > 0)
  if (slotsWithPrescription.length === 0) return null

  return (
    <section aria-label="Tu plan de hoy" className="space-y-3">
      <h2 className="font-display text-lg font-semibold text-strong">Tu plan de hoy</h2>
      {slotsWithPrescription.map((slot) => (
        <NutritionCard key={slot.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-base font-semibold text-strong">{slot.name}</h3>
            {slot.startTime ? <span className="font-mono text-xs text-muted">{slot.startTime}</span> : null}
          </div>
          <div className="mt-3 divide-y divide-border-subtle">
            {slot.prescriptionItems.map((item) => {
              const consumed = isPrescriptionConsumed(today, item.id)
              return (
                <FoodRow
                  key={item.id}
                  food={{
                    id: item.id,
                    name: item.name ?? 'Alimento prescrito',
                    detail: item.brand,
                    quantityLabel: `${item.quantity} ${item.unit}`,
                    calories: item.macros.calories,
                    proteinG: item.macros.proteinG,
                    carbsG: item.macros.carbsG,
                    fatsG: item.macros.fatsG,
                  }}
                  actions={
                    consumed ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        Registrado
                      </span>
                    ) : (
                      <NutritionMotionButton
                        data-testid="nutrition-v2-lo-comi"
                        tone="success"
                        className="min-h-10 px-3 text-xs"
                        pending={isPending && busyId === `eat:${item.id}`}
                        onClick={() => onEat(slot, item)}
                      >
                        Lo comí
                      </NutritionMotionButton>
                    )
                  }
                />
              )
            })}
          </div>
        </NutritionCard>
      ))}
    </section>
  )
}

function RegisterFoodDialog({
  clientId,
  slotOptions,
  onClose,
  onSubmit,
  submitting,
}: {
  clientId: string
  slotOptions: Array<{ code: string; label: string }>
  onClose: () => void
  onSubmit: (food: FoodCatalogItem, quantity: number, unit: string, mealSlotCode: string | null) => void
  submitting: boolean
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoodCatalogItem[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selected, setSelected] = useState<FoodCatalogItem | null>(null)
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [mealSlot, setMealSlot] = useState<string>('')

  const runSearch = () => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setSearchError('Escribe al menos 2 caracteres.')
      return
    }
    setSearchError(null)
    setSearching(true)
    void searchFoodCatalogAction({ clientId, query: trimmed }).then((res) => {
      setSearching(false)
      if (!res.ok) {
        setSearchError(res.error)
        return
      }
      setResults(res.result.items)
      if (res.result.items.length === 0) setSearchError('Sin resultados en el catálogo local.')
    })
  }

  const selectFood = (food: FoodCatalogItem) => {
    setSelected(food)
    setQuantity(String(food.servingSize))
    setUnit(food.servingUnit)
  }

  const unitOptions = useMemo(() => {
    if (!selected) return []
    return Array.from(new Set([selected.servingUnit, 'g', 'ml', 'porción', 'unidad']))
  }, [selected])

  const quantityNumber = Number(quantity)
  const canSubmit =
    selected !== null && Number.isFinite(quantityNumber) && quantityNumber > 0 && unit.trim().length > 0

  return (
    <TodayModal
      title="Registrar alimento"
      description="Busca en el catálogo local y elige cuánto comiste."
      open
      onClose={onClose}
      footer={
        selected ? (
          <div className="flex items-center justify-between gap-2">
            <NutritionMotionButton tone="neutral" onClick={() => setSelected(null)}>
              Cambiar alimento
            </NutritionMotionButton>
            <NutritionMotionButton
              disabled={!canSubmit}
              pending={submitting}
              onClick={() => {
                if (selected && canSubmit) {
                  onSubmit(selected, quantityNumber, unit.trim(), mealSlot === '' ? null : mealSlot)
                }
              }}
            >
              Registrar
            </NutritionMotionButton>
          </div>
        ) : null
      }
    >
      {selected ? (
        <div className="space-y-4">
          <div className="rounded-card border border-border-subtle bg-surface-sunken p-3">
            <p className="text-sm font-semibold text-strong">{selected.name}</p>
            <p className="mt-0.5 text-xs text-muted">{selected.brand ?? 'Sin marca'}</p>
            <p className="mt-1 font-mono text-[11px] text-subtle">
              {selected.calories} kcal por {selected.servingSize} {selected.servingUnit}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">Cantidad</span>
              <input
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value.replace(/[^0-9.]/g, ''))}
                className="min-h-12 w-full rounded-control border border-border-default bg-surface-app px-3 text-base text-strong outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">Unidad</span>
              <select
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                className="min-h-12 w-full rounded-control border border-border-default bg-surface-app px-3 text-base text-strong outline-none focus:ring-2 focus:ring-ring"
              >
                {unitOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">Franja (opcional)</span>
            <select
              value={mealSlot}
              onChange={(event) => setMealSlot(event.target.value)}
              className="min-h-12 w-full rounded-control border border-border-default bg-surface-app px-3 text-base text-strong outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Sin franja</option>
              {slotOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div className="space-y-3">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              runSearch()
            }}
            className="flex gap-2"
          >
            <input
              aria-label="Buscar alimento"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ej: pechuga de pollo"
              className="min-h-12 w-full rounded-control border border-border-default bg-surface-app px-3 text-base text-strong outline-none focus:ring-2 focus:ring-ring"
            />
            <NutritionMotionButton pending={searching} onClick={runSearch} type="button">
              Buscar
            </NutritionMotionButton>
          </form>
          {searchError ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">{searchError}</p>
          ) : null}
          <ul className="divide-y divide-border-subtle">
            {results.map((food) => (
              <li key={food.id}>
                <button
                  type="button"
                  onClick={() => selectFood(food)}
                  className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-strong">{food.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {food.brand ?? 'Sin marca'} · {food.calories} kcal / {food.servingSize} {food.servingUnit}
                    </span>
                  </span>
                  <Plus className="h-4 w-4 shrink-0 text-primary dark:text-primary" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </TodayModal>
  )
}

function EditQuantityDialog({
  entry,
  onClose,
  onSubmit,
  submitting,
}: {
  entry: NutritionIntakeReadItem
  onClose: () => void
  onSubmit: (newQuantity: number, reason: string) => void
  submitting: boolean
}) {
  const [quantity, setQuantity] = useState(String(entry.quantity))
  const [reason, setReason] = useState('')
  const quantityNumber = Number(quantity)
  const canSubmit =
    Number.isFinite(quantityNumber) && quantityNumber > 0 && reason.trim().length >= 3

  return (
    <TodayModal
      title="Editar cantidad"
      description={`${entry.snapshot.name} · registrado como ${entry.quantity} ${entry.unit}`}
      open
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <NutritionMotionButton tone="neutral" onClick={onClose}>
            Cancelar
          </NutritionMotionButton>
          <NutritionMotionButton
            disabled={!canSubmit}
            pending={submitting}
            onClick={() => canSubmit && onSubmit(quantityNumber, reason.trim())}
          >
            Guardar corrección
          </NutritionMotionButton>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Nueva cantidad ({entry.unit})</span>
          <input
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value.replace(/[^0-9.]/g, ''))}
            className="min-h-12 w-full rounded-control border border-border-default bg-surface-app px-3 text-base text-strong outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Motivo del cambio</span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ej: comí un poco menos"
            className="min-h-12 w-full rounded-control border border-border-default bg-surface-app px-3 text-base text-strong outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="mt-1 block text-[11px] text-subtle">Mínimo 3 caracteres. Se conserva el registro original.</span>
        </label>
      </div>
    </TodayModal>
  )
}

function VoidEntryDialog({
  entry,
  onClose,
  onSubmit,
  submitting,
}: {
  entry: NutritionIntakeReadItem
  onClose: () => void
  onSubmit: (reason: string) => void
  submitting: boolean
}) {
  const [reason, setReason] = useState('')
  const canSubmit = reason.trim().length >= 3

  return (
    <TodayModal
      title="Retirar registro"
      description={`${entry.snapshot.name} · ${entry.quantity} ${entry.unit}`}
      open
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <NutritionMotionButton tone="neutral" onClick={onClose}>
            Cancelar
          </NutritionMotionButton>
          <NutritionMotionButton
            tone="danger"
            disabled={!canSubmit}
            pending={submitting}
            onClick={() => canSubmit && onSubmit(reason.trim())}
          >
            Retirar registro
          </NutritionMotionButton>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-body">
          El registro dejará de contar en tu día, pero se conserva en el historial para tu coach.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Motivo</span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ej: lo registré por error"
            className="min-h-12 w-full rounded-control border border-border-default bg-surface-app px-3 text-base text-strong outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="mt-1 block text-[11px] text-subtle">Mínimo 3 caracteres.</span>
        </label>
      </div>
    </TodayModal>
  )
}
