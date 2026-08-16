'use client'

/**
 * Cabecera del EDITOR UNICO (T3.x): metadatos del plan editables sobre el mismo arbol del
 * quick-edit (`state.meta`). Solo se pinta cuando la superficie hidrato meta (la ruta
 * `/editor`); en el quick-edit clasico `state.meta` no existe y esta card no aparece.
 *
 * - Nombre: editable (espejo del contrato, 1-180 tras trim).
 * - Estrategia: selector con regla segura (`qeAllowedStrategies`): `flexible` solo si ningun
 *   dia tiene franjas — el alumno en flexible ve targets-only y publicar franjas invisibles
 *   seria perdida silenciosa. `hybrid` pinta candado sin Pro; el gate real es del server.
 * - Permisos: los switches y el ± % de ajuste. `canSubstitute` sigue oculto (D4 de T2.5:
 *   permiso muerto — ningun camino de autorizacion lo lee).
 * - Vigencia: en CREACION (meta.effectiveFrom presente) fecha elegible >= hoy; en edicion,
 *   solo informativa (el server computa max(hoy, base)).
 */

import { ClipboardList, Info, LockKeyhole } from 'lucide-react'
import type { NutritionStrategy } from '@eva/nutrition-v2'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Switch } from '@/components/ui/switch'
import { OptionalClampedIntInput } from '@/components/ui/clamped-int-input'
import { useQuickEdit } from './QuickEditProvider'
import { PLAN_NAME_MAX, qeAllowedStrategies } from './quick-edit-state'
import { QE_COPY } from './microcopy'

/** Tope del contrato de la accion de guardado (`SaveSchema.description`: max 2000 tras trim). */
const TEMPLATE_DESCRIPTION_MAX = 2000

const STRATEGY_LABEL: Record<NutritionStrategy, string> = {
  structured: 'Estructurado',
  flexible: 'Flexible',
  hybrid: 'Híbrido',
}

const PERMISSION_ROWS = [
  {
    key: 'canRegisterFreely' as const,
    label: 'Registro libre',
    hint: 'El alumno puede registrar alimentos fuera del plan.',
  },
  {
    key: 'canAdjustPrescribedQuantity' as const,
    label: 'Ajustar cantidades',
    hint: 'El alumno puede corregir la cantidad de lo prescrito.',
  },
  {
    key: 'canMoveMealSlot' as const,
    label: 'Mover comidas de franja',
    hint: 'El alumno puede registrar una comida en otra franja del día.',
  },
  {
    key: 'canSkipOptionalItems' as const,
    label: 'Saltar opcionales',
    hint: 'El alumno puede omitir los alimentos marcados como opcionales.',
  },
]

