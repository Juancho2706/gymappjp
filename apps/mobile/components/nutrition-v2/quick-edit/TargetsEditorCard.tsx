import { useEffect, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import {
  formatMacroEsCl,
  targetStep,
  type QeSwitchOffPlan,
  type QeTargetsScope,
  type QeTargetsText,
  type QeVariant,
} from '@eva/nutrition-v2'
import { NutritionCard } from '../NutritionCard'
import { QuantityStepper } from './QuantityStepper'
import { Switch } from '../../Switch'
import { EDITOR_COPY, QUICK_EDIT_COPY } from './microcopy'

const TARGET_ROWS: Array<{ field: keyof QeTargetsText; label: string }> = [
  { field: 'calories', label: 'Energía (kcal)' },
  { field: 'proteinG', label: 'Proteína (g)' },
  { field: 'carbsG', label: 'Carbos (g)' },
  { field: 'fatsG', label: 'Grasas (g)' },
]

/**
 * Lo que devuelve el host DESPUÉS de aplicar el plan de apagado. TODO el criterio —qué se escribe
 * y a QUÉ días— vive en `qeSwitchOffPlan` del paquete, que es lo que hace cumplible el «idéntico
 * en RN y web»: antes esa tabla estaba copiada en las dos cards. La card solo necesita saber QUÉ
 * pasó, para elegir el texto del aviso, y cómo se deshace. `null` = no había nada que mover, el
 * switch se apaga y ya (sin anunciar un cambio que no ocurrió).
 */
export interface QeSwitchOffApplied {
  mode: QeSwitchOffPlan['mode']
  /** Devuelve a la foto previa SOLO los días tocados (C4). La arma el host con el `snapshot`. */
  undo: () => void
}

/** Cuánto vive el aviso: los 4 s de un toast común no alcanzan para leerlo y decidir deshacer. */
const SWITCH_OFF_NOTICE_MS = 6000

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
   * mintiendo) y devuelve qué pasó, para el aviso de abajo, más su «Deshacer». `null` = no había
   * nada que mover y no se anuncia nada.
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

  /**
   * Aviso de «apagué el switch», INLINE y no un toast (decisión del jefe C3). El `<Toaster />` de
   * la app es un singleton del árbol raíz y esta card vive siempre dentro de un `Sheet
   * nativeModal`: cada `toast.*()` disparado desde acá se pinta DETRÁS de la ventana nativa —
   * invisible, verificado en device (mismo motivo por el que `WorkoutShareComposer` tiene su
   * `ComposerNotice` propio). Y un aviso invisible con «Deshacer» adentro es lo peor de los dos
   * mundos: el coach ve moverse las cifras y no tiene cómo volver atrás. La web sigue con
   * `sonner`, que no tiene este problema.
   */
  const [notice, setNotice] = useState<QeSwitchOffApplied | null>(null)
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearNoticeTimer() {
    if (noticeTimerRef.current !== null) {
      clearTimeout(noticeTimerRef.current)
      noticeTimerRef.current = null
    }
  }

  // Desmontar la card (cerrar la hoja, cambiar de día) con el timer vivo dejaría un `setState`
  // sobre un componente muerto: el timer se limpia una sola vez, al desmontar.
  useEffect(() => clearNoticeTimer, [])

  function handleToggle(next: boolean) {
    if (!onlyThisDay) return
    setOnlyThisDayOn(next)
    onlyThisDay.onScopeChange?.(next ? 'day' : 'all')
    if (next) {
      // Volver a encenderlo a mano deja el aviso sin sentido: lo que anunciaba ya no describe el
      // estado del switch. Se va, pero SIN deshacer nada (eso solo lo hace el botón).
      clearNoticeTimer()
      setNotice(null)
      return
    }
    // Apagarlo estando encendido no es solo cambiar el alcance de la PRÓXIMA escritura: hay que
    // resolver la meta que el día ya tiene. Decisión del jefe D2: NUNCA se borra — o el día
    // vuelve a la del base, o la suya pasa a valer para toda la semana. QUÉ se mueve, A QUIÉNES y
    // cómo se deshace lo resuelve el host con `qeSwitchOffPlan`; acá solo se cuenta lo que pasó.
    const applied = onlyThisDay.onSwitchOff?.() ?? null
    clearNoticeTimer()
    setNotice(applied)
    if (!applied) return
    noticeTimerRef.current = setTimeout(() => {
      noticeTimerRef.current = null
      setNotice(null)
    }, SWITCH_OFF_NOTICE_MS)
  }

  function handleUndo() {
    if (!notice || !onlyThisDay) return
    notice.undo()
    clearNoticeTimer()
    setNotice(null)
    setOnlyThisDayOn(true)
    // El evento sigue la POSICIÓN del switch (D5): si el deshacer no reportara, el embudo
    // mostraría un 'all' que el coach canceló y ningún 'day' de vuelta.
    onlyThisDay.onScopeChange?.('day')
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
          {/* Caja ÁMBAR con los mismos tokens que el `dayNotice` de la `PublishBar`
              (`warning-500/30`) y `accessibilityLiveRegion="polite"`, el equivalente RN del
              `role="status"` de la web: es un estado que acaba de cambiar, no una alerta. */}
          {notice ? (
            <View
              accessibilityLiveRegion="polite"
              className="mt-2 flex-row items-center justify-between gap-2 rounded-control border border-warning-500/30 bg-warning-500/10 px-3 py-2"
            >
              <Text className="min-w-0 flex-1 text-xs font-medium leading-5 text-warning-700">
                {notice.mode === 'back_to_base'
                  ? EDITOR_COPY.targets.backToBase(onlyThisDay.dayLabel)
                  : EDITOR_COPY.targets.appliedToAll}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={EDITOR_COPY.targets.undo}
                disabled={disabled}
                onPress={handleUndo}
                className="min-h-11 justify-center rounded-control px-2"
              >
                <Text className="text-xs font-bold text-warning-700">{EDITOR_COPY.targets.undo}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
    </NutritionCard>
  )
}
