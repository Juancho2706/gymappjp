'use client'

import { useState } from 'react'
import { AlertTriangle, Loader2, Plus } from 'lucide-react'
import type { ExchangeGroup } from '@eva/nutrition-engine'
import {
  CoachFoodInputSchema,
  customMacrosOf,
  macroEnergyMismatch,
  type BuilderItem,
} from '../_lib/draft-builder'
import { createCoachFoodAction } from '../_actions/builder.actions'
import type { Dispatch } from '../_lib/builder-view-model'
import { labelClass, macroInputClass, secondaryButtonClass } from '../_lib/builder-ui-classes'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import {
  loadExchangeGroupsForBuilderAction,
  loadExchangeGroupsForCoachAction,
} from './PortionsGroupsAction'
import { useIsTemplateMode } from './TemplateModeContext'

const CUSTOM_MACRO_FIELDS: Array<{ field: keyof Pick<BuilderItem, 'customCalories' | 'customProteinG' | 'customCarbsG' | 'customFatsG'>; label: string }> = [
  { field: 'customCalories', label: 'kcal' },
  { field: 'customProteinG', label: 'P (g)' },
  { field: 'customCarbsG', label: 'C (g)' },
  { field: 'customFatsG', label: 'G (g)' },
]

/**
 * Bloque opcional "Equivalencia de porciones" del alta rapida del builder (P-B). Colapsado
 * por defecto; el catalogo de grupos se carga PEREZOSAMENTE al expandir, con la MISMA server
 * action del picker de porciones (`loadExchangeGroupsForBuilderAction`): los services de
 * intercambios jamas entran al bundle cliente.
 */