export function EditorMetaCard() {
  const {
    state,
    dispatch,
    errors,
    showErrors,
    isPending,
    futureDateLabel,
    today,
    hasNutritionPro,
    surface,
    templateDescription,
    setTemplateDescription,
  } = useQuickEdit()
  const meta = state.meta
  if (!meta) return null

  const nameError = showErrors ? errors['meta.name'] : undefined
  const dateError = showErrors ? errors['meta.effectiveFrom'] : undefined
  const allowed = qeAllowedStrategies(state)
  const flexibleBlocked = !allowed.includes('flexible')
  // Modo creacion = la vigencia es elegible (el campo existe en meta). En plantilla la llave
  // no existe (draftToEditState sin `effectiveFrom`), asi que el campo jamas se pinta.
  const isCreation = meta.effectiveFrom !== undefined
  const isTemplate = surface === 'template'

  return (
    <section className="rounded-card border border-border-subtle bg-surface-card p-4">
      <div className="flex items-center gap-2">
        <ClipboardList aria-hidden="true" className="h-4 w-4 text-muted" />
        <h2 className="font-display text-base font-semibold text-strong">
          {isTemplate ? 'Plantilla' : 'Plan'}
        </h2>
      </div>

      <label htmlFor="editor-plan-name" className="mt-3 block text-xs font-semibold text-muted">
        {isTemplate ? QE_COPY.templateNameLabel : 'Nombre del plan'}
      </label>
      <input
        id="editor-plan-name"
        type="text"
        value={meta.name}
        onChange={(event) => dispatch({ type: 'SET_PLAN_NAME', value: event.target.value })}
        maxLength={PLAN_NAME_MAX}
        disabled={isPending}
        aria-invalid={Boolean(nameError)}
        className="mt-1.5 w-full rounded-control border border-border-subtle bg-surface-app px-3 py-2.5 text-sm leading-6 text-body placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder={isTemplate ? QE_COPY.templateNamePlaceholder : 'Ej: Plan definición 2026'}
      />
      {nameError ? (
        <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-300">
          {nameError}
        </p>
      ) : null}

      {isTemplate ? (
        <>
          <label htmlFor="editor-template-description" className="mt-4 block text-xs font-semibold text-muted">
            {QE_COPY.templateDescriptionLabel}
          </label>
          <textarea
            id="editor-template-description"
            value={templateDescription}
            onChange={(event) => setTemplateDescription(event.target.value)}
            maxLength={TEMPLATE_DESCRIPTION_MAX}
            disabled={isPending}
            rows={2}
            className="mt-1.5 w-full resize-y rounded-control border border-border-subtle bg-surface-app px-3 py-2.5 text-sm leading-6 text-body placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={QE_COPY.templateDescriptionPlaceholder}
          />
        </>
      ) : null}

      <p className="mt-4 text-xs font-semibold text-muted">Estrategia</p>
      <SegmentedControl
        className="mt-1.5"
        size="sm"
        options={allowed.map((strategy) => ({
          value: strategy,
          label:
            strategy === 'hybrid' && !hasNutritionPro ? (
              <span className="inline-flex items-center gap-1">
                <LockKeyhole aria-hidden="true" className="h-3 w-3" />
                {STRATEGY_LABEL[strategy]}
              </span>
            ) : (
              STRATEGY_LABEL[strategy]
            ),
        }))}
        value={meta.strategy}
        onChange={(value) => {
          if (isPending) return
          dispatch({ type: 'SET_STRATEGY', value: value as NutritionStrategy })
        }}
      />
      {flexibleBlocked ? (
        <p className="mt-1.5 text-xs leading-5 text-muted">
          Flexible solo está disponible sin franjas: en esa estrategia el alumno ve metas, no
          comidas.
        </p>
      ) : null}

      {isCreation ? (
        <>
          <label htmlFor="editor-effective-from" className="mt-4 block text-xs font-semibold text-muted">
            Vigente desde
          </label>
          <input
            id="editor-effective-from"
            type="date"
            value={meta.effectiveFrom ?? today}
            min={today}
            onChange={(event) =>
              dispatch({ type: 'SET_EFFECTIVE_FROM', value: event.target.value || null })
            }
            disabled={isPending}
            aria-invalid={Boolean(dateError)}
            className="mt-1.5 w-full rounded-control border border-border-subtle bg-surface-app px-3 py-2.5 text-sm leading-6 text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {dateError ? (
            <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-300">
              {dateError}
            </p>
          ) : null}
        </>
      ) : null}

      {/* Permisos del alumno. `canSubstitute` NO se pinta (D4 de T2.5: permiso muerto). */}
      <div className="mt-4 space-y-3">
        {PERMISSION_ROWS.map(({ key, label, hint }) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-5 text-strong">{label}</p>
              <p className="text-xs leading-5 text-muted">{hint}</p>
            </div>
            <Switch
              checked={meta.permissions[key]}
              onCheckedChange={(checked: boolean) =>
                dispatch({ type: 'SET_PERMISSION', patch: { [key]: checked } })
              }
              disabled={isPending}
              aria-label={label}
            />
          </div>
        ))}
        {meta.permissions.canAdjustPrescribedQuantity ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-5 text-strong">Tope de ajuste (±%)</p>
              <p className="text-xs leading-5 text-muted">Vacío = sin tope.</p>
            </div>
            <OptionalClampedIntInput
              value={meta.permissions.quantityAdjustmentPercent}
              onValueChange={(n) =>
                dispatch({ type: 'SET_PERMISSION', patch: { quantityAdjustmentPercent: n } })
              }
              min={0}
              max={100}
              disabled={isPending}
              aria-label="Tope de ajuste en porcentaje"
              className="w-24 text-right"
            />
          </div>
        ) : null}
      </div>

      <p className="mt-4 flex items-start gap-1.5 text-xs leading-5 text-muted">
        <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {isTemplate
          ? QE_COPY.templateFooterInfo
          : isCreation
            ? 'Al publicar, el plan rige desde la fecha elegida (hoy por defecto).'
            : futureDateLabel
              ? `La versión vigente aplica desde el ${futureDateLabel}; al publicar, los cambios rigen desde hoy.`
              : 'Al publicar, los cambios rigen desde hoy.'}
      </p>
    </section>
  )
}
