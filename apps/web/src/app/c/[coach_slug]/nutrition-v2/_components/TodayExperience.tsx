'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Pencil, Plus, ScanBarcode, Share2, Star, Trash2, Utensils } from 'lucide-react'
import {
  buildNutritionDayShareText,
  firstNameFromFullName,
  sortFoodsByFavoriteFirst,
  type FoodCatalogItem,
  type NutritionIntakeReadItem,
  type NutritionTodayReadModel,
} from '@eva/nutrition-v2'
import {
  MacroChipRow,
  NutritionCard,
  NutritionMotionButton,
  NutritionStatePanel,
  PlanVersionBadge,
  StrategyBadge,
} from '@/components/nutrition-v2'
import { formatNutritionShortDate } from '@/lib/date-utils'
import { AuraHero } from './AuraHero'
import { TodayModal } from './TodayModal'
import { NutritionFoodRow } from './NutritionFoodRow'
import { foodResultImage } from './food-result-image'
import {
  buildCatalogIntakePayload,
  buildCorrectionPayload,
  buildPrescribedIntakePayload,
  buildVoidPayload,
  consumedEntries,
  contextFromToday,
  isPrescriptionConsumed,
  mealSlotOptions,
  newIdempotencyKey,
} from './nutrition-today.logic'
import {
  correctIntakeAction,
  recordIntakeAction,
  searchFoodCatalogAction,
  voidIntakeAction,
} from '../_actions/intake.actions'
import {
  getFavoriteFoodIdsAction,
  listFavoriteFoodsAction,
  toggleFavoriteFoodAction,
} from '../_actions/favorites.actions'

// NOTA: `closeDayAction` (cierre manual del día) se retiró de la UI por decisión del CEO — los
// registros ya se guardan solos, la card "Cerrar mi día" confundía. El action y su RPC siguen
// VIVOS en `../_actions/intake.actions` como mecanismo interno para un cierre automático futuro;
// aquí simplemente ya no se invocan. El chip "Día registrado" se conserva para días cerrados
// históricamente (render condicional por `today.snapshotId`).

type DialogState =
  | { kind: 'none' }
  | { kind: 'register' }
  | { kind: 'edit'; entry: NutritionIntakeReadItem }
  | { kind: 'void'; entry: NutritionIntakeReadItem }

export function TodayExperience({
  today,
  clientId,
  revalidatePath,
  scanHref,
  clientName,
}: {
  today: NutritionTodayReadModel
  clientId: string
  revalidatePath: string
  scanHref: string
  /** Nombre completo del alumno para el saludo del héroe (opcional; sin él, saludo sin nombre). */
  clientName?: string | null
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
          // Fallo honesto del server (rate limit, scope, validacion, RPC): NO se cierra el
          // dialogo ni se refresca — el estado optimista jamas se confirma y el error se
          // muestra DENTRO del dialogo (ver DialogError), no en un banner tapado por el sheet.
          setError(res.error ?? 'No se pudo completar la acción.')
          return
        }
        onSuccess?.()
        router.refresh()
      } catch {
        // La server action lanzo (red caida, timeout de rate-limit, excepcion del server):
        // sin este catch el error se tragaba en silencio y el registro se perdia sin aviso.
        setError('No pudimos guardar tu registro. Revisa tu conexión e inténtalo de nuevo.')
      } finally {
        setBusyId(null)
      }
    })
  }

  // Abrir/cerrar limpia el error para que no arrastre un mensaje viejo dentro del nuevo dialogo.
  const openDialog = (next: DialogState) => {
    setError(null)
    setDialog(next)
  }
  const closeDialog = () => {
    setError(null)
    setDialog({ kind: 'none' })
  }

  // Compartir: arma un TEXTO resumen del dia (mismo helper puro que RN → microcopy 1:1) y lo
  // comparte por Web Share API; si no existe (desktop), cae al portapapeles + toast. Solo datos
  // del propio alumno (fecha, kcal/meta, macros, lo consumido) — sin datos privados del coach.
  const handleShare = async () => {
    const text = buildNutritionDayShareText({
      localDate: today.localDate,
      planName: today.plan?.name ?? null,
      consumed: {
        calories: today.consumed.calories,
        proteinG: today.consumed.proteinG,
        carbsG: today.consumed.carbsG,
        fatsG: today.consumed.fatsG,
      },
      targets: {
        calories: today.targets.calories,
        proteinG: today.targets.proteinG,
        carbsG: today.targets.carbsG,
        fatsG: today.targets.fatsG,
      },
      items: entries.map((entry) => ({ name: entry.snapshot.name, quantity: entry.quantity, unit: entry.unit })),
    })
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: 'Mi día de nutrición', text })
        return
      }
    } catch (shareError) {
      // El usuario canceló el diálogo nativo de compartir: no es un error que mostrar.
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return
      // Cualquier otro fallo del share nativo cae al portapapeles abajo.
    }
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Resumen copiado. Pégalo donde quieras compartirlo.')
    } catch {
      toast.error('No se pudo compartir. Intenta de nuevo.')
    }
  }

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

      <AuraHero
        greetingName={firstNameFromFullName(clientName)}
        dateKey={today.localDate}
        calories={{ consumed: today.consumed.calories, target: today.targets.calories }}
        macros={{
          protein: { consumed: today.consumed.proteinG, target: today.targets.proteinG },
          carbs: { consumed: today.consumed.carbsG, target: today.targets.carbsG },
          fats: { consumed: today.consumed.fatsG, target: today.targets.fatsG },
        }}
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
        <NutritionMotionButton onClick={() => openDialog({ kind: 'register' })}>
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
        <button
          type="button"
          onClick={() => void handleShare()}
          className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          Compartir
        </button>
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
                <NutritionFoodRow
                  key={entry.id}
                  name={entry.snapshot.name}
                  detail={entry.snapshot.brand}
                  quantityLabel={`${entry.quantity} ${entry.unit}`}
                  calories={entry.totals.calories}
                  proteinG={entry.totals.proteinG}
                  carbsG={entry.totals.carbsG}
                  fatsG={entry.totals.fatsG}
                  statusLabel={entry.status === 'corrected' ? 'Corregido' : null}
                  actions={
                    <div className="flex items-center gap-1">
                      <IconButton
                        label="Editar cantidad"
                        onClick={() => openDialog({ kind: 'edit', entry })}
                        disabled={isPending}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label="Retirar registro"
                        tone="danger"
                        onClick={() => openDialog({ kind: 'void', entry })}
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

      {dialog.kind === 'register' ? (
        <RegisterFoodDialog
          clientId={clientId}
          slotOptions={slotOptions}
          error={error}
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
          error={error}
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
          error={error}
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
    </div>
  )
}

/**
 * Alerta de error DENTRO de un dialogo/sheet. Vive en el mismo contexto de apilamiento que el
 * sheet (por encima del nav flotante), asi que el fallo del server SIEMPRE se ve — a diferencia
 * del banner global de la pantalla, que quedaba tapado por el overlay del dialogo.
 */
function DialogError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div
      aria-live="assertive"
      className="mb-4 flex items-start gap-2 rounded-card border border-rose-300/60 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-700/50 dark:bg-rose-950/30 dark:text-rose-300"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}

