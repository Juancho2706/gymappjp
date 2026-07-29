import { Text, View, type TextStyle } from 'react-native'
import { exchangeGroupColor, formatPortions } from '@eva/nutrition-engine'
import type { NutritionSlotExchangeTargetRead } from '@eva/nutrition-v2'
import { PORTIONS_COPY } from '../../lib/nutrition-portions-copy'
import { GroupDot } from '../alumno/nutrition-v2/PortionChip'

/**
 * Chips read-only de las porciones PRESCRITAS de una franja (`slot.exchangeTargets` del read
 * model del plan). Gemelo nativo de `apps/web/src/components/nutrition-v2/PrescribedPortionChips.tsx`
 * — MISMO nombre, MISMO contrato (`{ targets, className }`) y mismo copy, para que la paridad no
 * dependa de quién lo escribió primero.
 *
 * Por qué existe (auditoría P0-3): las vistas de "estructura del plan" — ficha del coach y pestaña
 * Plan del alumno — solo pintaban `prescriptionItems`, así que una franja armada SOLO con porciones
 * se leía como "Sin alimentos prescritos en esta franja". El empty-state pasa a exigir que no haya
 * NI items NI targets.
 *
 * Mismo lenguaje visual que la capa de porciones ya existente en RN (`PortionDayCoverageCard`,
 * `PortionChip`): pastilla con el circulito de identidad del grupo (ÚNICO lugar donde entra el color
 * del catálogo, letra blanca) + nombre + cantidad. Acá NO hay cobertura `n/N`: el plan es la
 * prescripción, no el consumo del día.
 *
 * Solo presentación (tokens del DS, cero estado, cero fetch). Sin targets ⇒ no renderiza nada, así
 * que un plan sin porciones queda idéntico a como estaba (SPEC Q1).
 */
export type PrescribedPortionChipsProps = {
  /** `slot.exchangeTargets` tal cual viene del read model; `undefined` ⇒ franja sin porciones. */
  targets: ReadonlyArray<NutritionSlotExchangeTargetRead> | undefined
  /** Margen que le dé la superficie (el componente no se posiciona solo). */
  className?: string
}

/** `fontVariant` no tiene utilidad NativeWind: va por `style` ESTÁTICO de módulo (nunca función). */
const TABULAR_NUMS: TextStyle = { fontVariant: ['tabular-nums'] }

/** Coma decimal es-CL ("1,5") sobre el `formatPortions` del engine, igual que la web. */
function formatPortionsEs(portions: number): string {
  return formatPortions(portions).replace('.', ',')
}

/** "1 porción" / "2 porciones" / "0,5 porciones" (misma regla que la web). */
function portionsCountLabel(portions: number): string {
  return `${formatPortionsEs(portions)} ${portions === 1 ? 'porción' : 'porciones'}`
}

export function PrescribedPortionChips({ targets, className }: PrescribedPortionChipsProps) {
  const rows = [...(targets ?? [])].sort((a, b) => a.orderIndex - b.orderIndex)
  if (rows.length === 0) return null

  return (
    <View className={className}>
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
        {PORTIONS_COPY.builder.sectionTitle}
      </Text>
      <View className="mt-1 flex-row flex-wrap gap-1.5">
        {rows.map((target) => {
          const label = portionsCountLabel(target.portions)
          return (
            <View
              key={target.id}
              accessibilityLabel={`${target.groupName}: ${label}`}
              className="max-w-full flex-row items-center gap-1.5 rounded-pill border border-subtle bg-surface-sunken px-2 py-1"
            >
              <GroupDot
                code={target.groupCode}
                color={exchangeGroupColor({ color: target.color, sortOrder: target.orderIndex })}
                size={20}
              />
              <Text className="min-w-0 shrink text-xs font-medium text-strong" numberOfLines={1}>
                {target.groupName}
              </Text>
              <Text className="shrink-0 text-xs font-semibold text-muted" style={TABULAR_NUMS}>
                {label}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}
