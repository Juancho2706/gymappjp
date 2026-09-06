'use client'

import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Aviso de plausibilidad del editor (tren «Cantidades honestas», SPEC §4.3, mockup M1).
 *
 * Presentacional a propósito: recibe el copy ya resuelto por `plausibility.ts` («¿Seguro? 30 un = 3 kg
 * de huevo revuelto (1 un = 100 g)») y las acciones «keep the number» («Cambiar a 30 g» / «Usar huevos»).
 * Avisa, no bloquea: no tiene estado ni conoce el reductor. Misma piel ámbar que el aviso de reemplazos
 * fallidos de `PublishBar.tsx` (`border-amber-300 bg-amber-50 … dark:bg-amber-950/40`) para que el coach
 * lea «ojo, revisá» con el mismo color en toda la barra; la fila del reemplazo absurdo usa la variante
 * `inline` (solo texto, sin caja), igual que `equivalence.warning` en `EditableItemRow.tsx`.
 */
export interface ImplausibleNoticeAction {
  label: string
  onClick: () => void
  disabled?: boolean
}

export function ImplausibleNotice({
  message,
  actions = [],
  variant = 'box',
  className,
  testId,
}: {
  message: string
  actions?: ImplausibleNoticeAction[]
  /** `box` = caja ámbar (fila del ítem, barra de publicar); `inline` = solo texto (espacios chicos). */
  variant?: 'box' | 'inline'
  className?: string
  testId?: string
}) {
  const isBox = variant === 'box'
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={testId}
      className={cn(
        'flex items-start gap-2 text-xs leading-5',
        isBox
          ? 'rounded-control border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
          : 'font-medium text-amber-700 dark:text-amber-300',
        className,
      )}
    >
      <AlertTriangle aria-hidden="true" className={cn('shrink-0', isBox ? 'mt-0.5 h-3.5 w-3.5' : 'mt-1 h-3 w-3')} />
      <div className="min-w-0 flex-1">
        <p className="min-w-0">{message}</p>
        {actions.length > 0 ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1">
            {actions.map((action, index) => (
              <span key={action.label} className="inline-flex items-center gap-x-1">
                {index > 0 ? <span aria-hidden="true">·</span> : null}
                <button
                  type="button"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className="inline-flex min-h-8 items-center rounded-control px-0.5 font-semibold underline underline-offset-2 transition-colors hover:text-amber-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:hover:text-amber-100"
                >
                  {action.label}
                </button>
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </div>
  )
}
