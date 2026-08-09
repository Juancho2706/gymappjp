'use client'

/**
 * Formulario UNICO de "clasificar en porciones" del tab Alimentos (T2.3 F3, criterio 2 de la
 * SPEC: «clasifica un alimento en un grupo de intercambio y define sus porciones, con un solo
 * formulario»).
 *
 * QUE REEMPLAZA. En `/coach/foods` la misma pregunta se contestaba en tres piezas:
 * `ClassifyFoodSheet` (buscar entre MIS alimentos → grupo + gramos), `ExchangeListEntrySheet`
 * (elegir grupo primero, buscar el alimento despues) y `ExchangePortionsSection` (la lista por
 * grupo). Aca el alimento YA viene elegido — se entra desde su ficha — asi que el paso de
 * busqueda desaparece y quedan tres campos en una sola pantalla: grupo, gramos y medida casera.
 *
 * CONTRATOS SERVER SIN TOCAR. Escribe con las actions que ya existen; cual de ellas corre lo
 * decide `planFoodClassification` (modulo puro con test), porque no es una decision de UI:
 *  - alimento del coach ⇒ `setFoodExchangeEquivalenceAction` (columnas + sync de la lista);
 *  - alimento ajeno/global ⇒ `saveExchangeListEntryAction` / `restoreExchangeListEntryAction` /
 *    `excludeExchangeListEntryAction` sobre MI fila de `exchange_group_foods`.
 * La UI no autoriza: cada action re-verifica sesion, visibilidad del grupo y RLS.
 *
 * LA SUGERENCIA DE GRAMOS SE CALCULA EN CLIENTE. `suggestPortionGrams` es puro y viaja en
 * `@eva/nutrition-v2`; el alimento ya trae sus macros y su `macrosBasis` desde el catalogo, y los
 * grupos ya estan cacheados en el navegador. Es exactamente el mismo numero que calculaba
 * `searchExchangeListCandidatesAction` server-side, sin gastar un round-trip por apertura.
 */

import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Loader2, RotateCcw, Save, Scale } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { formatPortionSentence, suggestPortionGrams, type FoodCatalogItem } from '@eva/nutrition-v2'
import type { ExchangeGroup } from '@eva/nutrition-engine'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
// T2.3 F5 — las dos actions se mudaron desde `/coach/foods/_actions` al hub con la carpeta vieja.
import { setFoodExchangeEquivalenceAction } from '../_actions/food-equivalence.actions'
import {
  excludeExchangeListEntryAction,
  restoreExchangeListEntryAction,
  saveExchangeListEntryAction,
} from '../_actions/exchange-lists.actions'
import { loadFoodExchangeClassificationHubAction } from '../_actions/food-catalog.actions'
import {
  EMPTY_FOOD_CLASSIFICATION,
  classificationPreview,
  draftFromClassification,
  hasClassificationChanges,
  parsePortionGrams,
  planFoodClassification,
  resolveCurrentClassification,
  type ClassificationStep,
  type FoodClassification,
  type FoodClassificationDraft,
} from '../_lib/food-classification'

const COPY = PORTIONS_COPY.foodEquivalence
const LIST_COPY = PORTIONS_COPY.exchangeList

const labelClass = 'text-[10px] font-black uppercase tracking-widest text-muted'
const fieldClass =
  'min-h-11 w-full rounded-control border border-border-default bg-surface-card px-3 text-base text-strong outline-none placeholder:text-muted focus:ring-2 focus:ring-ring disabled:opacity-60 md:text-sm'

export type ClassifiedFoodSummary = {
  foodId: string
  /** null ⇒ quedo SIN clasificar. */
  groupId: string | null
  groupCode: string | null
  groupName: string | null
  portionGrams: number | null
  portionLabel: string | null
}

