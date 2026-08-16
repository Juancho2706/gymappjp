'use client'

/**
 * "Sugerir metas" del paso 1 — regresion de V1 recuperada (BD1).
 *
 * Panel COLAPSABLE sobre el fieldset de "Metas diarias". Precargado con lo que la ficha del
 * alumno ya sabe (edad, peso, estatura, sexo) y editable campo por campo: el coach corrige el
 * peso de hoy sin irse a la ficha, y en modo plantilla (sin alumno) escribe los cuatro a mano.
 *
 * NADA de caja negra: la linea de supuestos —formula, factor de actividad, ajuste por objetivo y
 * los g/kg de proteina REALES del resultado— esta siempre a la vista, junto con el BMR y el TDEE
 * intermedios. "Usar estas metas" solo RELLENA los cuatro inputs de arriba, que siguen siendo
 * editables: la sugerencia es un punto de partida, no una decision del sistema.
 *
 * El calculo entero vive en `_lib/target-suggestion` (puro, delegando en `@eva/nutrition-engine`,
 * el MISMO motor de V1). Este archivo es solo formulario + presentacion.
 */

import { useState } from 'react'
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import {
  SUGGESTION_ACTIVITY_OPTIONS,
  SUGGESTION_GOAL_OPTIONS,
  SUGGESTION_LIMITS,
  SUGGESTION_SEX_OPTIONS,
  initialSuggestionForm,
  suggestTargets,
  type BuilderClientMetrics,
  type SuggestedTargets,
  type SuggestionForm,
} from '../_lib/target-suggestion'
import { labelClass, macroInputClass } from '@/app/coach/nutrition-v2/_lib/builder-ui-classes'

const KCAL_FORMAT = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })

export function SuggestTargetsPanel({
  metrics,
  onApply,
}: {
  /** Datos del alumno resueltos server-side; `null` = plantilla o alumno sin ficha de ingreso. */
  metrics: BuilderClientMetrics | null
  /** Rellena los cuatro inputs de "Metas diarias" (siguen editables). */
  onApply: (targets: SuggestedTargets) => void
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<SuggestionForm>(() => initialSuggestionForm(metrics))
  const [applied, setApplied] = useState(false)
  const suggestion = suggestTargets(form)

  function patch(next: Partial<SuggestionForm>) {
    setForm((prev) => ({ ...prev, ...next }))
    setApplied(false)
  }

  const numberFields: Array<{ field: 'age' | 'weightKg' | 'heightCm'; label: string; placeholder: string }> = [
    { field: 'age', label: 'Edad (años)', placeholder: String(SUGGESTION_LIMITS.age.min) },
    { field: 'weightKg', label: 'Peso (kg)', placeholder: '70' },
    { field: 'heightCm', label: 'Estatura (cm)', placeholder: '170' },
  ]

  return (
    <div className="rounded-card border border-border-subtle bg-surface-sunken">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex min-h-11 w-full items-center gap-2 rounded-card px-3 text-left transition-colors hover:bg-surface-card/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-strong">Sugerir metas</span>
          <span className="block text-xs text-muted">
            Calcula kcal y macros desde los datos del alumno. Puedes ajustarlas después.
          </span>
        </span>
        {open ? (
          <ChevronUp aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
        ) : (
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
        )}
      </button>

      {open ? (
        <div className="space-y-3 border-t border-border-subtle p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {numberFields.map(({ field, label, placeholder }) => (
              <div key={field}>
                <label className={labelClass} htmlFor={`suggest-${field}`}>
                  {label}
                </label>
                <input
                  id={`suggest-${field}`}
                  className={macroInputClass}
                  inputMode="decimal"
                  placeholder={placeholder}
                  value={form[field]}
                  onChange={(event) => patch({ [field]: event.target.value } as Partial<SuggestionForm>)}
                />
              </div>
            ))}
            <div>
              <label className={labelClass} htmlFor="suggest-sex">
                Sexo
              </label>
              <select
                id="suggest-sex"
                className={macroInputClass}
                value={form.sex}
                onChange={(event) => patch({ sex: event.target.value as SuggestionForm['sex'] })}
              >
                {SUGGESTION_SEX_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="suggest-activity">
                Actividad
              </label>
              <select
                id="suggest-activity"
                className={macroInputClass}
                value={form.activity}
                onChange={(event) => patch({ activity: event.target.value as SuggestionForm['activity'] })}
              >
                {SUGGESTION_ACTIVITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="suggest-goal">
                Objetivo
              </label>
              <select
                id="suggest-goal"
                className={macroInputClass}
                value={form.goal}
                onChange={(event) => patch({ goal: event.target.value as SuggestionForm['goal'] })}
              >
                {SUGGESTION_GOAL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {suggestion ? (
            <div className="rounded-control border border-primary/25 bg-primary/5 p-3">
              <p className="font-mono text-sm font-semibold tabular-nums text-strong">
                {KCAL_FORMAT.format(suggestion.calories)} kcal · P {suggestion.proteinG} g · C {suggestion.carbsG} g · G{' '}
                {suggestion.fatsG} g
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{suggestion.assumptions}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-subtle">
                Basal {KCAL_FORMAT.format(suggestion.bmr)} kcal · gasto total {KCAL_FORMAT.format(suggestion.tdee)} kcal.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onApply(suggestion)
                    setApplied(true)
                  }}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-control bg-primary/100 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Sparkles aria-hidden="true" className="h-4 w-4" />
                  Usar estas metas
                </button>
                {applied ? (
                  <span role="status" className="text-xs font-semibold text-primary">
                    Metas cargadas arriba. Ajústalas si quieres.
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-muted">
              Completa edad, peso y estatura para ver la sugerencia.
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}