function FreeFoodEquivalenceBlock({
  clientId,
  value,
  onChange,
}: {
  clientId: string
  value: { groupId: string; grams: string; label: string }
  onChange: (next: { groupId: string; grams: string; label: string }) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [groups, setGroups] = useState<ExchangeGroup[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const templateMode = useIsTemplateMode()

  async function expand() {
    setExpanded(true)
    if (groups || loading) return
    setLoading(true)
    setLoadError(null)
    const res = templateMode
      ? await loadExchangeGroupsForCoachAction()
      : await loadExchangeGroupsForBuilderAction({ clientId })
    setLoading(false)
    if (!res.ok) {
      setLoadError(PORTIONS_COPY.foodEquivalence.groupsError)
      return
    }
    setGroups(res.groups)
  }

  function collapse() {
    setExpanded(false)
    onChange({ groupId: '', grams: '', label: '' })
  }

  const copy = PORTIONS_COPY.foodEquivalence

  return (
    <div className="mt-2 border-t border-border-subtle pt-2">
      <button
        type="button"
        onClick={() => (expanded ? collapse() : void expand())}
        aria-expanded={expanded}
        className="text-xs font-semibold text-primary transition-colors hover:underline min-h-9"
      >
        {expanded ? copy.collapse : copy.expand}
      </button>
      {expanded ? (
        <div className="mt-1.5 space-y-2">
          <p className="text-[11px] text-muted">{copy.sectionHint}</p>
          {loading ? (
            <p className="text-[11px] text-muted">{copy.groupsLoading}</p>
          ) : loadError ? (
            <p className="text-[11px] text-rose-600 dark:text-rose-300">{loadError}</p>
          ) : (groups ?? []).length === 0 ? (
            <p className="text-[11px] text-muted">{copy.groupsEmpty}</p>
          ) : (
            <>
              <label className="block">
                <span className={labelClass}>{copy.groupLabel}</span>
                <select
                  className={macroInputClass}
                  value={value.groupId}
                  onChange={(e) => onChange({ ...value, groupId: e.target.value })}
                >
                  <option value="">{copy.groupPlaceholder}</option>
                  {(groups ?? []).map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.code} · {group.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={labelClass}>{copy.gramsLabel}</span>
                  <input
                    className={macroInputClass}
                    inputMode="numeric"
                    placeholder={copy.gramsPlaceholder}
                    value={value.grams}
                    onChange={(e) => onChange({ ...value, grams: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className={labelClass}>{copy.labelLabel}</span>
                  <input
                    className={macroInputClass}
                    maxLength={40}
                    placeholder={copy.labelPlaceholder}
                    value={value.label}
                    onChange={(e) => onChange({ ...value, label: e.target.value })}
                  />
                </label>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

export function FreeFoodFields({
  item,
  variantKey,
  slotKey,
  clientId,
  dispatch,
}: {
  item: BuilderItem
  variantKey: string
  slotKey: string
  clientId: string
  dispatch: Dispatch
}) {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [equivalence, setEquivalence] = useState({ groupId: '', grams: '', label: '' })
  const macros = customMacrosOf(item)
  const showWarning = macroEnergyMismatch(macros)
  const unit = item.unit === 'ml' ? 'ml' : 'g'

  async function handleSave() {
    setSaveError(null)
    const gramsRaw = equivalence.grams.trim().replace(',', '.')
    const parsed = CoachFoodInputSchema.safeParse({
      clientId,
      name: (item.customName ?? '').trim(),
      brand: null,
      unit,
      calories: macros.calories,
      proteinG: macros.proteinG,
      carbsG: macros.carbsG,
      fatsG: macros.fatsG,
      exchangeGroupId: equivalence.groupId === '' ? null : equivalence.groupId,
      exchangePortionGrams: gramsRaw === '' ? null : Number(gramsRaw),
      exchangePortionLabel: equivalence.label.trim() === '' ? null : equivalence.label.trim(),
    })
    if (!parsed.success) {
      // El trio de equivalencia tiene mensajes propios (grupo sin gramos y viceversa); el
      // resto cae al copy generico de macros.
      const equivalenceIssue = parsed.error.issues.find((issue) =>
        String(issue.path[0] ?? '').startsWith('exchange'),
      )
      setSaveError(
        equivalenceIssue?.message ??
          'Completa el nombre y macros validas (no negativas) antes de guardar.',
      )
      return
    }
    setSaving(true)
    const res = await createCoachFoodAction(parsed.data)
    setSaving(false)
    if (!res.ok) {
      setSaveError(res.error)
      return
    }
    dispatch({
      type: 'UPDATE_ITEM',
      variantKey,
      slotKey,
      itemKey: item.key,
      patch: {
        food: res.food,
        customName: null,
        customCalories: '',
        customProteinG: '',
        customCarbsG: '',
        customFatsG: '',
      },
    })
    setEquivalence({ groupId: '', grams: '', label: '' })
  }

  return (
    <div className="mt-2 rounded-control border border-border-subtle bg-surface-sunken p-2.5">
      <p className={labelClass}>Macros por 100 {unit}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CUSTOM_MACRO_FIELDS.map(({ field, label }) => (
          <div key={field}>
            <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-subtle" htmlFor={`cm-${item.key}-${field}`}>
              {label}
            </label>
            <input
              id={`cm-${item.key}-${field}`}
              className={macroInputClass}
              inputMode="decimal"
              placeholder="0"
              value={item[field]}
              onChange={(e) =>
                dispatch({ type: 'UPDATE_ITEM', variantKey, slotKey, itemKey: item.key, patch: { [field]: e.target.value } })
              }
            />
          </div>
        ))}
      </div>
      {showWarning ? (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Las kcal no cuadran con las macros (4P + 4C + 9G). Puedes guardar igual, pero revisa los valores.
        </p>
      ) : null}
      <FreeFoodEquivalenceBlock clientId={clientId} value={equivalence} onChange={setEquivalence} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className={secondaryButtonClass + ' min-h-9 px-3 text-xs'}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Guardar en mi catalogo
        </button>
        {saveError ? <span className="text-[11px] text-rose-600 dark:text-rose-300">{saveError}</span> : null}
      </div>
    </div>
  )
}