/** Ejecuta un paso del plan contra la action que le corresponde. Sin logica de negocio aca. */
async function runStep(step: ClassificationStep): Promise<{ ok: true } | { ok: false; error: string }> {
  if (step.kind === 'set-food-equivalence') {
    const result = await setFoodExchangeEquivalenceAction({
      foodId: step.foodId,
      exchangeGroupId: step.exchangeGroupId,
      exchangePortionGrams: step.exchangePortionGrams,
      exchangePortionLabel: step.exchangePortionLabel,
    })
    return result.success ? { ok: true } : { ok: false, error: result.error }
  }
  if (step.kind === 'save-list-entry') {
    const result = await saveExchangeListEntryAction({
      exchangeGroupId: step.exchangeGroupId,
      foodId: step.foodId,
      portionGrams: step.portionGrams,
      portionLabel: step.portionLabel,
    })
    return result.success ? { ok: true } : { ok: false, error: result.error }
  }
  if (step.kind === 'exclude-list-entry') {
    const result = await excludeExchangeListEntryAction({
      exchangeGroupId: step.exchangeGroupId,
      foodId: step.foodId,
    })
    return result.success ? { ok: true } : { ok: false, error: result.error }
  }
  const result = await restoreExchangeListEntryAction({
    exchangeGroupId: step.exchangeGroupId,
    foodId: step.foodId,
  })
  return result.success ? { ok: true } : { ok: false, error: result.error }
}

