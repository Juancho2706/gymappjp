'use client'

import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import {
  computeSubstitutionEquivalence,
  describeSubstitutionDelta,
  substituteFromOption,
  type SubstitutionAnyOption,
  type SubstitutionEquivalence,
  type SubstitutionOptionsItem,
} from '@eva/nutrition-v2'
import { formatNutritionCalories } from '@eva/nutrition-v2'
import { loadSubstitutionGroupPageAction } from '../_actions/intake.actions'
import { TodayModal } from './TodayModal'

/**
 * Sheet de intercambio (T2.5). Dos bloques:
 *
 *  1. lo que el coach autorizo a mano — 15 items en toda la base;
 *  2. cualquier equivalente del GRUPO de intercambio — 832 items.
 *
 * El segundo es la razon de existir de la tanda, y por eso nace paginado y con buscador: el grupo
 * de Carbohidratos tiene 716 alimentos y una lista completa seria inusable.
 *
 * La pagina del grupo NO viaja con la pantalla: se pide al abrir el sheet. Calcularla para los ~21
 * items del dia encarecia el arranque de Hoy sin que nadie la mire.
 */

const PAGE_STEP = 20
const MAX_LIMIT = 50

export function SubstitutionSheet({
  open,
  onClose,
  entry,
  clientId,
  localDate,
  consumedFoodId,
  busyId,
  isPending,
  onPick,
}: {
  open: boolean
  onClose: () => void
  /** El item, con el bloque coach y el header del grupo que ya trajo la pantalla. */
  entry: SubstitutionOptionsItem | null
  clientId: string
  localDate: string
  /** Alimento con el que el item ya esta registrado: no se ofrece "cambiar a lo mismo". */
  consumedFoodId: string | null
  busyId: string | null
  isPending: boolean
  onPick: (
    itemEntry: SubstitutionOptionsItem,
    option: SubstitutionAnyOption,
    equivalence: SubstitutionEquivalence,
  ) => void
}) {
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE_STEP)
  const [page, setPage] = useState<SubstitutionOptionsItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  const prescriptionItemId = entry?.prescriptionItemId ?? null

  // Al cerrar se limpia todo: reabrir sobre otro item no puede heredar la busqueda del anterior.
  useEffect(() => {
    if (open) return
    setQuery('')
    setLimit(PAGE_STEP)
    setPage(null)
    setLoadError(null)
  }, [open])

  useEffect(() => {
    if (!open || !prescriptionItemId) return
    let cancelled = false
    // Debounce del buscador. La primera carga tambien pasa por aca: 250 ms de espera al abrir es
    // preferible a disparar dos consultas cuando el alumno escribe de inmediato.
    const timer = setTimeout(async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const res = await loadSubstitutionGroupPageAction({
          clientId,
          localDate,
          prescriptionItemId,
          query: query.trim() === '' ? null : query.trim(),
          limit,
        })
        if (cancelled) return
        if (!res.ok) {
          setLoadError('No pudimos cargar los equivalentes. Intenta de nuevo.')
          return
        }
        setPage(res.item)
      } catch {
        if (!cancelled) setLoadError('No pudimos cargar los equivalentes. Revisa tu conexión.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, query === '' ? 0 : 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, prescriptionItemId, clientId, localDate, query, limit])

  if (!entry) return null

  const coachOptions = entry.options.filter(
    (option) => consumedFoodId === null || option.foodId !== consumedFoodId,
  )
  const groupOptions = (page?.groupOptions ?? []).filter(
    (option) => consumedFoodId === null || option.foodId !== consumedFoodId,
  )
  const groupTotal = page?.groupTotal ?? entry.groupTotal
  const group = entry.group ?? page?.group ?? null
  const itemLabel = entry.item.name ?? 'este alimento'
  const canLoadMore = !loading && groupOptions.length >= limit && limit < MAX_LIMIT

  return (
    <TodayModal
      open={open}
      onClose={onClose}
      title={`Cambiar ${itemLabel}`}
      description={`${entry.item.quantity} ${entry.item.unit}${
        entry.item.calories !== null ? ` · ${formatNutritionCalories(entry.item.calories)}` : ''
      }`}
      initialFocusRef={searchRef}
    >
      <div className="space-y-4">
        {coachOptions.length > 0 ? (
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
              Autorizados por tu coach
            </h3>
            <ul className="mt-2 space-y-1.5">
              {coachOptions.map((option) => (
                <OptionRow
                  key={option.substitutionId}
                  entry={entry}
                  option={option}
                  busyId={busyId}
                  isPending={isPending}
                  onPick={onPick}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {group ? (
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
              {/* NO dice "1 porción": este bloque equivale por CALORÍAS, no por porciones de
                  intercambio, que en el catálogo divergen hasta el 69% (SPEC H2). */}
              Grupo {group.name} · mismas calorías
            </h3>
            <label className="relative mt-2 block">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setLimit(PAGE_STEP)
                }}
                placeholder={`Buscar en ${groupTotal} equivalentes`}
                aria-label={`Buscar entre los equivalentes del grupo ${group.name}`}
                className="min-h-11 w-full rounded-control border border-border-subtle bg-surface-app pl-9 pr-3 text-sm text-body placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>

            {loadError ? (
              <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">{loadError}</p>
            ) : null}

            {loading && groupOptions.length === 0 ? (
              <p className="mt-3 text-xs text-muted">Buscando…</p>
            ) : null}

            {!loading && groupOptions.length === 0 && !loadError ? (
              <p className="mt-3 text-xs text-muted">
                {query.trim() === ''
                  ? 'No hay equivalentes disponibles.'
                  : `Sin resultados para “${query.trim()}”.`}
              </p>
            ) : null}

            <ul className="mt-2 space-y-1.5">
              {groupOptions.map((option) => (
                <OptionRow
                  key={option.foodId}
                  entry={entry}
                  option={option}
                  busyId={busyId}
                  isPending={isPending}
                  onPick={onPick}
                />
              ))}
            </ul>

            {canLoadMore ? (
              <button
                type="button"
                onClick={() => setLimit((current) => Math.min(current + PAGE_STEP, MAX_LIMIT))}
                className="mt-2 min-h-11 w-full rounded-control border border-border-subtle text-sm font-medium text-body hover:border-primary/40 hover:text-strong"
              >
                Ver más
              </button>
            ) : null}

            {!canLoadMore && limit >= MAX_LIMIT && groupTotal > MAX_LIMIT ? (
              <p className="mt-2 text-xs text-muted">
                Hay {groupTotal} en total. Usa el buscador para encontrar el tuyo.
              </p>
            ) : null}
          </section>
        ) : (
          /* D2: el copy NO le atribuye la decisión al coach — no la tomó, simplemente este
             alimento no tiene equivalentes cargados en el catálogo. */
          <p className="text-sm text-muted">Este alimento no tiene equivalentes cargados.</p>
        )}
      </div>
    </TodayModal>
  )
}

/**
 * Una opción, del bloque que sea. La cantidad y el delta salen del MISMO módulo puro que usa el
 * servidor al escribir: el número que el alumno ve antes de tocar y el que se persiste son el
 * mismo por construcción.
 */
function OptionRow({
  entry,
  option,
  busyId,
  isPending,
  onPick,
}: {
  entry: SubstitutionOptionsItem
  option: SubstitutionAnyOption
  busyId: string | null
  isPending: boolean
  onPick: (
    itemEntry: SubstitutionOptionsItem,
    option: SubstitutionAnyOption,
    equivalence: SubstitutionEquivalence,
  ) => void
}) {
  const equivalence = computeSubstitutionEquivalence({
    item: {
      quantity: entry.item.quantity,
      unit: entry.item.unit,
      calories: entry.item.calories,
      proteinG: entry.item.proteinG ?? null,
      carbsG: entry.item.carbsG ?? null,
      fatsG: entry.item.fatsG ?? null,
    },
    substitute: substituteFromOption(option),
  })
  const name = option.food?.name ?? option.customName ?? option.frozen.name ?? 'Equivalente'
  const amount = `${equivalence.quantity} ${equivalence.unit}`
  const delta = describeSubstitutionDelta({
    item: {
      quantity: entry.item.quantity,
      unit: entry.item.unit,
      calories: entry.item.calories,
      proteinG: entry.item.proteinG ?? null,
      carbsG: entry.item.carbsG ?? null,
      fatsG: entry.item.fatsG ?? null,
    },
    equivalence,
  })
  const key = option.substitutionId ?? `gf-${option.foodId}`
  const pending = isPending && busyId === `subst:${key}`

  return (
    <li>
      <button
        type="button"
        disabled={isPending}
        onClick={() => onPick(entry, option, equivalence)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-control border border-border-subtle bg-surface-sunken px-3 py-2 text-left transition-colors hover:border-primary/40 disabled:opacity-60"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-body">{name}</span>
          {option.food?.brand ? (
            <span className="block truncate text-xs text-muted">{option.food.brand}</span>
          ) : null}
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold tabular-nums text-strong">{amount}</span>
          <span className="block text-[11px] text-muted">
            {equivalence.requiresConfirmation ? 'confirma la cantidad' : (delta ?? '')}
          </span>
        </span>
        {pending ? <span className="shrink-0 text-muted">…</span> : null}
      </button>
    </li>
  )
}