/** Miniatura de un resultado de busqueda: foto real del producto o icono de categoria (respaldo). */
function FoodResultThumb({ imageUrl, iconUrl, alt }: { imageUrl: string | null; iconUrl: string; alt: string }) {
  return (
    <span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-control border border-border-subtle bg-surface-sunken">
      {imageUrl ? (
        <Image alt={alt} src={imageUrl} width={44} height={44} unoptimized loading="lazy" className="h-11 w-11 object-cover" />
      ) : (
        <span className="absolute inset-0 grid place-items-center bg-primary/10">
          <Image alt="" aria-hidden="true" src={iconUrl} width={24} height={24} unoptimized loading="lazy" className="h-6 w-6 object-contain" />
        </span>
      )}
    </span>
  )
}

/** Estrella para marcar/desmarcar un alimento como favorito del alumno. */
function FavoriteStarButton({
  active,
  busy,
  onClick,
}: {
  active: boolean
  busy: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={active ? 'Quitar de favoritos' : 'Agregar a favoritos'}
      aria-pressed={active}
      disabled={busy}
      onClick={onClick}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-sunken hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      <Star
        className={active ? 'h-5 w-5 fill-amber-400 text-amber-400' : 'h-5 w-5'}
        aria-hidden="true"
      />
    </button>
  )
}

/**
 * Fila de un alimento del catálogo (resultado de búsqueda o favorito): toca la fila para
 * elegirlo, o la estrella para marcarlo como favorito. Miniatura idéntica a la del resto
 * de la experiencia (foto del producto o icono de categoría de respaldo).
 */
