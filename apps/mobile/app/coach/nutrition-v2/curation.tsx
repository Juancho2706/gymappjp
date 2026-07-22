import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { FlashList } from '@shopify/flash-list'
import { Barcode, CheckCircle2, Link2, Plus, Search } from 'lucide-react-native'
import { NutritionHeader, NutritionStatePanel } from '../../../components/nutrition-v2'
// Import por ruta directa (no via el barrel): respeta el contrato de MacroChipRow.
import { MacroChipRow } from '../../../components/nutrition-v2/MacroChipRow'
import { Sheet } from '../../../components'
import { COACH_TABBAR_CLEARANCE } from '../../../components/coach/CoachMobileChrome'
import type { FoodCatalogItem } from '@eva/nutrition-v2'
import { useTheme } from '../../../context/ThemeContext'
import { isEnabled } from '../../../lib/flags'
import { useEntitlements } from '../../../lib/entitlements'
import { useWorkspace } from '../../../lib/workspace'
import { nutritionV2CoachScope } from '../../../lib/nutrition-v2.api'
import { supabase } from '../../../lib/supabase'
import { searchFoodCatalogV2 } from '../../../lib/nutrition-v2-catalog.api'
import {
  createCoachFoodForCurationV2,
  formatRelativeDate,
  listMissingFoodCodesV2,
  resolveMissingFoodCodeV2,
  type CurationWriteClient,
  type MissingCodeRow,
} from '../../../lib/nutrition-v2-curation.api'

/**
 * Cola de curación V2 del coach (RN) — port 1:1 de
 * `apps/web/src/app/coach/nutrition-v2/_components/CurationQueue.tsx`.
 *
 * Lista paginada por offset de GTIN escaneados sin match local
 * (`food_catalog_missing_codes`, `resolved_at NULL`); el coach los resuelve VINCULANDO
 * una fila del catálogo o CREANDO un alimento coach-scoped y vinculándolo en un paso. Es
 * el ÚNICO alta de alimento custom del coach en V2 (el catálogo `foods.tsx` es read-only).
 *
 * Persistencia directa por supabase-js (`nutrition-v2-curation.api.ts`), RLS = barrera;
 * el gate cliente de superficie es suave y fail-closed (igual que el hub `index.tsx`).
 *
 * FRONTERA con el tablist del hub (4B-17): además del default export de la ruta,
 * exportamos el cuerpo embebible `CurationQueueScreen({ embedded })`. `embedded=true`
 * omite el `SafeAreaView` + `NutritionHeader onBack` propios (el hub aporta el chrome);
 * la ruta standalone se conserva para deep-links.
 */

// Cliente de escritura: el cliente supabase-js del móvil es estructuralmente compatible
// (mismo cast que el builder). Estable a nivel de módulo.
const db = supabase as unknown as CurationWriteClient

const MIN_QUERY = 2
const DEBOUNCE_MS = 400

type Feedback = { kind: 'success' | 'error'; text: string }

