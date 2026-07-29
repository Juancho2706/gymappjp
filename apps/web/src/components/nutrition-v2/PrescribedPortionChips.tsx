import { exchangeGroupColor, formatPortions } from '@eva/nutrition-engine'
import type { NutritionSlotExchangeTargetRead } from '@eva/nutrition-v2'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import { cn } from '@/lib/utils'

/**
 * Chips read-only de las porciones PRESCRITAS de una franja (`slot.exchangeTargets`
 * del read model del plan). Las vistas de "estructura del plan" — ficha del coach y
 * pestaña Plan del alumno — solo pintaban `prescriptionItems`, así que un plan armado
 * con porciones se veía como "sin alimentos prescritos" (auditoría P0-3).
 *
 * Mismo lenguaje visual que la capa de porciones ya existente (`PortionDayCoverageCard`,
 * `PortionCoverageRow`, `EditablePortionsCard`): pastilla con el circulito de identidad
 * del grupo (ÚNICO lugar donde va el color del catálogo, letra blanca) + nombre del
 * grupo + cantidad. Aquí NO hay cobertura (`n/N`): el plan es la prescripción, no el
 * consumo del día.
 *
 * Solo presentación (tokens del DS, cero estado). Sin targets ⇒ no renderiza nada, así
 * que un plan sin porciones queda idéntico (SPEC Q1).
 */
export function PrescribedPortionChips({
  targets,
  className,
}: {
  targets: ReadonlyArray<NutritionSlotExchangeTargetRead> | undefined
  className?: string
}) {
  const rows = [...(targets ?? [])].sort((a, b) => a.orderIndex - b.orderIndex)
  if (rows.length === 0) return null

  return (
    <div className={cn(className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
        {PORTIONS_COPY.builder.sectionTitle}
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {rows.map((target) => {
          const label = portionsCountLabel(target.portions)
          return (
            <span
              key={target.id}
              aria-label={`${target.groupName}: ${label}`}
              className="inline-flex max-w-full items-center gap-1.5 rounded-pill border border-border-subtle bg-surface-sunken px-2 py-1"
              title={target.groupName}
            >
              <span
                aria-hidden="true"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-black text-white"
                style={{
                  backgroundColor: exchangeGroupColor({
                    color: target.color,
                    sortOrder: target.orderIndex,
                  }),
                }}
              >
                {target.groupCode}
              </span>
              <span className="min-w-0 truncate text-xs font-medium text-strong">{target.groupName}</span>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">{label}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** Coma decimal es-CL ("1,5") sobre el `formatPortions` del engine, igual que la fila "Porciones". */
function formatPortionsEs(portions: number): string {
  return formatPortions(portions).replace('.', ',')
}

/** "1 porción" / "2 porciones" / "0,5 porciones" (misma regla que `portionsCountLabelEs`). */
function portionsCountLabel(portions: number): string {
  return `${formatPortionsEs(portions)} ${portions === 1 ? 'porción' : 'porciones'}`
}