function CatalogPickRow({
  food,
  isFavorite,
  favBusy,
  onSelect,
  onToggleFavorite,
}: {
  food: FoodCatalogItem
  isFavorite: boolean
  favBusy: boolean
  onSelect: (food: FoodCatalogItem) => void
  onToggleFavorite: (food: FoodCatalogItem) => void
}) {
  const image = foodResultImage(food, SUPABASE_BASE)
  const meta = [food.brand, food.category].filter(Boolean).join(' · ')
  return (
    <li className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onSelect(food)}
        className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <FoodResultThumb imageUrl={image.imageUrl} iconUrl={image.iconUrl} alt={food.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-strong">{food.name}</span>
          {meta ? <span className="block truncate text-xs text-muted">{meta}</span> : null}
          <span className="mt-1 block">
            <MacroChipRow
              calories={food.calories}
              proteinG={food.proteinG}
              carbsG={food.carbsG}
              fatsG={food.fatsG}
              per={`/ 100 ${food.servingUnit === 'ml' ? 'ml' : 'g'}`}
              size="sm"
            />
          </span>
        </span>
      </button>
      <FavoriteStarButton active={isFavorite} busy={favBusy} onClick={() => onToggleFavorite(food)} />
    </li>
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
                <NutritionFoodRow
                  key={item.id}
                  name={item.name ?? 'Alimento prescrito'}
                  detail={item.brand}
                  quantityLabel={`${item.quantity} ${item.unit}${item.optional ? ' · opcional' : ''}`}
                  calories={item.macros.calories}
                  proteinG={item.macros.proteinG}
                  carbsG={item.macros.carbsG}
                  fatsG={item.macros.fatsG}
                  note={item.notes}
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

/** Base publica de Storage para resolver la foto del producto (client-side, NEXT_PUBLIC). */
const SUPABASE_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null

function RegisterFoodDialog({
  clientId,
  slotOptions,
  error,
  onClose,
  onSubmit,
  submitting,
}: {
  clientId: string
  slotOptions: Array<{ code: string; label: string }>
  error: string | null
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
  // Favoritos: ids para la estrella + orden, y foods hidratados para el acceso rápido.
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [favoriteFoods, setFavoriteFoods] = useState<FoodCatalogItem[]>([])
  const [favBusyId, setFavBusyId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void getFavoriteFoodIdsAction({ clientId }).then((res) => {
      if (active && res.ok) setFavoriteIds(new Set(res.ids))
    })
    void listFavoriteFoodsAction({ clientId }).then((res) => {
      if (active && res.ok) setFavoriteFoods(res.items)
    })
    return () => {
      active = false
    }
  }, [clientId])

  // Toggle optimista con rollback: la marca aparece al instante; si el server falla, revierte
  // el id y la lista de favoritos y avisa. Reusa la tabla V1 vía la action V2 (allergy-safe).
  const toggleFavorite = (food: FoodCatalogItem) => {
    const wasFav = favoriteIds.has(food.id)
    setFavoriteIds((prev) => {
      const next = new Set(prev)
      if (wasFav) next.delete(food.id)
      else next.add(food.id)
      return next
    })
    setFavoriteFoods((prev) => {
      if (wasFav) return prev.filter((f) => f.id !== food.id)
      return prev.some((f) => f.id === food.id) ? prev : [food, ...prev]
    })
    setFavBusyId(food.id)
    void toggleFavoriteFoodAction({ clientId, foodId: food.id }).then((res) => {
      setFavBusyId((cur) => (cur === food.id ? null : cur))
      if (!res.ok) {
        setFavoriteIds((prev) => {
          const next = new Set(prev)
          if (wasFav) next.add(food.id)
          else next.delete(food.id)
          return next
        })
        setFavoriteFoods((prev) => {
          if (wasFav) return prev.some((f) => f.id === food.id) ? prev : [food, ...prev]
          return prev.filter((f) => f.id !== food.id)
        })
        toast.error(res.error)
      }
    })
  }

  // Favoritos PRIMERO en los resultados (reordena client-side, sin tocar el RPC de búsqueda).
  const orderedResults = useMemo(() => sortFoodsByFavoriteFirst(results, favoriteIds), [results, favoriteIds])
  // Paridad con RN: al borrar la búsqueda (<2 chars) se limpian los resultados y reaparece "Tus favoritos".
  useEffect(() => {
    if (query.trim().length < 2) setResults([])
  }, [query])
  const showFavoritesShortcut = query.trim().length < 2 && results.length === 0 && favoriteFoods.length > 0

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
      <DialogError message={error} />
      {selected ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-card border border-border-subtle bg-surface-sunken p-3">
            {(() => {
              const image = foodResultImage(selected, SUPABASE_BASE)
              return <FoodResultThumb imageUrl={image.imageUrl} iconUrl={image.iconUrl} alt={selected.name} />
            })()}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-strong">{selected.name}</p>
              <p className="mt-0.5 truncate text-xs text-muted">
                {[selected.brand, selected.category].filter(Boolean).join(' · ') || 'Sin marca'}
              </p>
              <span className="mt-1.5 block">
                <MacroChipRow
                  calories={selected.calories}
                  proteinG={selected.proteinG}
                  carbsG={selected.carbsG}
                  fatsG={selected.fatsG}
                  per={`por ${selected.servingSize} ${selected.servingUnit}`}
                  size="sm"
                />
              </span>
            </div>
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

          {showFavoritesShortcut ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                Tus favoritos
              </div>
              <ul className="divide-y divide-border-subtle">
                {favoriteFoods.map((food) => (
                  <CatalogPickRow
                    key={food.id}
                    food={food}
                    isFavorite={favoriteIds.has(food.id)}
                    favBusy={favBusyId === food.id}
                    onSelect={selectFood}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </ul>
            </div>
          ) : null}

          {orderedResults.length > 0 ? (
            <ul className="divide-y divide-border-subtle">
              {orderedResults.map((food) => (
                <CatalogPickRow
                  key={food.id}
                  food={food}
                  isFavorite={favoriteIds.has(food.id)}
                  favBusy={favBusyId === food.id}
                  onSelect={selectFood}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </TodayModal>
  )
}

function EditQuantityDialog({
  entry,
  error,
  onClose,
  onSubmit,
  submitting,
}: {
  entry: NutritionIntakeReadItem
  error: string | null
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
        <DialogError message={error} />
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
  error,
  onClose,
  onSubmit,
  submitting,
}: {
  entry: NutritionIntakeReadItem
  error: string | null
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
        <DialogError message={error} />
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
