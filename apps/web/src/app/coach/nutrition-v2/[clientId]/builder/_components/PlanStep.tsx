'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Check } from 'lucide-react'
import { NUTRITION_STRATEGIES, type NutritionStrategy } from '@eva/nutrition-v2'
import {
  slotsLostIfFlexible,
  strategyUsesSlots,
  type BuilderPermissions,
  type BuilderState,
} from '../_lib/draft-builder'
import { genId, type Dispatch } from '../_lib/builder-view-model'
import { inputClass, labelClass } from '../_lib/builder-ui-classes'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useIsTemplateMode } from './TemplateModeContext'

// Ruta canonica de upgrade de plan. Se inlinea aca porque el modulo _lib/nutrition-pro.ts
// es server-only (import 'server-only') y no puede importarse en un client component.
// Nutricion Pro viene incluido en los planes pagos — el CTA apunta al cambio de plan.
const NUTRITION_PRO_UPGRADE_HREF = '/coach/subscription'
function ProBadge() {
  return (
    <span className="shrink-0 rounded-pill border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary dark:border-primary/40 dark:bg-primary/15 dark:text-primary">
      Pro
    </span>
  )
}

/**
 * Paso 1 — "El plan" (SPEC nutrition-ui-poda, punto 11). Fusiona los viejos pasos "Estrategia"
 * y "Objetivos" y se queda con el UNICO control editable del viejo paso "Revisar"
 * (`Vigente desde`, que en RN ya vivia aca). Todo lo que define el plan antes de tocar los dias
 * cabe en una pantalla.
 *
 * Estrategia: DOS opciones reales — "Plan estructurado" (franjas prescritas) y "Objetivos
 * flexibles" (solo metas). La HIBRIDA se retiro del selector: no aportaba ninguna capacidad que
 * `structured` + el checkbox de registro libre no diera, y funcionaba como gate comercial con
 * etiqueta de producto. El valor sigue vivo en el contrato y en los planes publicados: un plan
 * hibrido rehidratado NO se degrada (se muestra sobre la tarjeta "estructurado", se dice en
 * texto y se republica tal cual). El candado Pro se movio al checkbox "Registro libre" de los
 * planes con franjas — que es la capacidad que la hibrida vendia.
 */
