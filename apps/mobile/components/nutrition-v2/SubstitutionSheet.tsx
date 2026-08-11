import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import {
  SubstitutionOptionsReadModelSchema,
  computeSubstitutionEquivalence,
  describeSubstitutionDelta,
  formatNutritionCalories,
  substituteFromOption,
  type SubstitutionAnyOption,
  type SubstitutionEquivalence,
  type SubstitutionOptionsItem,
} from '@eva/nutrition-v2'
import { Sheet } from '../Sheet'
import { supabase } from '../../lib/supabase'

/**
 * Sheet de intercambio (T2.5). Espejo del web: bloque de reemplazos del coach y bloque del GRUPO
 * de intercambio, este ultimo paginado y con buscador server-side.
 *
 * La pagina del grupo NO viaja con el Today: se pide al abrir el sheet, con la misma RPC que ya
 * usa la pantalla pero pasandole el item. Calcularla para los ~21 items del dia encarecia el
 * arranque sin que nadie la mire.
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
  pendingId,
  onPick,
}: {
  open: boolean
  onClose: () => void
  entry: SubstitutionOptionsItem | null
  clientId: string
  localDate: string
  consumedFoodId: string | null
  pendingId: string | null
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
  const [loadError, setLoadError] = useState(false)

  const prescriptionItemId = entry?.prescriptionItemId ?? null

  useEffect(() => {
    if (open) return
    setQuery('')
    setLimit(PAGE_STEP)
    setPage(null)
    setLoadError(false)
  }, [open])

  useEffect(() => {
    if (!open || !prescriptionItemId) return
    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true)
        setLoadError(false)
        const { data, error } = await supabase.rpc('get_nutrition_substitution_options_v2', {
          p_client_id: clientId,
          p_local_date: localDate,
          p_prescription_item_id: prescriptionItemId,
          p_group_query: query.trim() === '' ? null : query.trim(),
          p_group_limit: limit,
        })
        if (cancelled) return
        const parsed = error ? null : SubstitutionOptionsReadModelSchema.safeParse(data)
        if (!parsed?.success) {
          setLoadError(true)
          setLoading(false)
          return
        }
        setPage(
          parsed.data.items.find((row) => row.prescriptionItemId === prescriptionItemId) ?? null,
        )
        setLoading(false)
      })()
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
    <Sheet
      open={open}
      onClose={onClose}
      title={`Cambiar ${itemLabel}`}
      description={`${entry.item.quantity} ${entry.item.unit}${
        entry.item.calories !== null ? ` · ${formatNutritionCalories(entry.item.calories)}` : ''
      }`}
      accessibilityLabel="Equivalentes de este alimento"
    >
      <View className="gap-4">
        {coachOptions.length > 0 ? (
          <View>
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
              Autorizados por tu coach
            </Text>
            <View className="mt-2 gap-1.5">
              {coachOptions.map((option) => (
                <OptionRow
                  key={option.substitutionId}
                  entry={entry}
                  option={option}
                  pendingId={pendingId}
                  onPick={onPick}
                />
              ))}
            </View>
          </View>
        ) : null}

        {group ? (
          <View>
            {/* NO dice "1 porción": este bloque equivale por CALORÍAS. Las porciones de
                intercambio del catálogo divergen hasta el 69% (SPEC H2). */}
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
              Grupo {group.name} · mismas calorías
            </Text>
            <TextInput
              value={query}
              onChangeText={(next) => {
                setQuery(next)
                setLimit(PAGE_STEP)
              }}
              placeholder={`Buscar en ${groupTotal} equivalentes`}
              accessibilityLabel={`Buscar entre los equivalentes del grupo ${group.name}`}
              autoCorrect={false}
              className="mt-2 min-h-11 rounded-control border border-subtle bg-surface-app px-3 text-sm text-body"
            />

            {loadError ? (
              <Text className="mt-2 text-xs text-danger">
                No pudimos cargar los equivalentes. Intenta de nuevo.
              </Text>
            ) : null}

            {loading && groupOptions.length === 0 ? (
              <ActivityIndicator className="mt-3" />
            ) : null}

            {!loading && !loadError && groupOptions.length === 0 ? (
              <Text className="mt-3 text-xs text-muted">
                {query.trim() === ''
                  ? 'No hay equivalentes disponibles.'
                  : `Sin resultados para “${query.trim()}”.`}
              </Text>
            ) : null}

            <View className="mt-2 gap-1.5">
              {groupOptions.map((option) => (
                <OptionRow
                  key={option.foodId}
                  entry={entry}
                  option={option}
                  pendingId={pendingId}
                  onPick={onPick}
                />
              ))}
            </View>

            {canLoadMore ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setLimit((current) => Math.min(current + PAGE_STEP, MAX_LIMIT))}
                className="mt-2 min-h-11 items-center justify-center rounded-control border border-subtle"
              >
                <Text className="text-sm font-medium text-body">Ver más</Text>
              </Pressable>
            ) : null}

            {!canLoadMore && limit >= MAX_LIMIT && groupTotal > MAX_LIMIT ? (
              <Text className="mt-2 text-xs text-muted">
                Hay {groupTotal} en total. Usa el buscador para encontrar el tuyo.
              </Text>
            ) : null}
          </View>
        ) : (
          /* D2: el copy NO le atribuye la decisión al coach. */
          <Text className="text-sm text-muted">Este alimento no tiene equivalentes cargados.</Text>
        )}
      </View>
    </Sheet>
  )
}

function OptionRow({
  entry,
  option,
  pendingId,
  onPick,
}: {
  entry: SubstitutionOptionsItem
  option: SubstitutionAnyOption
  pendingId: string | null
  onPick: (
    itemEntry: SubstitutionOptionsItem,
    option: SubstitutionAnyOption,
    equivalence: SubstitutionEquivalence,
  ) => void
}) {
  // MISMA función que usa el servidor al escribir: el número que el alumno ve antes de tocar y el
  // que se persiste son el mismo por construcción.
  const itemLike = {
    quantity: entry.item.quantity,
    unit: entry.item.unit,
    calories: entry.item.calories,
    proteinG: entry.item.proteinG ?? null,
    carbsG: entry.item.carbsG ?? null,
    fatsG: entry.item.fatsG ?? null,
  }
  const equivalence = computeSubstitutionEquivalence({
    item: itemLike,
    substitute: substituteFromOption(option),
  })
  const name = option.food?.name ?? option.customName ?? option.frozen.name ?? 'Equivalente'
  const key = option.substitutionId ?? `gf-${option.foodId}`
  const pending = pendingId === key
  const delta = describeSubstitutionDelta({ item: itemLike, equivalence })

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Cambiar por ${name}, ${equivalence.quantity} ${equivalence.unit}`}
      disabled={pendingId !== null}
      onPress={() => onPick(entry, option, equivalence)}
      className="min-h-11 flex-row items-center justify-between gap-3 rounded-control border border-subtle bg-surface-sunken px-3 py-2"
    >
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm font-medium text-body">
          {name}
        </Text>
        {option.food?.brand ? (
          <Text numberOfLines={1} className="text-xs text-muted">
            {option.food.brand}
          </Text>
        ) : null}
      </View>
      <View className="items-end">
        <Text className="text-sm font-semibold text-strong">
          {equivalence.quantity} {equivalence.unit}
        </Text>
        <Text className="text-[11px] text-muted">
          {equivalence.requiresConfirmation ? 'confirma la cantidad' : (delta ?? '')}
        </Text>
      </View>
      {pending ? <ActivityIndicator /> : null}
    </Pressable>
  )
}
