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
 *
 * PASADA VISUAL (2026-08-16): la card nace COLAPSADA cuando se edita un plan que ya existe. Sus
 * metadatos ya estan decididos y ocupaban el primer pantallazo entero — el coach abria el editor
 * y no veia ni una comida. En CREACION y en PLANTILLA arranca ABIERTA: ahi el nombre, la
 * estrategia y la vigencia son justamente lo primero que hay que definir. El resumen colapsado
 * dice lo que importa de un vistazo (nombre + estrategia + permisos activos) y el toggle es una
 * fila completa de 44px.
 */

import { useState } from 'react'
import { ChevronDown, ClipboardList, Info, LockKeyhole } from 'lucide-react'
import type { NutritionStrategy } from '@eva/nutrition-v2'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Switch } from '@/components/ui/switch'
import { OptionalClampedIntInput } from '@/components/ui/clamped-int-input'
import { useQuickEdit } from './QuickEditProvider'
import { PLAN_NAME_MAX, qeAllowedStrategies } from '@eva/nutrition-v2'
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

/** Resumen del estado colapsado: lo que el coach necesita reconocer sin abrir. */
function metaSummary(
  name: string,
  strategy: NutritionStrategy,
  permissions: { canRegisterFreely: boolean; canAdjustPrescribedQuantity: boolean },
): string {
  const perms = [
    permissions.canRegisterFreely ? 'registro libre' : null,
    permissions.canAdjustPrescribedQuantity ? 'ajusta cantidades' : null,
  ].filter(Boolean)
  return [name.trim() || 'Sin nombre', STRATEGY_LABEL[strategy], ...perms].join(' · ')
}

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
  // Editar un plan que YA existe abre colapsado; crear (plan o plantilla) abre expandido.
  const [open, setOpen] = useState(() => meta?.effectiveFrom !== undefined || surface === 'template')
  if (!meta) return null

  const nameError = showErrors ? errors['meta.name'] : undefined
  const dateError = showErrors ? errors['meta.effectiveFrom'] : undefined
  const allowed = qeAllowedStrategies(state)
  const flexibleBlocked = !allowed.includes('flexible')
  // Modo creacion = la vigencia es elegible (el campo existe en meta). En plantilla la llave
  // no existe (draftToEditState sin `effectiveFrom`), asi que el campo jamas se pinta.
  const isCreation = meta.effectiveFrom !== undefined
  const isTemplate = surface === 'template'
  // Un error de validacion en un campo escondido seria invisible: la card se abre sola.
  const forcedOpen = Boolean(nameError || dateError)
  const expanded = open || forcedOpen

  return (
    /* T3.v (V2.4): colapsada la card es una FILA de una línea — rótulo mono + resumen — y su caja
       se aprieta a 10 px. Abierta conserva su título display y su respiro de 16 px. Solo estilos:
       mismos textos, mismo toggle, mismo `forcedOpen`. */
    <section
      className={
        'rounded-card border border-border-subtle bg-surface-card ' + (expanded ? 'p-4' : 'px-3 py-1.5')
      }
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={expanded}
        className="-m-1 flex min-h-11 w-full items-center gap-2 rounded-control p-1 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ClipboardList aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
        {expanded ? (
          <span className="min-w-0 flex-1 font-display text-base font-semibold text-strong">
            {isTemplate ? 'Plantilla' : 'Plan'}
          </span>
        ) : (
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="shrink-0 font-mono text-[10px] font-semibold uppercase leading-4 tracking-[0.14em] text-muted">
              {isTemplate ? 'Plantilla' : 'Plan'}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs leading-5 text-body">
              {metaSummary(meta.name, meta.strategy, meta.permissions)}
            </span>
          </span>
        )}
        <ChevronDown
          aria-hidden="true"
          className={'h-4 w-4 shrink-0 text-muted transition-transform ' + (expanded ? 'rotate-180' : '')}
        />
      </button>
      {expanded ? (
      <>

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
              placeholder="Sin tope"
              className="w-28 text-right"
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
      </>
      ) : null}
    </section>
  )
}
