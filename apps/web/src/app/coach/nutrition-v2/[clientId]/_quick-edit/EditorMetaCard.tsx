'use client'

/**
 * Cabecera del EDITOR UNICO (T3.x W1): metadatos del plan editables sobre el mismo arbol del
 * quick-edit (`state.meta`). Solo se pinta cuando la superficie hidrato meta (la ruta
 * `/editor`); en el quick-edit clasico `state.meta` no existe y esta card no aparece.
 *
 * W1 edita nombre y los dos permisos que la ficha ya muestra (registro libre / ajustar
 * cantidades; `canSubstitute` sigue oculto por la decision D4 de T2.5 — permiso muerto). La
 * ESTRATEGIA queda read-only: cambiarla reconfigura la gramatica del plan entero (franjas vs
 * targets-only) y su semantica de corte se define en W2. `quantityAdjustmentPercent` y el
 * resto de permisos finos tambien son W2.
 */

import { ClipboardList, Info } from 'lucide-react'
import { StrategyBadge } from '@/components/nutrition-v2'
import { Switch } from '@/components/ui/switch'
import { useQuickEdit } from './QuickEditProvider'
import { PLAN_NAME_MAX } from './quick-edit-state'

export function EditorMetaCard() {
  const { state, dispatch, errors, showErrors, isPending, futureDateLabel } = useQuickEdit()
  const meta = state.meta
  if (!meta) return null

  const nameError = showErrors ? errors['meta.name'] : undefined

  return (
    <section className="rounded-card border border-border-subtle bg-surface-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList aria-hidden="true" className="h-4 w-4 text-muted" />
          <h2 className="font-display text-base font-semibold text-strong">Plan</h2>
        </div>
        <StrategyBadge strategy={meta.strategy} compact />
      </div>

      <label htmlFor="editor-plan-name" className="mt-3 block text-xs font-semibold text-muted">
        Nombre del plan
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
        placeholder="Ej: Plan definicion 2026"
      />
      {nameError ? (
        <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-300">
          {nameError}
        </p>
      ) : null}

      {/* Permisos del alumno (los dos que la ficha muestra; el resto llega en W2). */}
      <div className="mt-4 space-y-3">
        {(
          [
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
          ]
        ).map(({ key, label, hint }) => (
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
      </div>

      <p className="mt-4 flex items-start gap-1.5 text-xs leading-5 text-muted">
        <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {futureDateLabel
          ? `La versión vigente aplica desde el ${futureDateLabel}; al publicar, los cambios rigen desde hoy.`
          : 'Al publicar, los cambios rigen desde hoy. La estrategia del plan se cambia rehaciéndolo con el asistente.'}
      </p>
    </section>
  )
}
