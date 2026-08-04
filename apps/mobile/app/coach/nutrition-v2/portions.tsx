import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Copy, Plus, RotateCcw, Search, X } from 'lucide-react-native'
import type { ExchangeGroup } from '@eva/nutrition-engine'
import { formatPortionSentence } from '@eva/nutrition-v2'
import { DuplicateGroupSheet, NutritionHeader, NutritionStatePanel } from '../../../components/nutrition-v2'
import { Sheet } from '../../../components/Sheet'
import { useTheme } from '../../../context/ThemeContext'
import { useWorkspace } from '../../../lib/workspace'
import { nutritionV2CoachScope } from '../../../lib/nutrition-v2-scope'
import { portionsFoodsHint } from '../../../lib/nutrition-v2-builder-portions'
import { fetchNutritionV2ExchangeGroups } from '../../../lib/nutrition-v2-exchange-groups.api'
import {
  excludeExchangeListEntry,
  fetchExchangeList,
  fetchExchangeListCandidates,
  restoreExchangeListEntry,
  saveExchangeListEntry,
  type ExchangeListCandidate,
  type ExchangeListRow,
} from '../../../lib/nutrition-v2-exchange-lists.api'
import { PORTIONS_COPY } from '../../../lib/nutrition-portions-copy'

const COPY = PORTIONS_COPY.exchangeList
const GROUP_COPY = PORTIONS_COPY.groupEditor

/**
 * Porciones del coach en RN (F4, paridad de F2) — "¿Qué cuenta como 1 porción?".
 *
 * Misma decisión de fondo que la web: el buscador barre TODO el catálogo visible (no solo los
 * alimentos propios) y los gramos vienen SUGERIDOS por el servidor desde los macros del alimento
 * y los de referencia del grupo. La sugerencia se muestra como tal y es editable: el número del
 * coach manda.
 *
 * Toda escritura pasa por `/api/mobile/nutrition/exchanges/group-foods` (lección NUT-005): cero
 * escrituras Supabase directas nuevas desde el teléfono.
 *
 * Presentación: tokens semánticos del DS vía NativeWind (`bg-surface-*`, `text-*`, `border-*`,
 * `rounded-control`, `hit-min`). Lo único que sigue viviendo en `style` es el color de marca del
 * coach (`theme.primary` / `theme.primaryForeground`), que es runtime y no tiene clase propia
 * cuando se usa como relleno sólido — mismo patrón que `ExchangeGroupFormSheet`.
 */
