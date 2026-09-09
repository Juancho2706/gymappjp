import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import {
  formatMacroEsCl,
  qeTargetsEqual,
  targetStep,
  type QeTargetsScope,
  type QeTargetsText,
  type QeVariant,
} from '@eva/nutrition-v2'
import { NutritionCard } from '../NutritionCard'
import { QuantityStepper } from './QuantityStepper'
import { Switch } from '../../Switch'
import { toast } from '../../Toast'
import { EDITOR_COPY, QUICK_EDIT_COPY } from './microcopy'

const TARGET_ROWS: Array<{ field: keyof QeTargetsText; label: string }> = [
  { field: 'calories', label: 'Energía (kcal)' },
  { field: 'proteinG', label: 'Proteína (g)' },
  { field: 'carbsG', label: 'Carbos (g)' },
  { field: 'fatsG', label: 'Grasas (g)' },
]

/**
 * Switch «Solo el {día}» (W4.3, mockup M4). Lo pide el HOST: la card no sabe qué día está
 * activo ni cuántos días tiene el plan, así que no puede decidir sola si el switch corresponde.
 *
 * El default NO es una preferencia guardada, es el ESTADO: `initialOn = !qeTargetsEqual(día,
 * base)`. Un día que hereda del base nace APAGADO (⇒ `scope: 'all'`: lo que el coach escriba
 * vale para toda la semana, que es lo que el caso Pame necesitaba) y un día que ya tenía metas
 * propias distintas nace ENCENDIDO (⇒ `scope: 'day'`, para no pisarle su decisión).
 */
export interface TargetsOnlyThisDayProps {
  /** `false` ⇒ la fila no se pinta: día base (escribir la base es escribir todos) o plan de 1 día. */
  visible: boolean
  /** Día activo EN MINÚSCULA («martes»): entra dentro de la frase «Solo el {día}». */
  dayLabel: string
  /** Estado inicial del switch, derivado del estado con `qeTargetsEqual` (ver arriba). */
  initialOn: boolean
  /**
   * Metas del día BASE. Son dos cosas a la vez: la kcal de la ayuda con el switch encendido y
   * los valores que se copian sobre el día al APAGARLO. `null` = el plan no tiene día base.
   */
  baseTargets: QeTargetsText | null
  /**
   * El coach cambió el alcance. La card no habla con PostHog (es presentacional): el evento
   * `nutrition_targets_scope` lo emite el host, que ya tiene el resto del contexto.
   */
  onScopeChange?: (scope: QeTargetsScope) => void
}

/**
 * Card de metas de la variante (qe-design §1.2.B.3): los 4 campos tap-to-edit con los
 * mismos steppers de cantidades. En plan flexible sin franjas ESTA card es el
 * quick-edit completo. T3.3a: variante y llaves de error de la gramatica compartida
 * (`target.<variantKey>.<field>`, la misma tabla que el editor web).
 *
 * W4 «Metas por día»: con `onlyThisDay` presente la card gana la fila del switch y pasa el
 * `scope` en cada escritura. SIN esa prop —el host del lienzo del quick-edit clásico, que se
 * pinta solo con `editorMode === false`— el tercer argumento viaja `undefined` y el reducer se
 * comporta EXACTAMENTE como antes: ese host no cambia de comportamiento ni de diff.
 */