export function CurationQueueScreen({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter()
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const entitlements = useEntitlements()
  const {
    ready: workspaceReady,
    kind: workspaceKind,
    teamId: workspaceTeamId,
    orgId: workspaceOrgId,
  } = useWorkspace()

  // Fail-closed: solo operamos cuando el workspace resuelve a un scope de coach válido.
  const scope = useMemo(
    () =>
      workspaceReady
        ? nutritionV2CoachScope({ kind: workspaceKind, teamId: workspaceTeamId, orgId: workspaceOrgId })
        : null,
    [workspaceReady, workspaceKind, workspaceTeamId, workspaceOrgId],
  )
  const enabled = entitlements.ready && isEnabled('nutritionV2Coach')

  const [userId, setUserId] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id ?? null)
    })
    return () => {
      active = false
    }
  }, [])

  const [rows, setRows] = useState<MissingCodeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [selected, setSelected] = useState<MissingCodeRow | null>(null)

  // Carga inicial (offset 0) una vez que el gate cliente abre.
  useEffect(() => {
    if (!enabled || !scope) return
    let active = true
    setLoading(true)
    setLoadError(null)
    void listMissingFoodCodesV2({ db, offset: 0 }).then((res) => {
      if (!active) return
      if (!res.ok) {
        setLoadError(res.error)
        setLoading(false)
        return
      }
      setRows(res.items)
      setNextOffset(res.nextOffset)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [enabled, scope])

  const loadMore = useCallback(async () => {
    if (nextOffset == null || loadingMore) return
    setLoadingMore(true)
    const res = await listMissingFoodCodesV2({ db, offset: nextOffset })
    if (!res.ok) {
      setFeedback({ kind: 'error', text: res.error })
      setLoadingMore(false)
      return
    }
    setRows((prev) => [...prev, ...res.items])
    setNextOffset(res.nextOffset)
    setLoadingMore(false)
  }, [nextOffset, loadingMore])

  // Éxito de resolución: quita la fila (paridad exacta con web `setRows(filter)`), cierra
  // la hoja y muestra confirmación inline (RN no tiene toast). Copy verbatim.
  const handleResolved = useCallback((id: string, message: string) => {
    setRows((prev) => prev.filter((row) => row.id !== id))
    setSelected(null)
    setFeedback({ kind: 'success', text: message })
  }, [])

  // ── Estados (copys verbatim del web `CurationQueue.tsx:76-99`) ──
  const renderBody = () => {
    if (!entitlements.ready || !workspaceReady) return <LoadingCard color={theme.primary} />
    if (!enabled || !scope) {
      return (
        <View className="px-4 pt-3">
          <NutritionStatePanel
            icon="permission"
            title="Centro V2 no habilitado"
            description="El rollout del coach está apagado o este workspace no pertenece al canary."
          />
        </View>
      )
    }
    if (loading) return <LoadingCard color={theme.primary} />
    if (loadError) {
      return (
        <View className="px-4 pt-3">
          <NutritionStatePanel
            icon="error"
            tone="danger"
            illustration="error-amable"
            title="No se pudo cargar la cola"
            description={loadError}
          />
        </View>
      )
    }
    if (rows.length === 0) {
      return (
        <View className="px-4 pt-3">
          <NutritionStatePanel
            icon="empty"
            illustration="catalogo-vacio"
            title="Sin codigos por revisar"
            description="Cuando tus alumnos escaneen productos que aun no existen en el catalogo local, apareceran aqui para que los vincules."
          />
        </View>
      )
    }

    return (
      <FlashList
        data={rows}
        keyExtractor={(row) => row.id}
        // Embebido bajo el tablist del hub: clearance de la cápsula flotante (mismo patrón que foods.tsx).
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: embedded ? insets.bottom + COACH_TABBAR_CLEARANCE : 40,
        }}
        ItemSeparatorComponent={() => <View className="h-2" />}
        ListHeaderComponent={
          <View className="gap-3 pb-3">
            {feedback ? <FeedbackBanner feedback={feedback} color={theme} /> : null}
            <View className="flex-row items-start gap-3 rounded-card border border-warning-500/30 bg-warning-500/10 p-3">
              <View className="h-10 w-10 shrink-0 items-center justify-center rounded-control bg-warning-500/15">
                <Barcode size={20} color={theme.warning} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-bold text-text-strong">Codigos por revisar</Text>
                <Text className="mt-0.5 text-[13px] leading-relaxed text-text-muted">
                  Productos escaneados que aun no existen en el catalogo local. Vincular no
                  inventa nutrientes: solo ensena a EVA que fila local corresponde a ese codigo.
                </Text>
              </View>
            </View>
          </View>
        }
        ListFooterComponent={
          nextOffset != null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={loadingMore ? 'Cargando' : 'Ver mas codigos'}
              accessibilityState={{ disabled: loadingMore }}
              disabled={loadingMore}
              onPress={() => void loadMore()}
              className={`mt-2 min-h-11 flex-row items-center justify-center gap-2 rounded-control border border-border-default bg-surface-card px-4 ${loadingMore ? 'opacity-60' : ''}`}
            >
              {loadingMore ? <ActivityIndicator size="small" color={theme.primary} /> : null}
              <Text className="text-sm font-semibold text-text-strong">
                {loadingMore ? 'Cargando…' : 'Ver mas codigos'}
              </Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item }) => (
          <View className="flex-row items-center justify-between gap-3 rounded-control border border-border-default bg-surface-card p-3">
            <View className="min-w-0 flex-1">
              <Text
                className="font-mono text-sm font-black text-text-strong"
                style={{ fontVariant: ['tabular-nums'] }}
                numberOfLines={1}
              >
                {item.barcode}
              </Text>
              <Text className="mt-1 text-xs font-semibold text-text-muted">
                {item.countryCode} · {item.sightings}{' '}
                {item.sightings === 1 ? 'escaneo' : 'escaneos'} · {formatRelativeDate(item.lastSeenAt)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Vincular alimento"
              onPress={() => setSelected(item)}
              className="min-h-11 shrink-0 flex-row items-center justify-center gap-1.5 rounded-control border border-border-default bg-surface-card px-3"
            >
              <Link2 size={16} color={theme.foreground} />
              <Text className="text-sm font-semibold text-text-strong">Vincular alimento</Text>
            </Pressable>
          </View>
        )}
      />
    )
  }

  const sheet = (
    <ResolveSheet
      open={selected != null}
      row={selected}
      userId={userId}
      onClose={() => setSelected(null)}
      onResolved={handleResolved}
    />
  )

  if (embedded) {
    return (
      <View className="flex-1">
        {renderBody()}
        {sheet}
      </View>
    )
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-app">
      <View className="gap-4 px-4 pb-2 pt-4">
        <NutritionHeader title="Curación" onBack={() => router.back()} />
      </View>
      <View className="flex-1">{renderBody()}</View>
      {sheet}
    </SafeAreaView>
  )
}