export default function CoachPortionsScreen() {
  const { theme } = useTheme()
  const { ready: workspaceReady, kind, teamId, orgId } = useWorkspace()

  const scope = useMemo(
    () => (workspaceReady ? nutritionV2CoachScope({ kind, teamId, orgId }) : null),
    [workspaceReady, kind, teamId, orgId]
  )

  const [groups, setGroups] = useState<ExchangeGroup[]>([])
  /**
   * Cuántas equivalencias vivas tiene cada grupo (F1). `undefined` en una clave = el conteo no
   * viajó y el chip NO pinta nada; un 0 explícito sí se grita en ámbar, porque ese grupo le sale
   * vacío al alumno.
   */
  const [foodCounts, setFoodCounts] = useState<Record<string, number> | undefined>(undefined)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [rows, setRows] = useState<ExchangeListRow[]>([])
  const [search, setSearch] = useState('')
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [loadingRows, setLoadingRows] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  /** Fuerza el refetch del catálogo tras duplicar (el grupo nuevo y su conteo tienen que aparecer). */
  const [groupsNonce, setGroupsNonce] = useState(0)

  const group = useMemo(() => groups.find((entry) => entry.id === groupId) ?? null, [groups, groupId])

  useEffect(() => {
    if (!scope) return
    let alive = true
    setLoadingGroups(true)
    fetchNutritionV2ExchangeGroups(scope)
      .then((result) => {
        if (!alive) return
        setGroups(result.groups)
        setFoodCounts(result.foodCounts)
        setGroupId((current) => current ?? result.groups[0]?.id ?? null)
      })
      .catch(() => {
        if (alive) setError(PORTIONS_COPY.builder.pickerError)
      })
      .finally(() => {
        if (alive) setLoadingGroups(false)
      })
    return () => {
      alive = false
    }
  }, [scope, groupsNonce])

  const loadRows = useCallback(
    async (id: string, term: string) => {
      setLoadingRows(true)
      try {
        setRows(await fetchExchangeList({ groupId: id, search: term || null }))
        setError(null)
      } catch {
        setRows([])
        setError(COPY.loadFailed)
      } finally {
        setLoadingRows(false)
      }
    },
    []
  )

  useEffect(() => {
    if (!groupId) return
    const timer = setTimeout(() => void loadRows(groupId, search.trim()), 300)
    return () => clearTimeout(timer)
  }, [groupId, search, loadRows])

  async function onExclude(row: ExchangeListRow) {
    if (!groupId) return
    const result = await excludeExchangeListEntry({ exchangeGroupId: groupId, foodId: row.foodId })
    if (!result.ok) {
      setError(result.error)
      return
    }
    void loadRows(groupId, search.trim())
  }

  async function onRestore(row: ExchangeListRow) {
    if (!groupId) return
    const result = await restoreExchangeListEntry({ exchangeGroupId: groupId, foodId: row.foodId })
    if (!result.ok) {
      setError(result.error)
      return
    }
    void loadRows(groupId, search.trim())
  }

  // El loader a pantalla completa es SOLO del arranque: el refetch tras duplicar ya tiene su
  // catálogo en pantalla y no debe parpadear.
  if (!workspaceReady || (loadingGroups && groups.length === 0)) {
    return (
      <SafeAreaView className="flex-1 bg-surface-app" edges={['top']}>
        <NutritionHeader title={COPY.manageEntry} description={COPY.manageEntryHint} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.primary} />
        </View>
      </SafeAreaView>
    )
  }

  // Enterprise no tiene scope de coach V2 (fail-closed en `nutritionV2CoachScope`).
  if (!scope) {
    return (
      <SafeAreaView className="flex-1 bg-surface-app" edges={['top']}>
        <NutritionHeader title={COPY.manageEntry} description={COPY.manageEntryHint} />
        <NutritionStatePanel
          title="No disponible en este espacio"
          description="Cambia a tu espacio de coach para administrar las porciones."
          icon="permission"
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-app" edges={['top']}>
      <NutritionHeader title={COPY.manageEntry} description={COPY.manageEntryHint} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 px-4 py-2"
      >
        {groups.map((entry) => {
          const active = entry.id === groupId
          // Segunda línea del chip (F1): cuántas equivalencias verá el alumno. Un grupo en 0
          // le abre el sheet "1 porción equivale a" vacío, y eso se dice en voz alta acá en vez
          // de dejar que lo descubra el alumno.
          const foods = portionsFoodsHint(foodCounts?.[entry.id])
          return (
            <Pressable
              key={entry.id}
              onPress={() => setGroupId(entry.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={foods ? `${entry.code} ${entry.name}. ${foods.text}` : `${entry.code} ${entry.name}`}
              className={`min-h-hit-min justify-center rounded-pill border px-3 py-1.5 ${
                active ? 'border-primary bg-primary/10' : 'border-subtle bg-surface-card'
              }`}
            >
              <Text className="text-[13px] font-sans-semibold text-strong">
                {entry.code} · {entry.name}
              </Text>
              {foods ? (
                <Text
                  className={`text-[10px] ${foods.empty ? 'font-sans-semibold text-warning-700' : 'text-muted'}`}
                  numberOfLines={1}
                >
                  {foods.text}
                </Text>
              ) : null}
            </Pressable>
          )
        })}
      </ScrollView>

      <View className="gap-2 px-4">
        <View className="min-h-hit-min flex-row items-center gap-2 rounded-control border border-default bg-surface-card px-3">
          <Search size={16} color={theme.mutedForeground} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={COPY.searchPlaceholder}
            placeholderTextColor={theme.mutedForeground}
            accessibilityLabel={COPY.searchAria}
            className="flex-1 py-2.5 text-strong"
          />
          {loadingRows ? <ActivityIndicator size="small" color={theme.primary} /> : null}
        </View>

        {/* Par de acciones: alta (primaria) + duplicar (secundaria, icono). Ambas hijas llevan
            ancho propio — la primaria `flex-1` y la secundaria cuadrada `shrink-0` — para que
            la fila no desborde en pantallas angostas. */}
        <View className="flex-row items-stretch gap-2">
          <Pressable
            onPress={() => setAdding(true)}
            accessibilityRole="button"
            accessibilityLabel={COPY.addFood}
            disabled={!groupId}
            className={`min-h-hit-min flex-1 flex-row items-center justify-center gap-2 rounded-control ${
              groupId ? '' : 'opacity-50'
            }`}
            style={{ backgroundColor: theme.primary }}
          >
            <Plus size={16} color={theme.primaryForeground} />
            <Text className="font-sans-bold" style={{ color: theme.primaryForeground }}>
              {COPY.addFood}
            </Text>
          </Pressable>
          {/* "Duplicar y ajustar" sobre CUALQUIER grupo visible: los del sistema no se editan
              (la RLS los niega) y esta pantalla tampoco ofrece editar los propios, así que
              duplicar es la única salida para trabajar con otros valores. Icono a secas para no
              competir con el alta: el sheet ya se abre explicando qué hace. */}
          <Pressable
            onPress={() => setDuplicating(true)}
            accessibilityRole="button"
            accessibilityLabel={group ? GROUP_COPY.duplicateAria(group.name) : GROUP_COPY.duplicate}
            disabled={!group}
            className={`min-h-hit-min min-w-hit-min shrink-0 items-center justify-center rounded-control border border-default bg-surface-card px-3 ${
              group ? '' : 'opacity-50'
            }`}
          >
            <Copy size={16} color={theme.mutedForeground} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-2 p-4">
        {rows.map((row) => (
          <View
            key={row.id}
            className="flex-row items-center gap-2 rounded-control border border-default bg-surface-card p-3"
          >
            <View className="flex-1">
              <Text className="font-sans-semibold text-strong" numberOfLines={1}>
                {row.foodName}
              </Text>
              <Text className="text-xs text-muted" numberOfLines={1}>
                {formatPortionSentence({
                  foodName: row.foodName,
                  portionGrams: row.portionGrams,
                  portionLabel: row.portionLabel,
                })}
              </Text>
            </View>
            <Text
              className={`text-[10px] font-sans-bold ${row.isOwn ? 'text-primary' : 'text-muted'}`}
            >
              {row.isOwn ? COPY.badgeOwn : COPY.badgeCatalog}
            </Text>
            <Pressable
              onPress={() => void (row.isOwn ? onRestore(row) : onExclude(row))}
              accessibilityRole="button"
              accessibilityLabel={row.isOwn ? COPY.restoreAria(row.foodName) : COPY.excludeAria(row.foodName)}
              className="min-h-hit-min min-w-hit-min items-center justify-center"
            >
              {row.isOwn ? (
                <RotateCcw size={16} color={theme.mutedForeground} />
              ) : (
                <X size={16} color={theme.mutedForeground} />
              )}
            </Pressable>
          </View>
        ))}

        {rows.length === 0 && !loadingRows ? (
          <NutritionStatePanel
            title={search.trim() ? COPY.emptySearch : COPY.empty}
            description={search.trim() ? 'Prueba con otro nombre.' : PORTIONS_COPY.builder.groupFoodsEmptyHint}
            icon="empty"
          />
        ) : null}

        {error ? (
          <Text className="text-center font-sans-semibold text-danger-600">
            {error}
          </Text>
        ) : null}
      </ScrollView>

      {adding && groupId ? (
        <AddEntrySheet
          groupId={groupId}
          groupName={group?.name ?? ''}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            void loadRows(groupId, search.trim())
            // El alta cambia el conteo del chip: se recarga el catálogo (sin loader a pantalla
            // completa) para que la línea "N alimentos equivalentes" no quede vieja.
            setGroupsNonce((n) => n + 1)
          }}
        />
      ) : null}

      {duplicating && group ? (
        <DuplicateGroupSheet
          open
          source={group}
          takenCodes={groups.map((entry) => entry.code)}
          onClose={() => setDuplicating(false)}
          onDuplicated={(created) => {
            // Se salta al grupo NUEVO: es el que el coach acaba de pedir y el que va a ajustar.
            setGroupId(created.id)
            setGroupsNonce((n) => n + 1)
          }}
        />
      ) : null}
    </SafeAreaView>
  )
}