export function TargetsEditorCard({
  variant,
  showVariantLabel,
  errors,
  disabled = false,
  onlyThisDay = null,
  onTargetChange,
}: {
  variant: QeVariant
  showVariantLabel: boolean
  errors: Record<string, string>
  disabled?: boolean
  onlyThisDay?: TargetsOnlyThisDayProps | null
  onTargetChange: (field: keyof QeTargetsText, value: string, scope?: QeTargetsScope) => void
}) {
  const [onlyThisDayOn, setOnlyThisDayOn] = useState(onlyThisDay?.initialOn ?? false)
  const switchVisible = onlyThisDay?.visible === true
  /**
   * Alcance de cada escritura. Sin la prop ⇒ `undefined` (comportamiento histórico). Con la fila
   * oculta ⇒ `'all'`: el día base y el plan de un solo día escriben para toda la semana, que es
   * justamente por lo que ahí no hace falta preguntar nada.
   */
  const scope: QeTargetsScope | undefined = onlyThisDay
    ? switchVisible && onlyThisDayOn
      ? 'day'
      : 'all'
    : undefined

  const baseKcal = Number((onlyThisDay?.baseTargets?.calories ?? '').trim())
  /**
   * Ayuda bajo el switch. Encendido SIN kcal en el base no imprime nada: el copy aprobado
   * («los demás días siguen con {kcal} kcal») no tiene forma honesta de completarse cuando el
   * base no tiene meta, y ese caso ya lo nombra el aviso ámbar de la barra de publicar.
   */
  const dayLabel = onlyThisDay?.dayLabel ?? ''
  const helpText = !switchVisible
    ? null
    : onlyThisDayOn
      ? Number.isFinite(baseKcal) && baseKcal > 0
        ? EDITOR_COPY.targets.onlyThisDayOn(dayLabel, formatMacroEsCl(baseKcal))
        : null
      : EDITOR_COPY.targets.onlyThisDayOff

  function handleToggle(next: boolean) {
    if (!onlyThisDay) return
    setOnlyThisDayOn(next)
    onlyThisDay.onScopeChange?.(next ? 'day' : 'all')
    if (next) return
    // Apagarlo estando encendido no es solo cambiar el alcance de la PRÓXIMA escritura: el día
    // vuelve a las metas de todos los días, así que se le copian las del base ahora mismo. Va
    // con `scope: 'day'` a propósito — escribe SOLO este día, no toca al resto de la semana.
    const base = onlyThisDay.baseTargets
    if (!base) return
    const previous = { ...variant.targets }
    // La comparación la hace el PAQUETE, no un `!==` crudo: `qeTargetsEqual` normaliza (' 2040 '
    // y '2040' son la MISMA meta), así que un día que ya está igual al base no dispara ni el
    // dispatch ni un toast «Deshacer» que no cambia nada visible. Duplicar acá esa regla de
    // normalización sería una segunda verdad sobre cuándo dos metas son iguales.
    if (qeTargetsEqual({ ...variant, targets: base }, variant)) return
    const changed = TARGET_ROWS.filter(({ field }) => base[field] !== previous[field])
    if (changed.length === 0) return
    for (const { field } of changed) onTargetChange(field, base[field], 'day')
    // MISMO texto que la web imprime en este gesto (`EDITOR_COPY.targets.onlyThisDayOff`): el
    // copy del switch sale del paquete y ninguna superficie inventa el suyo (no negociable 8).
    toast.info(EDITOR_COPY.targets.onlyThisDayOff, {
      action: {
        label: QUICK_EDIT_COPY.undo,
        onPress: () => {
          setOnlyThisDayOn(true)
          // El host TAMBIÉN tiene que volver a `'day'`: el título de la hoja sigue al alcance
          // (W4.6) y sin este aviso quedaba un switch ENCENDIDO bajo un título que anuncia
          // «todos los días» mientras se escribe con `scope: 'day'` — la mentira que W4 repara.
          onlyThisDay.onScopeChange?.('day')
          for (const { field } of changed) onTargetChange(field, previous[field], 'day')
        },
      },
    })
  }

  return (
    <NutritionCard>
      <Text className="font-display text-base font-semibold text-strong">
        {QUICK_EDIT_COPY.targetsTitle}
        {showVariantLabel ? ` · ${variant.label}` : ''}
      </Text>
      <View className="mt-3 gap-3">
        {TARGET_ROWS.map(({ field, label }) => {
          const error = errors['target.' + variant.key + '.' + field]
          return (
            <View key={field}>
              <View className="flex-row items-center justify-between gap-3">
                <Text className="min-w-0 flex-1 text-sm font-semibold text-strong">{label}</Text>
                <QuantityStepper
                  value={variant.targets[field]}
                  onChange={(value) => onTargetChange(field, value, scope)}
                  step={targetStep(field)}
                  accessibilityLabel={label}
                  disabled={disabled}
                />
              </View>
              {error ? <Text className="mt-1 text-xs font-medium text-danger-600">{error}</Text> : null}
            </View>
          )
        })}
      </View>
      {switchVisible && onlyThisDay ? (
        <View className="mt-3 border-t border-subtle pt-1">
          {/* Toda la fila es el control: el rótulo es el nombre accesible del switch (el `Switch`
              del DS no toma etiqueta), y el track queda oculto al lector de pantalla para no
              anunciar dos veces lo mismo — mismo patrón que el punto ámbar de `DayAnchorRow`. */}
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel={EDITOR_COPY.targets.onlyThisDay(onlyThisDay.dayLabel)}
            accessibilityState={{ checked: onlyThisDayOn, disabled }}
            disabled={disabled}
            onPress={() => handleToggle(!onlyThisDayOn)}
            className="min-h-11 flex-row items-center justify-between gap-3"
          >
            <Text className="min-w-0 flex-1 text-sm font-semibold text-strong">
              {EDITOR_COPY.targets.onlyThisDay(onlyThisDay.dayLabel)}
            </Text>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Switch value={onlyThisDayOn} onValueChange={handleToggle} disabled={disabled} />
            </View>
          </Pressable>
          {helpText ? <Text className="mt-0.5 text-xs leading-5 text-muted">{helpText}</Text> : null}
        </View>
      ) : null}
    </NutritionCard>
  )
}
