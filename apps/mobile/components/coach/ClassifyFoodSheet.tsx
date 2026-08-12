import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { RotateCcw, Save, Scale } from 'lucide-react-native'
import type { ExchangeGroup } from '@eva/nutrition-engine'
import {
  EMPTY_FOOD_CLASSIFICATION,
  classificationPreview,
  draftFromClassification,
  formatPortionSentence,
  hasClassificationChanges,
  parsePortionGrams,
  planFoodClassification,
  resolveCurrentClassification,
  suggestPortionGrams,
  type FoodCatalogItem,
  type FoodClassification,
  type FoodClassificationDraft,
  type NutritionV2CoachScope,
} from '@eva/nutrition-v2'
import { Sheet } from '../Sheet'
import { toast } from '../Toast'
import { useTheme } from '../../context/ThemeContext'
import { PORTIONS_COPY } from '../../lib/nutrition-portions-copy'
import {
  fetchFoodClassificationRN,
  runClassificationStepRN,
} from '../../lib/nutrition-v2-food-classification.api'

/**
 * "Clasificar en porciones" desde la ficha del alimento (T2.3 F6.4) — espejo del formulario único
 * web `apps/web/src/app/coach/nutrition-v2/_components/ClassifyFoodFlow.tsx`.
 *
 * El alimento YA viene elegido (se entra desde su ficha), así que no hay paso de búsqueda: tres
 * campos en una sola pantalla — grupo, gramos de 1 porción y medida casera.
 *
 * QUIÉN DECIDE QUÉ. Este componente NO elige el camino de escritura: se lo dicta
 * `planFoodClassification` (módulo puro con test, compartido con la web). Alimento propio ⇒ las
 * columnas `foods.exchange_*`; alimento ajeno/global ⇒ MI fila de `exchange_group_foods`, y
 * reclasificar exige retirar del grupo viejo ANTES de escribir el nuevo — si no, el alumno ve el
 * mismo alimento en dos grupos. El transporte de cada paso vive en
 * `lib/nutrition-v2-food-classification.api.ts`.
 *
 * LA SUGERENCIA DE GRAMOS SE CALCULA EN EL TELÉFONO. `suggestPortionGrams` es puro y viaja en
 * `@eva/nutrition-v2`: el alimento ya trae sus macros y su `macrosBasis` desde el catálogo y los
 * grupos ya están en memoria, así que es el MISMO número que calcula el servidor para la web, sin
 * gastar un round-trip por apertura.
 *
 * Montado sobre el `Sheet` DS con `nativeModal`, mismo criterio que los otros dos sheets de este
 * tab (`FoodDetailSheet`, `AddFoodSheet`): se abre desde una pantalla recién montada, que es el
 * cold-start donde el path @gorhom es frágil bajo reanimated 4 / Fabric.
 */

const COPY = PORTIONS_COPY.foodEquivalence
const LIST_COPY = PORTIONS_COPY.exchangeList

/** Lo que el tab necesita saber de lo recién clasificado (espejo del `ClassifiedFoodSummary` web). */
export type ClassifiedFoodSummary = {
  foodId: string
  /** null ⇒ quedó SIN clasificar. */
  groupId: string | null
  groupCode: string | null
  groupName: string | null
  portionGrams: number | null
  portionLabel: string | null
}

type Props = {
  open: boolean
  onClose: () => void
  scope: NutritionV2CoachScope
  /** Alimento ya elegido: la clasificación necesita sus macros, su base y su dueño. */
  item: FoodCatalogItem
  /** Catálogo completo de grupos (por sus macros de referencia). `null` = todavía cargando. */
  groups: ExchangeGroup[] | null
  groupsError: boolean
  onClassified: (summary: ClassifiedFoodSummary) => void
}

const LABEL_CLASS = 'text-[10px] font-black uppercase tracking-widest text-muted'
const INPUT_CLASS = 'min-h-11 rounded-control border border-default bg-surface-card px-3 text-base text-strong'

