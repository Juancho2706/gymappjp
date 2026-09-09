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
 * Una escritura de meta: el campo y el texto que le va. SIN alcance a propósito — a QUÉ días se
 * escribe lo resuelve el host una sola vez para los cuatro campos (ver `QeSwitchOffApplied`).
 */
export interface QeTargetWrite {
  field: keyof QeTargetsText
  value: string
}

/** Los dos modos que ESCRIBEN al apagar el switch; `noop` es «no había nada que mover». */
export type QeSwitchOffMode = 'backToBase' | 'appliedToAll'

/**
 * Qué pasa al APAGAR el switch «Solo el {día}» (decisión del jefe D2) — MISMOS tres modos y
 * MISMA tabla que la web (`apps/web/.../_quick-edit/TargetsEditorCard.tsx`), que es la forma de
 * cumplir el «idéntico en RN y web» sin un módulo compartido (solo comparten el paquete).
 * Apagar el switch NUNCA borra una meta: eso era el bug del checkpoint, que copiaba encima del
 * día los strings vacíos del base y el plan de Pame perdía sus 2.040 kcal de un toque.
 *
 *  - `backToBase` — el base SÍ tiene meta (SPEC §7.5): el día vuelve a la meta de todos los días,
 *    o sea se le copian las cuatro cifras del base encima, y solo a él.
 *  - `appliedToAll` — el base está VACÍO (el plan de Pame: base vacío, martes 2.040): en vez de
 *    dejar al día sin objetivo, su meta se PROPAGA al base y a los días que heredaban.
 *  - `noop` — el día ya muestra la meta del base, o el plan entero está sin metas: el switch se
 *    apaga y ya, sin un toast que anuncie un cambio que no ocurrió.
 */
export interface QeSwitchOffPlan {
  mode: QeSwitchOffMode | 'noop'
  writes: readonly QeTargetWrite[]
}

/** Lo que devuelve el host DESPUÉS de aplicar el plan: qué pasó (para el toast) y cómo se deshace. */
export interface QeSwitchOffApplied {
  mode: QeSwitchOffMode
  /** Devuelve CADA día a la foto previa. La arma el host, que es el único que ve todos los días. */
  undo: () => void
}

/**
 * Plan puro de apagar el switch: el criterio, sin estado ni React (un test lo puede fijar sin
 * montar nada). Devuelve solo QUÉ se escribe; el conjunto de días es cosa del host.
 *
 * Por qué el plan ya no lleva `scope: 'all'`, que es como lo hacía el checkpoint: el reducer
 * recalcula «quiénes heredaban» en CADA dispatch, contra el base de ESE momento. Con los cuatro
 * campos por separado, la 2.ª escritura alcanza al día que la 1.ª acaba de dejar igual al base y
 * le pisa su meta propia — justo lo que SPEC §7.5 manda no tocar.
 */
export function planSwitchOff(base: QeVariant | null, day: QeVariant): QeSwitchOffPlan {
  if (base == null) return { mode: 'noop', writes: [] }
  // La llave es SIEMPRE kcal, igual que `hasTargetCalories` del reducer y que la web: sin
  // energía no hay objetivo que mostrarle a nadie, por más proteína que tenga cargada el día.
  if (base.targets.calories.trim() !== '') {
    // La igualdad la decide el PAQUETE, no un `!==` crudo: `qeTargetsEqual` normaliza (' 2040 ' y
    // '2040' son la MISMA meta), así que un día que ya muestra la del base no dispara ni
    // escrituras ni un «Deshacer» que no cambia nada visible.
    if (qeTargetsEqual(day, base)) return { mode: 'noop', writes: [] }
    return {
      mode: 'backToBase',
      writes: TARGET_ROWS.map(({ field }) => ({ field, value: base.targets[field] })),
    }
  }
  if (day.targets.calories.trim() === '') return { mode: 'noop', writes: [] }
  // Los campos VACÍOS del día quedan fuera, igual que en web: viajan al base y a los días que
  // heredaban, y un base que tenía la proteína cargada la perdería (D2: nunca se borra). Como
  // arriba ya cortamos con la kcal vacía, siempre queda al menos una escritura.
  return {
    mode: 'appliedToAll',
    writes: TARGET_ROWS.filter(({ field }) => day.targets[field].trim() !== '').map(({ field }) => ({
      field,
      value: day.targets[field],
    })),
  }
}

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
   * Metas del día BASE, para la kcal de la ayuda con el switch encendido. `null` = el plan no
   * tiene día base. Lo que pasa al APAGAR el switch ya no se decide con esto: lo resuelve
   * `onSwitchOff` en el host, que además ve al resto de los días.
   */
  baseTargets: QeTargetsText | null
  /**
   * El coach APAGÓ el switch estando encendido: el host mueve las metas AHORA (decisión del jefe
   * D2 — si no, el día se quedaría con su meta vieja hasta el próximo tecleo y el switch estaría
   * mintiendo) y devuelve qué pasó, para el toast, más su «Deshacer». `null` = no había nada que
   * mover y no se anuncia nada.
   */
  onSwitchOff?: () => QeSwitchOffApplied | null
  /**
   * El coach cambió el alcance (mover el switch, o el «Deshacer» que lo devuelve a su lugar). La
   * card no habla con PostHog —es presentacional—: el host emite `nutrition_targets_scope` con
   * `from: 'switch'`. Ya NO alimenta ningún título: el de la hoja es fijo (decisión del jefe D1)
   * y quien cuenta el alcance en pantalla es la ayuda de abajo del switch.
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
    // Apagarlo estando encendido no es solo cambiar el alcance de la PRÓXIMA escritura: hay que
    // resolver la meta que el día ya tiene. Decisión del jefe D2: NUNCA se borra — o el día
    // vuelve a la del base, o la suya pasa a valer para toda la semana. QUÉ se mueve, A QUIÉNES y
    // cómo se deshace lo resuelve el host (`onSwitchOff`), que es el único que ve todos los días;
    // acá solo se cuenta lo que pasó.
    const applied = onlyThisDay.onSwitchOff?.() ?? null
    if (!applied) return
    toast.info(
      applied.mode === 'backToBase'
        ? EDITOR_COPY.targets.backToBase(onlyThisDay.dayLabel)
        : EDITOR_COPY.targets.appliedToAll,
      {
        // Los 4 s de siempre no alcanzan para leer el aviso y decidir deshacer: mismos 6 s que
        // el toast gemelo de la web.
        duration: 6000,
        action: {
          label: EDITOR_COPY.targets.undo,
          onPress: () => {
            applied.undo()
            setOnlyThisDayOn(true)
            // El evento sigue la POSICIÓN del switch (D5): si el deshacer no reportara, el
            // embudo mostraría un 'all' que el coach canceló y ningún 'day' de vuelta.
            onlyThisDay.onScopeChange?.('day')
          },
        },
      },
    )
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
