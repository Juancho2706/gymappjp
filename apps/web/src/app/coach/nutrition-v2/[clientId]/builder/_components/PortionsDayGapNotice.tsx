'use client'

import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { baseVariantOf, type BuilderState } from '../_lib/draft-builder'
import { daysMissingBasePortions } from './portions-state'
import type { PortionsController } from './PortionsSection'

/**
 * Aviso "tus porciones se quedaron en el día base" (defecto B4, verificado en LIVE el
 * 2026-08-03: 3 de 3 planes multi-día publicados tenían el 100% de sus porciones en el base
 * y cero en los días, así que ningún alumno las veía).
 *
 * La clave del mapa de porciones es `variantKey::slotKey` — decisión correcta para que dos
 * días con franjas homónimas no compartan porciones — pero deja al coach cargando porciones
 * en el día base y publicando sin que nada le diga que los días asignados no las heredaron.
 * Este aviso es la señal que faltaba, y "Aplicar a todos los días" reusa la misma primitiva
 * de clonación que ya usa "Personalizar día" (`clonePortionsForVariant`).
 *
 * Un día SIN franjas homónimas (`unmatched`) no se puede arreglar copiando: se nombra aparte
 * porque ahí el alumno ve el día entero vacío, no solo sin porciones.
 */
export function PortionsDayGapNotice({ state, portions }: { state: BuilderState; portions: PortionsController }) {
  const base = baseVariantOf(state)
  const gaps = daysMissingBasePortions(portions.bySlot, state.variants)
  if (gaps.length === 0) return null

  const copiables = gaps.filter((gap) => gap.slotKeyPairs.length > 0)
  const sinFranjas = gaps.filter((gap) => gap.unmatched)
  const labelOf = (variantKey: string) =>
    state.variants.find((variant) => variant.key === variantKey)?.label ?? 'ese día'

  return (
    <div
      role="status"
      className="rounded-card border border-amber-300/70 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
            Tus porciones están solo en el día base.
          </p>
          {copiables.length > 0 ? (
            <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300/90">
              {copiables.map((gap) => labelOf(gap.variantKey)).join(', ')} no las mostrará
              {copiables.length > 1 ? 'n' : ''} a tu alumno.
            </p>
          ) : null}
          {sinFranjas.length > 0 ? (
            <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300/90">
              {sinFranjas.map((gap) => labelOf(gap.variantKey)).join(', ')} no tiene
              {sinFranjas.length > 1 ? 'n' : ''} ninguna comida: tu alumno verá ese día vacío. Agrégale comidas o
              elimínalo para que herede el día base.
            </p>
          ) : null}
          {copiables.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                for (const gap of copiables) {
                  portions.cloneVariant({
                    sourceVariantKey: base.key,
                    targetVariantKey: gap.variantKey,
                    slotKeyPairs: gap.slotKeyPairs,
                  })
                }
                toast('Porciones aplicadas a los días del plan.', { duration: 4000 })
              }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-amber-400/70 bg-white/70 px-3 text-xs font-semibold text-amber-900 hover:bg-white dark:border-amber-500/40 dark:bg-transparent dark:text-amber-200"
            >
              Aplicar a todos los días
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