export function ClassifyFoodSheet({
  open,
  onClose,
  scope,
  item,
  groups,
  groupsError,
  onClassified,
}: Props) {
  const { theme } = useTheme()

  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [ownedByActor, setOwnedByActor] = useState(false)
  const [catalogGroupId, setCatalogGroupId] = useState<string | null>(null)
  const [current, setCurrent] = useState<FoodClassification | null>(null)
  const [draft, setDraft] = useState<FoodClassificationDraft>(EMPTY_FOOD_CLASSIFICATION)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const gramsRef = useRef<TextInput | null>(null)
  const labelRef = useRef<TextInput | null>(null)

  // Lectura y guardado son async y el sheet puede cerrarse mientras viajan: sin este guard el
  // `setState` de la respuesta cae sobre un componente muerto (mismo patrón que `AddFoodSheet`).
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const foodId = item.id

  /**
   * Estado vigente al abrir. Se lee SIEMPRE (no se cachea entre aperturas): entre una y otra el
   * coach pudo clasificar el mismo alimento desde la web o desde el builder, y abrir con un valor
   * viejo terminaría pisando su trabajo.
   */
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)
    setError(null)
    void (async () => {
      try {
        const read = await fetchFoodClassificationRN({ foodId, signal: controller.signal })
        if (controller.signal.aborted || !mountedRef.current) return
        const resolved = resolveCurrentClassification(read)
        setOwnedByActor(read.ownedByActor)
        setCatalogGroupId(read.columns?.groupId ?? null)
        setCurrent(resolved)
        setDraft(draftFromClassification(resolved))
        setLoading(false)
      } catch (err) {
        if (controller.signal.aborted || !mountedRef.current) return
        setLoading(false)
        setLoadError(
          err instanceof Error ? err.message : 'No pudimos leer la clasificación de este alimento.',
        )
      }
    })()
    return () => controller.abort()
  }, [open, foodId, reloadNonce])

  /**
   * Cerrar limpia. La web desmonta el contenido del sheet; acá el componente vive mientras el tab
   * lo tenga montado, así que el borrador del alimento anterior sobreviviría a la despedida y la
   * próxima apertura arrancaría con datos que no son de ESE alimento.
   */
  useEffect(() => {
    if (open) return
    setCurrent(null)
    setCatalogGroupId(null)
    setOwnedByActor(false)
    setDraft(EMPTY_FOOD_CLASSIFICATION)
    setError(null)
    setLoadError(null)
  }, [open])

  const groupList = useMemo(() => groups ?? [], [groups])

  const selectedGroup = useMemo(
    () => groupList.find((group) => group.id === draft.groupId) ?? null,
    [groupList, draft.groupId],
  )

  /**
   * Opciones del selector. "Sin clasificar" va PRIMERA y con `id: ''` — es el mismo valor vacío
   * que el `<option>` de la web y una intención legítima (quitar la clasificación), no la ausencia
   * de una elección.
   */
  const groupOptions = useMemo(
    () => [
      { id: '', label: COPY.groupPlaceholder },
      ...groupList.map((group) => ({
        id: group.id,
        label: `${group.code} · ${group.name}${group.isSystem ? '' : ' (tuyo)'}`,
      })),
    ],
    [groupList],
  )

  /**
   * Gramos sugeridos por los macros del alimento y los de referencia del grupo elegido. Es un
   * punto de partida EDITABLE: se ofrece con un botón, nunca se escribe solo encima de lo que el
   * coach ya puso.
   */
  const suggested = useMemo(() => {
    if (!selectedGroup) return null
    return suggestPortionGrams(
      {
        refProteinG: selectedGroup.refProteinG,
        refCarbsG: selectedGroup.refCarbsG,
        refFatsG: selectedGroup.refFatsG,
        refCalories: selectedGroup.refCalories,
      },
      {
        proteinG: item.proteinG,
        carbsG: item.carbsG,
        fatsG: item.fatsG,
        calories: item.calories,
        servingSize: item.servingSize,
        macrosBasis: item.macrosBasis ?? null,
      },
    )
  }, [item, selectedGroup])

  const preview = useMemo(() => classificationPreview(draft, groupList), [draft, groupList])

  const studentSentence = useMemo(() => {
    const grams = parsePortionGrams(draft.grams)
    if (!selectedGroup || grams.state !== 'value') return null
    return formatPortionSentence({
      foodName: item.name,
      portionGrams: grams.value,
      portionLabel: draft.label,
    })
  }, [item.name, selectedGroup, draft.grams, draft.label])

  const currentGroup = useMemo(
    () => (current ? (groupList.find((group) => group.id === current.groupId) ?? null) : null),
    [groupList, current],
  )

  /** Grupos de los que el alimento SALE al guardar. Se avisa: nadie quiere descubrirlo después. */
  const leavingGroups = useMemo(() => {
    if (ownedByActor) return [] as string[]
    const plan = planFoodClassification({ foodId, ownedByActor, current, catalogGroupId, draft })
    if (!plan.ok) return [] as string[]
    return plan.steps
      .filter((step) => step.kind === 'clear-list-entry' || step.kind === 'exclude-list-entry')
      .map((step) => groupList.find((group) => group.id === step.exchangeGroupId)?.name)
      .filter((name): name is string => typeof name === 'string')
  }, [foodId, ownedByActor, current, catalogGroupId, draft, groupList])

  const dirty = hasClassificationChanges(current, draft)
  const canSave = !loading && !loadError && !saving && dirty

  const handleSave = useCallback(async () => {
    if (saving) return
    // Abrir, mirar y cerrar no es un cambio: sin esto se gastaría un round-trip (y un toast de
    // "guardado") por una visita que no tocó nada. Mismo veredicto que deshabilita el botón.
    if (!hasClassificationChanges(current, draft)) {
      onClose()
      return
    }

    const plan = planFoodClassification({ foodId, ownedByActor, current, catalogGroupId, draft })
    if (!plan.ok) {
      setError(plan.issue.message)
      // El foco va al campo del problema; "grupo" no es un input (son pills), así que ahí solo
      // queda el mensaje.
      if (plan.issue.field === 'grams') gramsRef.current?.focus()
      if (plan.issue.field === 'label') labelRef.current?.focus()
      return
    }
    if (plan.steps.length === 0) {
      onClose()
      return
    }

    setError(null)
    setSaving(true)
    // EN ORDEN y abortando al primer fallo: el plan retira del grupo viejo antes de escribir el
    // nuevo, así que seguir después de un error dejaría al alimento en los dos grupos.
    for (const step of plan.steps) {
      const result = await runClassificationStepRN(scope, step)
      if (!mountedRef.current) return
      if (!result.ok) {
        setSaving(false)
        setError(result.error)
        return
      }
    }
    setSaving(false)

    const grams = parsePortionGrams(draft.grams)
    const label = draft.label.trim()
    const classifiedGroup = draft.groupId
      ? (groupList.find((group) => group.id === draft.groupId) ?? null)
      : null
    toast.success(classifiedGroup ? LIST_COPY.saved : 'Alimento sin clasificar')
    onClassified({
      foodId,
      groupId: classifiedGroup?.id ?? null,
      groupCode: classifiedGroup?.code ?? null,
      groupName: classifiedGroup?.name ?? null,
      portionGrams: grams.state === 'value' ? grams.value : null,
      portionLabel: label.length > 0 ? label : null,
    })
    onClose()
  }, [
    saving,
    foodId,
    ownedByActor,
    current,
    catalogGroupId,
    draft,
    groupList,
    scope,
    onClassified,
    onClose,
  ])

  const description = [item.name, item.brand].filter(Boolean).join(' · ') || COPY.sectionHint

  return (
    <Sheet
      open={open}
      onClose={onClose}
      nativeModal
      snapPoints={['90%']}
      scrollable
      title={LIST_COPY.sectionTitle}
      description={description}
      accessibilityLabel={`Clasificar ${item.name} en porciones`}
    >
      {loading ? (
        <View className="items-center gap-2 py-12">
          <ActivityIndicator color={theme.primary} />
          <Text className="text-sm text-muted">Cargando la clasificación actual…</Text>
        </View>
      ) : loadError ? (
        <View className="items-center gap-3 py-8">
          <Text className="text-center text-sm font-semibold text-strong">{loadError}</Text>
          {/* No se muestra el formulario a ciegas: guardar sin saber dónde está hoy el alimento
              podría dejarlo clasificado en dos grupos. */}
          <Text className="text-center text-xs text-muted">
            No mostramos el formulario a ciegas: guardar sin saber dónde está hoy el alimento podría
            dejarlo clasificado en dos grupos.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={PORTIONS_COPY.builder.pickerRetry}
            onPress={() => setReloadNonce((n) => n + 1)}
            className="min-h-11 flex-row items-center gap-2 rounded-control border border-default bg-surface-card px-4"
          >
            <RotateCcw color={theme.textSecondary} size={16} />
            <Text className="text-sm font-semibold text-strong">
              {PORTIONS_COPY.builder.pickerRetry}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text className="text-xs leading-relaxed text-muted">{LIST_COPY.sectionHint}</Text>

          {current ? (
            <View className="gap-1 rounded-control border border-default bg-surface-sunken px-3 py-2.5">
              <Text className={LABEL_CLASS}>Clasificación actual</Text>
              <Text className="text-[13px] font-semibold text-body">
                {currentGroup
                  ? COPY.preview(
                      currentGroup.name,
                      current.portionGrams != null ? String(current.portionGrams) : '—',
                      current.portionLabel,
                    )
                  : groupList.length === 0
                    ? // Sin el catálogo de grupos cargado no se puede nombrar el grupo, y decir "ya
                      // no lo ves" sería acusar de perdido algo que solo está en vuelo.
                      COPY.groupsLoading
                    : 'Está clasificado en un grupo que ya no ves.'}
              </Text>
              <Text className="text-[11px] text-subtle">
                {current.origin === 'coach-list-row'
                  ? LIST_COPY.badgeOwn + ': la escribiste tú.'
                  : LIST_COPY.badgeCatalog + ': viene del alimento, no de tu lista.'}
              </Text>
            </View>
          ) : null}

          <View className="gap-2">
            <Text className={LABEL_CLASS}>{COPY.groupLabel}</Text>
            {groupsError ? (
              <Text className="text-[11px] text-muted">{COPY.groupsError}</Text>
            ) : groups === null ? (
              <Text className="text-[11px] text-muted">{COPY.groupsLoading}</Text>
            ) : groupList.length === 0 ? (
              <Text className="text-[11px] text-muted">{COPY.groupsEmpty}</Text>
            ) : (
              // Pills en vez del `<select>` de la web: en RN no hay picker nativo sin dependencia
              // nueva, y son pocas opciones. Se comportan como un radio-group real (una sola
              // elegida, siempre hay una), por eso `radio`/`radiogroup` y no `button`.
              <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
                {groupOptions.map((option) => {
                  const active = draft.groupId === option.id
                  return (
                    <Pressable
                      key={option.id || 'none'}
                      accessibilityRole="radio"
                      accessibilityLabel={option.label}
                      accessibilityState={{ selected: active, disabled: saving }}
                      disabled={saving}
                      onPress={() => {
                        setError(null)
                        setDraft((prev) => ({ ...prev, groupId: option.id }))
                      }}
                      className={`min-h-9 shrink-0 flex-row items-center rounded-pill border px-3 ${
                        active ? 'border-primary bg-primary/10' : 'border-default bg-surface-card'
                      } ${saving ? 'opacity-60' : ''}`}
                    >
                      <Text
                        numberOfLines={1}
                        className={`text-xs font-semibold ${active ? 'text-primary' : 'text-muted'}`}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            )}
          </View>

          <View className="gap-2">
            <Text className={LABEL_CLASS}>{COPY.gramsLabel}</Text>
            <TextInput
              ref={gramsRef}
              accessibilityLabel={COPY.gramsLabel}
              value={draft.grams}
              onChangeText={(next) => {
                // El error describe el INTENTO anterior: al corregir el campo deja de aplicar y
                // dejarlo en rojo hace parecer que el sheet sigue bloqueado.
                setError(null)
                setDraft((prev) => ({ ...prev, grams: next }))
              }}
              editable={!saving}
              keyboardType="decimal-pad"
              placeholder={COPY.gramsPlaceholder}
              placeholderTextColor={theme.mutedForeground}
              className={`${INPUT_CLASS} font-semibold`}
            />
            {/* La sugerencia se ofrece SOLO si dice algo distinto de lo ya escrito: repetir el
                mismo número como botón haría dudar de que el valor esté bien. */}
            {suggested != null && String(suggested) !== draft.grams.trim() ? (
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="text-[10.5px] text-muted">
                  {LIST_COPY.suggested(String(suggested))}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={LIST_COPY.suggestedApply}
                  accessibilityState={{ disabled: saving }}
                  disabled={saving}
                  hitSlop={6}
                  onPress={() => {
                    setError(null)
                    setDraft((prev) => ({ ...prev, grams: String(suggested) }))
                  }}
                  className="min-h-9 justify-center"
                >
                  <Text className="text-[10px] font-black uppercase tracking-widest text-primary">
                    {LIST_COPY.suggestedApply}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {selectedGroup && suggested == null ? (
              <Text className="text-[10.5px] text-muted">{LIST_COPY.suggestedNone}</Text>
            ) : null}
          </View>

          <View className="gap-2">
            <Text className={LABEL_CLASS}>{COPY.labelLabel}</Text>
            <TextInput
              ref={labelRef}
              accessibilityLabel={COPY.labelLabel}
              value={draft.label}
              onChangeText={(next) => {
                setError(null)
                setDraft((prev) => ({ ...prev, label: next }))
              }}
              editable={!saving}
              // Mismo techo que el input web: el servidor lo corta igual (`EXCHANGE_PORTION_LABEL_MAX`).
              maxLength={40}
              autoCorrect={false}
              placeholder={COPY.labelPlaceholder}
              placeholderTextColor={theme.mutedForeground}
              className={INPUT_CLASS}
            />
          </View>

          {studentSentence ? (
            <View className="gap-1 rounded-control border border-default bg-surface-sunken px-3 py-2.5">
              <Text className={LABEL_CLASS}>{LIST_COPY.previewTitle}</Text>
              <Text className="text-sm font-semibold text-strong">{studentSentence}</Text>
              {preview ? <Text className="text-[11px] text-muted">{preview}</Text> : null}
            </View>
          ) : null}

          {leavingGroups.length > 0 ? (
            <Text className="text-[11px] leading-relaxed text-muted">
              Al guardar, este alimento dejará de contar en {leavingGroups.join(' y ')} para tus
              alumnos.
            </Text>
          ) : null}

          <View className="mt-1 gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={draft.groupId ? LIST_COPY.save : 'Quitar clasificación'}
              accessibilityState={{ disabled: !canSave }}
              disabled={!canSave}
              onPress={() => void handleSave()}
              className={`min-h-12 flex-row items-center justify-center gap-2 rounded-control bg-primary px-4 ${
                canSave ? '' : 'opacity-50'
              }`}
            >
              {saving ? (
                <ActivityIndicator color={theme.primaryForeground} size="small" />
              ) : draft.groupId ? (
                <Save color={theme.primaryForeground} size={16} />
              ) : (
                <Scale color={theme.primaryForeground} size={16} />
              )}
              <Text className="text-sm font-semibold text-primary-foreground">
                {saving ? LIST_COPY.saving : draft.groupId ? LIST_COPY.save : 'Quitar clasificación'}
              </Text>
            </Pressable>

            {!dirty ? (
              <Text className="text-center text-[11px] text-subtle">
                {current ? 'Cambia algo para guardar.' : 'Elige un grupo y los gramos de 1 porción.'}
              </Text>
            ) : null}

            {error ? (
              <Text
                accessibilityLiveRegion="polite"
                className="text-center text-xs font-semibold text-danger-700"
              >
                {error}
              </Text>
            ) : null}
          </View>
        </>
      )}
    </Sheet>
  )
}
