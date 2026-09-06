import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowRight, RotateCcw } from 'lucide-react-native'
import type { NutritionMacroKey } from '@eva/nutrition-v2'
import { NutritionMotionButton } from '../NutritionV2Kit'
import { useTheme } from '../../../context/ThemeContext'
import { ImplausibleNotice } from './ImplausibleNotice'
import { EDITOR_COPY, QUICK_EDIT_COPY, dirtyBarLabel } from './microcopy'

/**
 * Barra de publicacion sticky del modo edicion (qe-design §1.2.C adaptado a RN §1.3):
 * contador de cambios + Descartar / Publicar cambios, con safe-area inferior. En error
 * de red/servidor muestra "No se pudo publicar. Reintentar" SIN perder el draft (el
 * reintento reusa la MISMA idempotency key — la maneja el orquestador).
 */
/** Totales EN VIVO del dia en edicion (items + porciones), fijos al pie del editor (W3b). */
export interface PublishBarDayTotals {
  /** Etiqueta del dia; null en planes de un solo dia (no hay que desambiguar nada). */
  label: string | null
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
  /** Meta de calorias del dia, si el coach la fijo. */
  targetCalories: number | null
  /**
   * T3.v Cabina (V3.3): metas de gramos por macro del dia (steppers de «Metas ▾»/
   * `TargetsEditorCard`), si el coach las fijo. Alimentan la mini-cinta (`EditorRibbon.tsx`);
   * `null` = sin meta fijada para ese macro (no se inventa un porcentaje).
   */
  targetProteinG: number | null
  targetCarbsG: number | null
  targetFatsG: number | null
}

/**
 * T3.v Cabina: fila macro→campo de `PublishBarDayTotals`, en el orden de pintado P·C·G
 * (mismo orden que `MacroSpark` y que la leyenda web). Exportada para que la mini-cinta
 * (`EditorRibbon.tsx`, V3.3) calcule el % de cumplimiento de cada macro SIN un segundo mapeo
 * paralelo — dos tablas serían dos verdades sobre qué meta le toca a cada macro. Espejo exacto
 * de `DAY_MACRO_ROWS` en `apps/web/.../_quick-edit/PublishBar.tsx`.
 */
export const DAY_MACRO_ROWS: ReadonlyArray<{
  key: NutritionMacroKey
  actual: keyof Pick<PublishBarDayTotals, 'proteinG' | 'carbsG' | 'fatsG'>
  target: keyof Pick<PublishBarDayTotals, 'targetProteinG' | 'targetCarbsG' | 'targetFatsG'>
}> = [
  { key: 'protein', actual: 'proteinG', target: 'targetProteinG' },
  { key: 'carbs', actual: 'carbsG', target: 'targetCarbsG' },
  { key: 'fats', actual: 'fatsG', target: 'targetFatsG' },
]