export default function CurationRoute() {
  return <CurationQueueScreen />
}

function LoadingCard({ color }: { color: string }) {
  return (
    <View className="mx-4 mt-3 min-h-24 items-center justify-center rounded-card border border-border-default bg-surface-card">
      <ActivityIndicator color={color} />
    </View>
  )
}

function FeedbackBanner({
  feedback,
  color,
}: {
  feedback: Feedback
  color: { success: string; destructive: string }
}) {
  const isSuccess = feedback.kind === 'success'
  return (
    <View
      className={`flex-row items-start gap-2 rounded-control border p-3 ${isSuccess ? 'border-success-500/30 bg-success-500/10' : 'border-danger-500/30 bg-danger-500/10'}`}
    >
      <CheckCircle2
        size={16}
        color={isSuccess ? color.success : color.destructive}
        style={{ marginTop: 1 }}
      />
      <Text
        className={`flex-1 text-xs font-semibold ${isSuccess ? 'text-success-700' : 'text-danger-700'}`}
      >
        {feedback.text}
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Hoja de resolución (`ResolveDialog` web) — dos modos: Buscar existente / Crear nuevo
// ---------------------------------------------------------------------------

function ResolveSheet({
  open,
  row,
  userId,
  onClose,
  onResolved,
}: {
  open: boolean
  row: MissingCodeRow | null
  userId: string | null
  onClose: () => void
  onResolved: (id: string, message: string) => void
}) {
  const { theme } = useTheme()
  // Conservamos la última fila (en estado, no ref-en-render) para pintar el contenido
  // durante la animación de cierre, cuando `row` ya volvió a null.
  const [persisted, setPersisted] = useState<MissingCodeRow | null>(null)
  useEffect(() => {
    if (row) setPersisted(row)
  }, [row])
  const shown = row ?? persisted

  const [mode, setMode] = useState<'search' | 'create'>('search')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset al abrir una fila nueva.
  useEffect(() => {
    if (open) {
      setMode('search')
      setBusy(false)
      setError(null)
    }
  }, [open, shown?.id])

  async function linkExisting(food: FoodCatalogItem) {
    if (busy || !shown) return
    setBusy(true)
    setError(null)
    const res = await resolveMissingFoodCodeV2({ db, missingCodeId: shown.id, resolvedFoodId: food.id })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onResolved(shown.id, `${shown.barcode} vinculado con ${food.name}`)
  }

  async function createAndLink(input: {
    name: string
    brand: string | null
    unit: 'g' | 'ml'
    calories: number
    proteinG: number
    carbsG: number
    fatsG: number
  }) {
    if (busy || !shown) return
    if (!userId) {
      setError('No se pudo identificar tu sesion. Reintenta.')
      return
    }
    setBusy(true)
    setError(null)
    const res = await createCoachFoodForCurationV2({
      db,
      userId,
      missingCodeId: shown.id,
      ...input,
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onResolved(shown.id, `${shown.barcode} vinculado con ${input.name}`)
  }

  return (
    <Sheet
      open={open}
      onClose={() => !busy && onClose()}
      title="Vincular codigo"
      nativeModal
      accessibilityLabel={shown ? `Vincular codigo ${shown.barcode}` : undefined}
    >
      <Text
        className="font-mono text-sm font-black text-text-muted"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {shown?.barcode}
      </Text>

      {/* Segmented de dos modos (tokens del DS; activo = bg-primary + texto blanco). */}
      <View className="flex-row gap-1 rounded-control border border-border-default bg-surface-sunken p-1">
        {(['search', 'create'] as const).map((key) => {
          const active = mode === key
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setMode(key)}
              className={`min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-control px-3 ${active ? 'bg-primary' : ''}`}
            >
              {key === 'search' ? (
                <Search size={16} color={active ? theme.primaryForeground : theme.mutedForeground} />
              ) : (
                <Plus size={16} color={active ? theme.primaryForeground : theme.mutedForeground} />
              )}
              <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-text-muted'}`}>
                {key === 'search' ? 'Buscar existente' : 'Crear nuevo'}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {error ? (
        <View className="rounded-control border border-danger-500/30 bg-danger-500/10 px-3 py-2">
          <Text className="text-xs font-semibold text-danger-700">{error}</Text>
        </View>
      ) : null}

      <View pointerEvents={busy ? 'none' : 'auto'} style={{ opacity: busy ? 0.6 : 1 }}>
        {mode === 'search' ? (
          <CatalogPicker onPick={linkExisting} />
        ) : (
          <CreateFoodForm onSubmit={createAndLink} />
        )}
      </View>

      {/* Pie fijo (copy verbatim web `:285-289`). */}
      <View className="flex-row items-start gap-2 rounded-control bg-surface-sunken px-3 py-2.5">
        <CheckCircle2 size={16} color={theme.success} style={{ marginTop: 2 }} />
        <Text className="flex-1 text-[11px] leading-relaxed text-text-muted">
          Vincular no cambia el alimento ni inventa nutrientes: solo asocia ese codigo a una
          fila del catalogo.
        </Text>
      </View>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Modo "Buscar existente" — reusa `searchFoodCatalogV2` (400 ms / MIN 2), placeholder propio
// ---------------------------------------------------------------------------

function CatalogPicker({ onPick }: { onPick: (food: FoodCatalogItem) => void }) {
  const { theme } = useTheme()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [items, setItems] = useState<FoodCatalogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const latestQuery = useRef('')

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (debounced.length < MIN_QUERY) {
      controller.current?.abort()
      latestQuery.current = debounced
      setItems([])
      setSearchError(null)
      setLoading(false)
      return
    }
    controller.current?.abort()
    const c = new AbortController()
    controller.current = c
    latestQuery.current = debounced
    setLoading(true)
    setSearchError(null)
    void searchFoodCatalogV2({ query: debounced, countryCode: 'CL', surface: 'coach', signal: c.signal })
      .then((res) => {
        // Descarta respuestas viejas (web `latestQuery` guard).
        if (c.signal.aborted || latestQuery.current !== debounced) return
        setItems(res.items)
        setLoading(false)
      })
      .catch((err) => {
        if (c.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return
        setSearchError(err instanceof Error ? err.message : 'No se pudo buscar en el catálogo.')
        setItems([])
        setLoading(false)
      })
    return () => {
      c.abort()
    }
  }, [debounced])

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2 rounded-control border border-border-default bg-surface-card px-3">
        <Search color={theme.mutedForeground} size={16} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar el producto exacto…"
          placeholderTextColor={theme.mutedForeground}
          accessibilityLabel="Buscar alimento en el catalogo"
          autoCorrect={false}
          returnKeyType="search"
          className="min-h-11 flex-1 py-2 text-base text-text-strong"
        />
        {loading ? <ActivityIndicator color={theme.mutedForeground} size="small" /> : null}
      </View>

      {searchError ? (
        <View className="rounded-control bg-danger-500/10 px-3 py-2">
          <Text className="text-xs text-danger-700">{searchError}</Text>
        </View>
      ) : debounced.length < MIN_QUERY ? (
        <Text className="px-1 text-xs text-text-muted">Escribe al menos 2 caracteres para buscar.</Text>
      ) : !loading && items.length === 0 ? (
        <Text className="px-1 text-xs text-text-muted">
          Sin resultados. Prueba con otro nombre o crea el alimento en la pestana Crear nuevo.
        </Text>
      ) : (
        <View className="gap-1.5">
          {items.map((food) => (
            <Pressable
              key={food.id}
              accessibilityRole="button"
              accessibilityLabel={`Vincular con ${food.name}`}
              onPress={() => onPick(food)}
              className="flex-row items-center gap-2 rounded-control border border-border-default bg-surface-card px-3 py-2"
            >
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-semibold text-text-strong" numberOfLines={1}>
                  {food.name}
                </Text>
                {food.brand ? (
                  <Text className="mt-0.5 text-[11px] text-text-muted" numberOfLines={1}>
                    {food.brand}
                  </Text>
                ) : null}
                <View className="mt-1">
                  <MacroChipRow
                    calories={food.calories}
                    proteinG={food.proteinG}
                    carbsG={food.carbsG}
                    fatsG={food.fatsG}
                    per={`/ ${food.servingSize} ${food.servingUnit}`}
                    size="sm"
                  />
                </View>
              </View>
              <Link2 size={16} color={theme.primary} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Modo "Crear nuevo" — alta de alimento custom del coach (macros POR 100)
// ---------------------------------------------------------------------------

interface CreateFormState {
  name: string
  brand: string
  unit: 'g' | 'ml'
  calories: string
  proteinG: string
  carbsG: string
  fatsG: string
}

const EMPTY_FORM: CreateFormState = {
  name: '',
  brand: '',
  unit: 'g',
  calories: '',
  proteinG: '',
  carbsG: '',
  fatsG: '',
}

/** trim + coma→punto + `>= 0` finito (port de web `toNumber` `:428-432`). */
function toNumber(value: string): number | null {
  if (value.trim() === '') return null
  const n = Number(value.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

function CreateFoodForm({
  onSubmit,
}: {
  onSubmit: (input: {
    name: string
    brand: string | null
    unit: 'g' | 'ml'
    calories: number
    proteinG: number
    carbsG: number
    fatsG: number
  }) => void
}) {
  const { theme } = useTheme()
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM)
  const set = (key: keyof CreateFormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const calories = toNumber(form.calories)
  const proteinG = toNumber(form.proteinG)
  const carbsG = toNumber(form.carbsG)
  const fatsG = toNumber(form.fatsG)
  const valid =
    form.name.trim().length > 0 &&
    calories !== null &&
    proteinG !== null &&
    carbsG !== null &&
    fatsG !== null

  function submit() {
    if (!valid || calories === null || proteinG === null || carbsG === null || fatsG === null) return
    onSubmit({
      name: form.name.trim(),
      brand: form.brand.trim() === '' ? null : form.brand.trim(),
      unit: form.unit,
      calories,
      proteinG,
      carbsG,
      fatsG,
    })
  }

  const inputClass =
    'min-h-11 rounded-control border border-border-default bg-surface-card px-3 text-base text-text-strong'

  return (
    <View className="gap-2.5">
      <Text className="px-1 text-[11px] leading-relaxed text-text-muted">
        Ingresa las macros por 100 {form.unit}. Se crea como alimento tuyo (coach) y se vincula
        al codigo.
      </Text>

      <Field label="Nombre">
        <TextInput
          className={inputClass}
          value={form.name}
          onChangeText={(v) => set('name', v)}
          placeholder="Ej: Yogur natural"
          placeholderTextColor={theme.mutedForeground}
        />
      </Field>

      <View className="flex-row gap-2">
        <Field label="Marca (opcional)" className="flex-1">
          <TextInput
            className={inputClass}
            value={form.brand}
            onChangeText={(v) => set('brand', v)}
            placeholder="Ej: Soprole"
            placeholderTextColor={theme.mutedForeground}
          />
        </Field>
        <Field label="Unidad" className="flex-1">
          <View className="flex-row gap-1 rounded-control border border-border-default bg-surface-sunken p-1">
            {(['g', 'ml'] as const).map((u) => {
              const active = form.unit === u
              return (
                <Pressable
                  key={u}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => set('unit', u)}
                  className={`min-h-9 flex-1 items-center justify-center rounded-control px-2 ${active ? 'bg-primary' : ''}`}
                >
                  <Text
                    className={`text-xs font-semibold ${active ? 'text-white' : 'text-text-muted'}`}
                  >
                    {u === 'g' ? 'Solido (g)' : 'Liquido (ml)'}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </Field>
      </View>

      <View className="flex-row gap-2">
        <Field label={`Calorias / 100${form.unit}`} className="flex-1">
          <TextInput
            className={inputClass}
            keyboardType="decimal-pad"
            value={form.calories}
            onChangeText={(v) => set('calories', v)}
            placeholder="0"
            placeholderTextColor={theme.mutedForeground}
          />
        </Field>
        <Field label="Proteina (g)" className="flex-1">
          <TextInput
            className={inputClass}
            keyboardType="decimal-pad"
            value={form.proteinG}
            onChangeText={(v) => set('proteinG', v)}
            placeholder="0"
            placeholderTextColor={theme.mutedForeground}
          />
        </Field>
      </View>

      <View className="flex-row gap-2">
        <Field label="Carbohidratos (g)" className="flex-1">
          <TextInput
            className={inputClass}
            keyboardType="decimal-pad"
            value={form.carbsG}
            onChangeText={(v) => set('carbsG', v)}
            placeholder="0"
            placeholderTextColor={theme.mutedForeground}
          />
        </Field>
        <Field label="Grasas (g)" className="flex-1">
          <TextInput
            className={inputClass}
            keyboardType="decimal-pad"
            value={form.fatsG}
            onChangeText={(v) => set('fatsG', v)}
            placeholder="0"
            placeholderTextColor={theme.mutedForeground}
          />
        </Field>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Crear y vincular"
        accessibilityState={{ disabled: !valid }}
        disabled={!valid}
        onPress={submit}
        className={`min-h-11 flex-row items-center justify-center gap-2 rounded-control bg-primary px-4 ${valid ? '' : 'opacity-50'}`}
      >
        <Plus size={16} color={theme.primaryForeground} />
        <Text className="text-sm font-semibold text-white">Crear y vincular</Text>
      </Pressable>
    </View>
  )
}

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <View className={className}>
      <Text className="mb-1 text-xs font-semibold text-text-muted">{label}</Text>
      {children}
    </View>
  )
}