export function PlanStep({
  state,
  dispatch,
  errors,
  nutritionProEnabled,
}: {
  state: BuilderState
  dispatch: Dispatch
  errors: Record<string, string>
  nutritionProEnabled: boolean
}) {
  // Modo plantilla: "Vigente desde" no existe — el contrato de plantilla omite `effectiveFrom`
  // (la fecha la elige el coach al aplicarla). Mostrar un campo cuyo valor se descarta al
  // guardar es peor que no mostrarlo.
  const templateMode = useIsTemplateMode()
  const options: NutritionStrategy[] = ['structured', 'flexible']
  // Confirmacion antes de perder franjas (bug 2.3.5 de la auditoria): elegir "flexible" con
  // contenido en cualquier dia BORRABA todas las franjas sin aviso ni deshacer. El reducer sigue
  // ejecutando el borrado tal cual (es puro, no pregunta); esta UI decide si hace falta preguntar.
  const [confirmFlexible, setConfirmFlexible] = useState(false)
  const slotsAtRisk = slotsLostIfFlexible(state)
  // Un plan hibrido (rehidratado / convertido de V1) se lee sobre la tarjeta estructurada: las
  // dos usan franjas y el contrato no cambia hasta que el coach elija otra cosa.
  const activeStrategyKey: NutritionStrategy | null = state.strategy === 'hybrid' ? 'structured' : state.strategy
  const usesSlots = strategyUsesSlots(state.strategy)
  // Gate Pro del registro libre: solo sobre planes CON franjas (en un plan flexible el alumno
  // registra libre por definicion) y solo para ENCENDERLO — un plan que ya lo trae encendido
  // (hibrido rehidratado) se puede apagar sin pagar nada. El servidor no gatea esta combinacion:
  // es un limite comercial de UI, no una barrera de seguridad.
  const freeRegistrationLocked = usesSlots && !nutritionProEnabled && !state.permissions.canRegisterFreely

  const macroFields: Array<{ field: 'calories' | 'proteinG' | 'carbsG' | 'fatsG'; label: string }> = [
    { field: 'calories', label: 'Calorias (kcal)' },
    { field: 'proteinG', label: 'Proteina (g)' },
    { field: 'carbsG', label: 'Carbohidratos (g)' },
    { field: 'fatsG', label: 'Grasas (g)' },
  ]

  const permissionFields: Array<{
    field: keyof BuilderPermissions
    label: string
    hint: string
    locked: boolean
  }> = [
    {
      field: 'canRegisterFreely',
      label: 'Registro libre',
      hint: 'Puede anotar alimentos fuera de lo prescrito.',
      locked: freeRegistrationLocked,
    },
    {
      field: 'canAdjustPrescribedQuantity',
      label: 'Ajustar cantidades',
      hint: 'Puede cambiar la cantidad de un alimento prescrito.',
      locked: false,
    },
  ]

  function pickStrategy(key: NutritionStrategy) {
    dispatch({ type: 'SET_STRATEGY', strategy: key, firstSlotKey: genId() })
  }

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <label className={labelClass} htmlFor="plan-name">Nombre del plan</label>
        <input
          id="plan-name"
          className={inputClass}
          placeholder="Plan de definicion"
          value={state.planName}
          onChange={(e) => dispatch({ type: 'SET_PLAN_NAME', value: e.target.value })}
        />
        {errors.planName ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{errors.planName}</p> : null}
      </div>

      <fieldset>
        <legend className={labelClass}>Como sigue el plan tu alumno</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map((key) => {
            const meta = NUTRITION_STRATEGIES[key]
            const active = activeStrategyKey === key
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                title={meta.description}
                onClick={() => {
                  // Re-tocar la MISMA tarjeta no hace nada (el reducer tambien lo corta): elegir
                  // estrategia dejo de ser un gesto de navegacion repetible.
                  if (active) return
                  if (key === 'flexible' && slotsAtRisk > 0) {
                    setConfirmFlexible(true)
                    return
                  }
                  pickStrategy(key)
                }}
                className={
                  'flex h-full flex-col rounded-card border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                  (active
                    ? 'border-primary bg-primary/10 dark:bg-primary/10'
                    : 'border-border-default bg-surface-card hover:border-primary/40')
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-base font-semibold text-strong">{meta.label}</span>
                  {active ? <Check className="h-5 w-5 shrink-0 text-primary dark:text-primary" /> : null}
                </div>
                <p className="mt-1 text-sm text-muted">{meta.description}</p>
              </button>
            )
          })}
        </div>
        {errors.strategy ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{errors.strategy}</p> : null}
        {state.strategy === 'hybrid' ? (
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Este plan se publico como <span className="font-semibold text-strong">hibrido</span> (franjas prescritas +
            registro libre). Se mantiene asi salvo que elijas otra estrategia.
          </p>
        ) : null}
      </fieldset>

      <div className="grid gap-5 lg:grid-cols-2">
        <fieldset className="space-y-3">
          <legend className={labelClass}>Metas diarias</legend>
          <div className="grid grid-cols-2 gap-3">
            {macroFields.map(({ field, label }) => (
              <div key={field}>
                <label className={labelClass} htmlFor={`target-${field}`}>{label}</label>
                <input
                  id={`target-${field}`}
                  className={inputClass}
                  inputMode="decimal"
                  value={state.targets[field]}
                  onChange={(e) => dispatch({ type: 'SET_TARGET', field, value: e.target.value })}
                />
                {errors[field] ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{errors[field]}</p> : null}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">
            Son las metas del dia base. Cualquier dia puede llevar objetivos propios desde el paso siguiente.
          </p>
        </fieldset>

        <fieldset className="rounded-card border border-border-subtle p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Permisos del alumno</legend>
          <p className="px-1 pb-2 text-xs text-muted">Qué puede hacer el alumno con este plan, más allá de seguirlo.</p>
          {permissionFields.map(({ field, label, hint, locked }) => (
            // El upsell va FUERA del <label> a propósito: un <a> dentro de una etiqueta de
            // formulario secuestra el clic del checkbox.
            <div key={field}>
              <label
                className={
                  'flex min-h-11 items-start gap-2 py-1 text-sm text-body ' + (locked ? 'cursor-not-allowed' : '')
                }
              >
                <input
                  type="checkbox"
                  disabled={locked}
                  className="mt-0.5 h-4 w-4 accent-[var(--theme-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  checked={state.permissions[field]}
                  onChange={(e) => dispatch({ type: 'SET_PERMISSION', field, value: e.target.checked })}
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-medium text-strong">
                    {label}
                    {locked ? <ProBadge /> : null}
                  </span>
                  <span className="block text-xs text-muted">{hint}</span>
                </span>
              </label>
              {locked ? (
                <p className="flex items-start gap-1.5 pb-1 pl-6 text-xs leading-relaxed text-muted">
                  {/* Ícono del módulo Nutrición Pro (asset del CEO, estático @2x). */}
                  <Image
                    src="/module-icons/nutrition-pro@2x.webp"
                    alt=""
                    aria-hidden="true"
                    width={20}
                    height={20}
                    unoptimized
                    className="mt-0.5 h-5 w-5 shrink-0 object-contain"
                  />
                  <span>
                    Combinar comidas prescritas con registro libre es parte de Nutricion Pro, incluido en los planes
                    pagos.{' '}
                    <Link
                      href={NUTRITION_PRO_UPGRADE_HREF}
                      className="font-semibold text-primary underline underline-offset-2 dark:text-primary"
                    >
                      Mejorar mi plan
                    </Link>
                  </span>
                </p>
              ) : null}
            </div>
          ))}
        </fieldset>
      </div>

      {/* Vigencia: subio del paso "Revisar" (era su unico control editable) y queda a la vista
          junto al resto de lo que define el plan. Una plantilla no la lleva. */}
      {templateMode ? null : (
        <div className="max-w-xs">
          <label className={labelClass} htmlFor="effective-from">Vigente desde</label>
          <input
            id="effective-from"
            className={inputClass}
            type="date"
            value={state.effectiveFrom}
            onChange={(e) => dispatch({ type: 'SET_EFFECTIVE_FROM', value: e.target.value })}
          />
        </div>
      )}

      <AlertDialog open={confirmFlexible} onOpenChange={setConfirmFlexible}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="normal-case tracking-tight">Cambiar a flexible</AlertDialogTitle>
            <AlertDialogDescription>
              Cambiar a flexible elimina {slotsAtRisk === 1 ? 'la' : 'las'} {slotsAtRisk}{' '}
              {slotsAtRisk === 1 ? 'franja' : 'franjas'} de tus días. ¿Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmFlexible(false)
                pickStrategy('flexible')
              }}
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