export function PublishBar({
  count,
  publishing,
  errorMessage,
  errorAction,
  dayTotals = null,
  dayWarning = null,
  template = false,
  creation = false,
  onDiscard,
  onPublish,
  onRetry,
}: {
  count: number
  publishing: boolean
  errorMessage: string | null
  /**
   * Accion de la caja de error. `undefined` = "Reintentar" de siempre (fallo de red/servidor:
   * lo unico que se puede hacer es volver a intentar). `null` = solo el texto, porque el error
   * es de VALIDACION y sus marcas ya estan en pantalla — ofrecer "Reintentar" ahi manda a
   * repetir un publish que se va a cortar igual. Objeto = boton propio (p. ej. "Ir a Martes",
   * cuando lo que falta esta en un dia que el editor no esta pintando).
   */
  errorAction?: { label: string; onPress: () => void } | null
  /**
   * Editor unico (T3.3b/W3b): totales del dia activo. Presente ⇒ la barra vive SIEMPRE (los
   * botones siguen apareciendo solo con cambios). Ausente = quick-edit clasico, igual que antes.
   */
  dayTotals?: PublishBarDayTotals | null
  /**
   * Aviso de plausibilidad del dia, ya redactado por el orquestador (`dayWarningCopy`, W1.3 del
   * tren «Cantidades honestas»). La barra no lo deriva —no conoce los items— y NO bloquea:
   * publicar sigue siendo un tap. `null` = nada que decir. Espejo de la barra web.
   */
  dayWarning?: string | null
  /** Modo PLANTILLA: se GUARDA material del coach, no se publica nada a un alumno. */
  template?: boolean
  /** Modo CREACION: se publica un plan NUEVO, no cambios sobre uno vigente. */
  creation?: boolean
  onDiscard: () => void
  onPublish: () => void
  onRetry: () => void
}) {
  const insets = useSafeAreaInsets()
  const { theme } = useTheme()
  const hasActions = count > 0 || errorMessage !== null
  const publishLabel = template
    ? EDITOR_COPY.templateSave
    : creation
      ? EDITOR_COPY.createPublish
      : QUICK_EDIT_COPY.publish
  if (dayTotals === null && dayWarning === null && !hasActions) return null

  return (
    <View
      className="border-t border-subtle bg-surface-app px-4 pt-3"
      style={{ paddingBottom: Math.max(insets.bottom, 8) + 4 }}
    >
      {errorMessage ? (
        <View className="mb-2 flex-row items-center justify-between gap-2 rounded-control border border-danger-500/30 bg-danger-500/10 px-3 py-2">
          <Text className="min-w-0 flex-1 text-xs font-medium text-danger-600">{errorMessage}</Text>
          {errorAction === null ? null : errorAction ? (
            // El error vive en OTRO dia: el boton lleva ahi. Sin este salto el mensaje nombra un
            // dia que el coach no tiene forma de encontrar (el editor pinta uno solo).
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={errorAction.label}
              disabled={publishing}
              onPress={errorAction.onPress}
              className="min-h-11 flex-row items-center gap-1.5 rounded-control px-2"
            >
              <Text className="text-xs font-bold text-danger-600">{errorAction.label}</Text>
              <ArrowRight color={theme.destructive} size={14} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={QUICK_EDIT_COPY.retry}
              disabled={publishing}
              onPress={onRetry}
              className="min-h-11 flex-row items-center gap-1.5 rounded-control px-2"
            >
              <RotateCcw color={theme.destructive} size={14} />
              <Text className="text-xs font-bold text-danger-600">{QUICK_EDIT_COPY.retry}</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {/* W1.3 «Cantidades honestas» — aviso del día, encima de los totales que lo provocan y de
          los botones. Avisa, NO bloquea (misma regla que el mismatch de Atwater). */}
      {dayWarning ? (
        <View className="mb-2">
          <ImplausibleNotice variant="box" message={dayWarning} testID="qe-day-implausible" />
        </View>
      ) : null}

      {/* H-18/QW-12: en una sola fila los dos botones no ceden ancho y el que se truncaba era el
          contador ("3 cam…") — justo el feedback principal del modo edición. Contador en línea
          propia y par de botones repartido en `flex-1` cada uno (gotcha conocido del proyecto:
          dos botones en fila SIEMPRE flex-1, nunca ancho intrínseco). */}
      {/* W3b: totales del dia activo, siempre a la vista mientras se edita. */}
      {dayTotals ? (
        <View className="mb-2 flex-row flex-wrap items-baseline gap-x-2">
          {dayTotals.label ? (
            <Text className="text-xs font-semibold text-muted">{dayTotals.label} ·</Text>
          ) : null}
          <Text className="text-xs font-bold text-strong">
            {Math.round(dayTotals.calories)}
            {dayTotals.targetCalories != null ? ' / ' + Math.round(dayTotals.targetCalories) : ''} kcal
          </Text>
          <Text className="text-xs font-semibold text-body">P {Math.round(dayTotals.proteinG)}</Text>
          <Text className="text-xs font-semibold text-body">C {Math.round(dayTotals.carbsG)}</Text>
          <Text className="text-xs font-semibold text-body">G {Math.round(dayTotals.fatsG)}</Text>
        </View>
      ) : null}
      <Text className="text-sm font-semibold text-strong" numberOfLines={2}>
        {template ? EDITOR_COPY.templateDirtyBar(count) : dirtyBarLabel(count)}
      </Text>
      <View className="mt-2 flex-row items-center gap-3">
        <View className="flex-1">
          <NutritionMotionButton
            accessibilityLabel={QUICK_EDIT_COPY.discard}
            tone="neutral"
            disabled={publishing}
            onPress={onDiscard}
          >
            {QUICK_EDIT_COPY.discard}
          </NutritionMotionButton>
        </View>
        <View className="flex-1">
          <NutritionMotionButton
            accessibilityLabel={publishLabel}
            pending={publishing}
            disabled={publishing || count === 0}
            onPress={onPublish}
          >
            {publishLabel}
          </NutritionMotionButton>
        </View>
      </View>
    </View>
  )
}

/**
 * Snackbar local de Deshacer (5 s, lo temporiza el orquestador): undo LOCAL del draft,
 * nunca toca backend. Flota sobre la barra de publicacion.
 */
export function UndoSnackbar({
  message,
  onUndo,
}: {
  message: string
  onUndo: () => void
}) {
  return (
    <View className="mx-4 mb-2 flex-row items-center justify-between gap-3 rounded-control border border-subtle bg-surface-card px-4 py-2 shadow-sm">
      <Text className="min-w-0 flex-1 text-sm text-body" numberOfLines={1}>
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={QUICK_EDIT_COPY.undo}
        onPress={onUndo}
        className="min-h-11 items-center justify-center rounded-control px-2"
      >
        <Text className="text-sm font-bold text-primary">{QUICK_EDIT_COPY.undo}</Text>
      </Pressable>
    </View>
  )
}