export function ClassifyFoodFlow({
  open,
  onOpenChange,
  food,
  groups,
  groupsLoading = false,
  onClassified,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Alimento YA elegido (card o ficha del tab). `null` mientras el sheet esta cerrado. */
  food: FoodCatalogItem | null
  /** Catalogo de grupos del coach, ya cacheado por el tab. Se usa completo por sus ref macros. */
  groups: ExchangeGroup[]
  groupsLoading?: boolean
  onClassified: (summary: ClassifiedFoodSummary) => void
}) {
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [ownedByActor, setOwnedByActor] = useState(false)
  const [catalogGroupId, setCatalogGroupId] = useState<string | null>(null)
  const [current, setCurrent] = useState<FoodClassification | null>(null)
  const [draft, setDraft] = useState<FoodClassificationDraft>(EMPTY_FOOD_CLASSIFICATION)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const groupFieldId = useId()
  const gramsFieldId = useId()
  const labelFieldId = useId()

  const foodId = food?.id ?? null

  /**
   * Estado vigente al abrir. Se lee SIEMPRE (no se cachea entre aperturas): entre una y otra el
   * coach pudo clasificar el mismo alimento desde el builder o desde RN, y abrir con un valor
   * viejo terminaria pisando su trabajo.
   */
  useEffect(() => {
    if (!open || !foodId) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setError(null)
    void loadFoodExchangeClassificationHubAction({ foodId }).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (!res.ok) {
        setLoadError(res.error)
        return
      }
      const resolved = resolveCurrentClassification(res.classification)
      setOwnedByActor(res.classification.ownedByActor)
      setCatalogGroupId(res.classification.columns?.groupId ?? null)
      setCurrent(resolved)
      setDraft(draftFromClassification(resolved))
    })
    return () => {
      cancelled = true
    }
  }, [open, foodId, reloadNonce])

  // Cerrar limpia: el sheet se reusa para el siguiente alimento y no debe abrir con el anterior.
  useEffect(() => {
    if (open) return
    setCurrent(null)
    setCatalogGroupId(null)
    setOwnedByActor(false)
    setDraft(EMPTY_FOOD_CLASSIFICATION)
    setError(null)
    setLoadError(null)
  }, [open])

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === draft.groupId) ?? null,
    [groups, draft.groupId],
  )

  /**
   * Gramos sugeridos por los macros del alimento y los de referencia del grupo elegido. Es un
   * punto de partida EDITABLE: se ofrece con un boton, nunca se escribe solo encima de lo que el
   * coach ya puso.
   */
  const suggested = useMemo(() => {
    if (!food || !selectedGroup) return null
    return suggestPortionGrams(
      {
        refProteinG: selectedGroup.refProteinG,
        refCarbsG: selectedGroup.refCarbsG,
        refFatsG: selectedGroup.refFatsG,
        refCalories: selectedGroup.refCalories,
      },
      {
        proteinG: food.proteinG,
        carbsG: food.carbsG,
        fatsG: food.fatsG,
        calories: food.calories,
        servingSize: food.servingSize,
        macrosBasis: food.macrosBasis ?? null,
      },
    )
  }, [food, selectedGroup])

  const preview = useMemo(() => classificationPreview(draft, groups), [draft, groups])
  const studentSentence = useMemo(() => {
    const grams = parsePortionGrams(draft.grams)
    if (!food || !selectedGroup || grams.state !== 'value') return null
    return formatPortionSentence({
      foodName: food.name,
      portionGrams: grams.value,
      portionLabel: draft.label,
    })
  }, [food, selectedGroup, draft.grams, draft.label])

  const currentGroup = useMemo(
    () => (current ? (groups.find((group) => group.id === current.groupId) ?? null) : null),
    [groups, current],
  )

  /** Grupos de los que el alimento SALE al guardar. Se avisa: nadie quiere descubrirlo despues. */
  const leavingGroups = useMemo(() => {
    if (!foodId || ownedByActor) return [] as string[]
    const plan = planFoodClassification({
      foodId,
      ownedByActor,
      current,
      catalogGroupId,
      draft,
    })
    if (!plan.ok) return [] as string[]
    return plan.steps
      .filter((step) => step.kind === 'clear-list-entry' || step.kind === 'exclude-list-entry')
      .map((step) => groups.find((group) => group.id === step.exchangeGroupId)?.name)
      .filter((name): name is string => typeof name === 'string')
  }, [foodId, ownedByActor, current, catalogGroupId, draft, groups])

  const dirty = hasClassificationChanges(current, draft)
  const canSave = !!foodId && !loading && !loadError && !saving && dirty

  const handleSave = useCallback(async () => {
    if (!food) return
    const plan = planFoodClassification({
      foodId: food.id,
      ownedByActor,
      current,
      catalogGroupId,
      draft,
    })
    if (!plan.ok) {
      setError(plan.issue.message)
      return
    }
    if (plan.steps.length === 0) {
      onOpenChange(false)
      return
    }

    setError(null)
    setSaving(true)
    for (const step of plan.steps) {
      const result = await runStep(step)
      if (!result.ok) {
        setSaving(false)
        setError(result.error)
        return
      }
    }
    setSaving(false)

    const grams = parsePortionGrams(draft.grams)
    const label = draft.label.trim()
    const classifiedGroup = draft.groupId ? (groups.find((g) => g.id === draft.groupId) ?? null) : null
    toast.success(classifiedGroup ? LIST_COPY.saved : 'Alimento sin clasificar')
    onClassified({
      foodId: food.id,
      groupId: classifiedGroup?.id ?? null,
      groupCode: classifiedGroup?.code ?? null,
      groupName: classifiedGroup?.name ?? null,
      portionGrams: grams.state === 'value' ? grams.value : null,
      portionLabel: label.length > 0 ? label : null,
    })
    onOpenChange(false)
  }, [food, ownedByActor, current, catalogGroupId, draft, groups, onClassified, onOpenChange])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/*
        `dvh` y no `vh`: en un telefono el teclado NO reduce `vh`, asi que un sheet a `90vh`
        mantiene su alto y tapa el campo enfocado (el defecto que arrastran los sheets viejos de
        `/coach/foods`). Con `dvh` el sheet encoge y el area interna hace scroll hasta el input.
      */}
      <SheetContent
        side="bottom"
        className="max-h-[min(92dvh,760px)] rounded-t-sheet border-subtle bg-surface-card text-body"
      >
        <SheetHeader className="border-0 bg-surface-card px-6 pt-2">
          <SheetTitle className="font-display text-[19px] font-extrabold normal-case leading-snug tracking-[-0.01em] text-strong">
            {LIST_COPY.sectionTitle}
          </SheetTitle>
          <SheetDescription className="text-[12.5px] text-muted">
            {food ? [food.name, food.brand].filter(Boolean).join(' · ') : COPY.sectionHint}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 pb-8">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm">Cargando la clasificación actual…</span>
            </div>
          ) : loadError ? (
            <div className="space-y-3 py-8 text-center">
              <p className="text-sm font-semibold text-strong">{loadError}</p>
              <p className="text-xs text-muted">
                No mostramos el formulario a ciegas: guardar sin saber dónde está hoy el alimento
                podría dejarlo clasificado en dos grupos.
              </p>
              <button
                type="button"
                onClick={() => setReloadNonce((n) => n + 1)}
                className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong hover:bg-surface-sunken"
              >
                <RotateCcw aria-hidden="true" className="size-4" />
                {PORTIONS_COPY.builder.pickerRetry}
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-muted">{LIST_COPY.sectionHint}</p>

              {current ? (
                <div className="rounded-control border border-border-default bg-surface-sunken px-3 py-2.5">
                  <p className={labelClass}>Clasificación actual</p>
                  <p className="mt-1 text-[13px] font-semibold text-body">
                    {currentGroup
                      ? COPY.preview(
                          currentGroup.name,
                          current.portionGrams != null ? String(current.portionGrams) : '—',
                          current.portionLabel,
                        )
                      : groups.length === 0
                        ? // Sin el catalogo de grupos cargado no se puede nombrar el grupo, y
                          // decir "ya no lo ves" seria acusar de perdido algo que solo esta en vuelo.
                          COPY.groupsLoading
                        : 'Está clasificado en un grupo que ya no ves.'}
                  </p>
                  <p className="mt-1 text-[11px] text-subtle">
                    {current.origin === 'coach-list-row'
                      ? LIST_COPY.badgeOwn + ': la escribiste tú.'
                      : LIST_COPY.badgeCatalog + ': viene del alimento, no de tu lista.'}
                  </p>
                </div>
              ) : null}

              <div className="space-y-2">
                <label className={labelClass} htmlFor={groupFieldId}>
                  {COPY.groupLabel}
                </label>
                {groupsLoading && groups.length === 0 ? (
                  <p className="text-[11px] text-muted">{COPY.groupsLoading}</p>
                ) : groups.length === 0 ? (
                  <p className="text-[11px] text-muted">{COPY.groupsEmpty}</p>
                ) : (
                  <select
                    id={groupFieldId}
                    className={fieldClass}
                    disabled={saving}
                    value={draft.groupId}
                    onChange={(event) => {
                      const groupId = event.target.value
                      setError(null)
                      setDraft((prev) => ({ ...prev, groupId }))
                    }}
                  >
                    <option value="">{COPY.groupPlaceholder}</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.code} · {group.name}
                        {group.isSystem ? '' : ' (tuyo)'}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-2">
                <label className={labelClass} htmlFor={gramsFieldId}>
                  {COPY.gramsLabel}
                </label>
                <input
                  id={gramsFieldId}
                  inputMode="decimal"
                  autoComplete="off"
                  className={fieldClass}
                  disabled={saving}
                  placeholder={COPY.gramsPlaceholder}
                  value={draft.grams}
                  onChange={(event) => {
                    const grams = event.target.value
                    setError(null)
                    setDraft((prev) => ({ ...prev, grams }))
                  }}
                />
                {suggested != null && String(suggested) !== draft.grams.trim() ? (
                  <button
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, grams: String(suggested) }))}
                    className="min-h-9 text-[10px] font-black uppercase tracking-widest text-primary hover:underline"
                  >
                    {LIST_COPY.suggestedApply} · {suggested} g
                  </button>
                ) : null}
                {selectedGroup && suggested == null ? (
                  <p className="text-[10px] text-muted">{LIST_COPY.suggestedNone}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label className={labelClass} htmlFor={labelFieldId}>
                  {COPY.labelLabel}
                </label>
                <input
                  id={labelFieldId}
                  maxLength={40}
                  autoComplete="off"
                  className={fieldClass}
                  disabled={saving}
                  placeholder={COPY.labelPlaceholder}
                  value={draft.label}
                  onChange={(event) => {
                    const label = event.target.value
                    setError(null)
                    setDraft((prev) => ({ ...prev, label }))
                  }}
                />
              </div>

              {studentSentence ? (
                <div className="rounded-control border border-border-default bg-surface-sunken px-3 py-2.5">
                  <p className={labelClass}>{LIST_COPY.previewTitle}</p>
                  <p className="mt-1 break-words text-sm font-semibold text-strong">{studentSentence}</p>
                  {preview ? <p className="mt-1 text-[11px] text-muted">{preview}</p> : null}
                </div>
              ) : null}

              {leavingGroups.length > 0 ? (
                <p className="text-[11px] leading-relaxed text-muted">
                  Al guardar, este alimento dejará de contar en {leavingGroups.join(' y ')} para tus
                  alumnos.
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!canSave}
                className="eva-press inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : draft.groupId ? (
                  <Save aria-hidden="true" className="size-4" />
                ) : (
                  <Scale aria-hidden="true" className="size-4" />
                )}
                {saving
                  ? LIST_COPY.saving
                  : draft.groupId
                    ? LIST_COPY.save
                    : 'Quitar clasificación'}
              </button>

              {!dirty && !loading ? (
                <p className="text-center text-[11px] text-subtle">
                  {current ? 'Cambia algo para guardar.' : 'Elige un grupo y los gramos de 1 porción.'}
                </p>
              ) : null}

              {error ? (
                <p role="alert" className="text-center text-xs font-bold text-[var(--cta-danger)]">
                  {error}
                </p>
              ) : null}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