/**
 * Alta de una equivalencia. La sugerencia de gramos la trae el servidor ya resuelta: el teléfono
 * no lleva una copia de la fórmula, así que jamás puede sugerir algo distinto del navegador.
 *
 * Chrome del DS: `components/Sheet` (mismo bottom sheet que el resto del dominio) en modo
 * `nativeModal`, porque esta pantalla se monta EMBEBIDA en el hub por pestaña y el contenedor de
 * @gorhom no es confiable en ese arranque (ver `SheetProps.nativeModal`). El montaje sigue siendo
 * condicional desde la pantalla, así que `open` va fijo en true.
 */
function AddEntrySheet({
  groupId,
  groupName,
  onClose,
  onSaved,
}: {
  groupId: string
  groupName: string
  onClose: () => void
  onSaved: () => void
}) {
  const { theme } = useTheme()
  const [search, setSearch] = useState('')
  const [candidates, setCandidates] = useState<ExchangeListCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<ExchangeListCandidate | null>(null)
  const [grams, setGrams] = useState('')
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (selected) return
    setLoading(true)
    const timer = setTimeout(() => {
      fetchExchangeListCandidates({ groupId, search: search.trim() || null })
        .then(setCandidates)
        .catch(() => setError(COPY.loadFailed))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [groupId, search, selected])

  const parsedGrams = useMemo(() => {
    const raw = grams.trim().replace(',', '.')
    if (raw === '') return null
    const value = Number(raw)
    return Number.isFinite(value) && value > 0 ? value : null
  }, [grams])

  async function save() {
    if (!selected || parsedGrams == null) {
      setError(PORTIONS_COPY.foodEquivalence.gramsRequired)
      return
    }
    setSaving(true)
    const result = await saveExchangeListEntry({
      exchangeGroupId: groupId,
      foodId: selected.id,
      portionGrams: parsedGrams,
      portionLabel: label.trim() || null,
    })
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onSaved()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={COPY.sectionTitle}
      description={groupName ? `${COPY.sectionHint} · ${groupName}` : COPY.sectionHint}
      accessibilityLabel={COPY.sectionTitle}
      snapPoints={['85%']}
      nativeModal
    >
      {selected ? (
        <View className="gap-2.5">
          <Pressable onPress={() => setSelected(null)} accessibilityRole="button" className="min-h-hit-min justify-center">
            <Text className="font-sans-semibold text-primary">← {selected.name}</Text>
          </Pressable>

          <Text className="text-[11px] font-sans-bold text-muted">
            {COPY.gramsLabel}
          </Text>
          <TextInput
            value={grams}
            onChangeText={setGrams}
            keyboardType="decimal-pad"
            placeholder={PORTIONS_COPY.foodEquivalence.gramsPlaceholder}
            placeholderTextColor={theme.mutedForeground}
            className="min-h-hit-min rounded-control border border-default bg-surface-card px-3 text-strong"
          />
          {selected.suggestedGrams != null && String(selected.suggestedGrams) !== grams.trim() ? (
            <Pressable
              onPress={() => setGrams(String(selected.suggestedGrams))}
              accessibilityRole="button"
              className="min-h-hit-min justify-center"
            >
              <Text className="text-xs font-sans-bold text-primary">
                {COPY.suggestedApply} · {selected.suggestedGrams} g
              </Text>
            </Pressable>
          ) : null}

          <Text className="text-[11px] font-sans-bold text-muted">
            {COPY.labelLabel}
          </Text>
          <TextInput
            value={label}
            onChangeText={setLabel}
            maxLength={40}
            placeholder={COPY.labelPlaceholder}
            placeholderTextColor={theme.mutedForeground}
            className="min-h-hit-min rounded-control border border-default bg-surface-card px-3 text-strong"
          />

          <View className="rounded-control border border-default p-3">
            <Text className="text-[10px] font-sans-bold text-muted">
              {COPY.previewTitle}
            </Text>
            <Text className="mt-1 font-sans-semibold text-strong">
              {formatPortionSentence({
                foodName: selected.name,
                portionGrams: parsedGrams,
                portionLabel: label,
              })}
            </Text>
          </View>

          <Pressable
            onPress={() => void save()}
            disabled={saving}
            accessibilityRole="button"
            className={`min-h-12 items-center justify-center rounded-control ${saving ? 'opacity-60' : ''}`}
            style={{ backgroundColor: theme.primary }}
          >
            <Text className="font-sans-bold" style={{ color: theme.primaryForeground }}>
              {saving ? COPY.saving : COPY.save}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View className="gap-2">
          <View className="min-h-hit-min flex-row items-center gap-2 rounded-control border border-default bg-surface-card px-3">
            <Search size={16} color={theme.mutedForeground} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={COPY.searchPlaceholder}
              placeholderTextColor={theme.mutedForeground}
              accessibilityLabel={COPY.searchAria}
              className="flex-1 py-2.5 text-strong"
            />
            {loading ? <ActivityIndicator size="small" color={theme.primary} /> : null}
          </View>
          {/* El scroll lo aporta el propio Sheet (`scrollable`), así que la lista no anida otro
              ScrollView — misma decisión que `NewPlanPickerSheet` en el índice del hub. */}
          <View className="gap-1.5">
            {candidates.map((candidate) => (
              <Pressable
                key={candidate.id}
                onPress={() => {
                  setSelected(candidate)
                  setGrams(candidate.suggestedGrams != null ? String(candidate.suggestedGrams) : '')
                  setError(null)
                }}
                accessibilityRole="button"
                className="min-h-hit-min justify-center rounded-control border border-default p-3"
              >
                <Text className="font-sans-semibold text-strong" numberOfLines={1}>
                  {candidate.name}
                  {candidate.alreadyInList ? ' ✓' : ''}
                </Text>
                {candidate.suggestedGrams != null ? (
                  <Text className="text-[11px] text-muted">
                    {COPY.suggested(String(candidate.suggestedGrams))}
                  </Text>
                ) : (
                  <Text className="text-[11px] text-muted">{COPY.suggestedNone}</Text>
                )}
              </Pressable>
            ))}
            {candidates.length === 0 && !loading ? (
              <Text className="py-4 text-center text-muted">
                {COPY.emptySearch}
              </Text>
            ) : null}
          </View>
        </View>
      )}

      {error ? (
        <Text className="text-center font-sans-semibold text-danger-600">
          {error}
        </Text>
      ) : null}
    </Sheet>
  )
}
