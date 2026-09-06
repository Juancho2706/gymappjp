import { useEffect, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { ArrowLeftRight, MoreVertical, Pencil, Trash2 } from 'lucide-react-native'
import {
  HOUSEHOLD_UNIT,
  UNIT_REVIEW_BADGE_LABEL,
  foodCategoryFromName,
  foodMagnitudeUnit,
  foodUnitOptionsWithCurrent,
  householdUnitActionLabel,
  implausibleItemCopy,
  isHouseholdUnit,
  kcalBucket,
  normalizeIntakeUnit,
  qeItemPlausibility,
  quantityStep,
  reinterpretUnitActionLabel,
  shouldFlagUnitReview,
  unitEquivalenceCaption,
  unitReviewHint,
  type NutritionV2CoachScope,
  type QeItem,
  type UnitSelectOption,
} from '@eva/nutrition-v2'
import { captureNutritionItemImplausible } from '../../../lib/analytics'
import { ImplausibleNotice } from './ImplausibleNotice'
import { MacroSparkPopover } from '../MacroSparkPopover'
import { FoodThumbnail } from '../NutritionV2Kit'
import { FoodMacrosOverrideSheet } from '../FoodMacrosOverrideSheet'
import { useTheme } from '../../../context/ThemeContext'
import { type BuilderFoodMacrosPatch, type ItemMacros } from '../../../lib/nutrition-v2-builder'
import { foodMediaThumbnailUrl } from '../../../lib/nutrition-v2-food-media'
import {
  QUANTITY_CONTROL_HEIGHT_CLASS,
  QUANTITY_TEXT_METRICS,
  QuantityStepper,
} from './QuantityStepper'
import { QUICK_EDIT_COPY } from './microcopy'

/**
 * Fila editable de un alimento prescrito — nucleo del quick-edit (qe-design §1.2.B.1):
 * cantidad tap-to-edit con steppers, swap explicito (nunca drag), eliminar con
 * Deshacer (el snackbar vive en el orquestador). Macros de la fila en vivo.
 * Targets tactiles ≥44pt en todos los controles.
 *
 * T3.3a: la fila consume el `QeItem` de la gramatica compartida. El lapiz de correccion de
 * macros (T2.2) sigue el criterio del editor web (W2): SOLO con `item.food` en mano (swap o
 * alta de esta sesion) — los items base viven de su `macroBase` congelado, igual que en web.
 *
 * T3.v Cabina (V3.2) — espejo nativo de la fila v2 web (mockup «Cabina v2» A·1):
 *  - SIN card por fila: la comida se lee como una lista separada por un pelo de 1 px
 *    (`border-t border-subtle`); la caja la pone la franja. `first` apaga el filete de arriba
 *    (NativeWind no tiene `first:`, asi que el dato viaja como prop desde `EditableSlotCard`).
 *  - Foto REAL del producto a la izquierda (34→36 px, el `sm` del kit) con respaldo al icono de
 *    categoria; el alimento LIBRE no tiene producto que fotografiar y usa el tile punteado con
 *    sus iniciales, igual que la web.
 *  - Badges inline junto al nombre (⇄ n / macros editadas / libre) y subtitulo
 *    «marca · kcal por base» — la DENSIDAD del alimento, que es lo que el coach compara entre
 *    productos (el aporte de ESTA cantidad ya lo dice el spark).
 *  - La ristra «228 kcal · P 8 · C 39 · G 4` (`MacroChipRow`) muere: en su lugar va el
 *    `MacroSparkPopover` sm, que resume por aporte calorico y guarda los gramos exactos a un
 *    tap. Cero cambios de acciones, sheets ni cantidades.
 *
 * Adaptaciones de ancho (390 px, no hay grid de 5 columnas que quepa al lado de cuatro
 * botones de 44 pt): el subtitulo baja a su propia linea alineada bajo el nombre, y la
 * cantidad + unidad + spark viven en la ultima linea. La unidad «kcal» del spark NO se oculta
 * acá (en la web el header de la franja la dice a tres pixeles; en el telefono queda a dos
 * lineas de distancia y el numero solo se leeria como cualquier otra cifra).
 */

function UnitToggle({
  unit,
  options,
  onChange,
  disabled,
}: {
  unit: string
  /**
   * Unidades del ALIMENTO (W2.1, `foodUnitOptionsWithCurrent`): `un` solo si es realmente
   * contable, la medida casera con sus gramos («huevo · 61 g»), y SIEMPRE la unidad vigente
   * aunque ya no se ofrezca (una `porción` heredada de la conversion V1→V2) — el coach nunca
   * queda atrapado fuera de su unidad original.
   */
  options: readonly UnitSelectOption[]
  onChange: (unit: string) => void
  disabled?: boolean
}) {
  const cycle = options.length > 0 ? options : [{ code: unit, label: unit, grams: null }]
  const current = cycle.find((option) => option.code === unit) ?? cycle[0]!
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Unidad: ${current.label}. Toca para cambiar.`}
      disabled={disabled}
      onPress={() => {
        const index = cycle.findIndex((option) => option.code === unit)
        onChange(cycle[(index + 1) % cycle.length]!.code)
      }}
      // Misma altura declarada que el stepper (constante compartida) y mismo centrado:
      // el flexbox centra la etiqueta y las metricas de texto son las del numero, asi que
      // «180» y «g» quedan a la misma altura optica dentro de las dos cajas de 44 pt.
      // `max-w-40` porque la pastilla casera («huevo · 61 g») no cabe en el ancho minimo.
      className={`${QUANTITY_CONTROL_HEIGHT_CLASS} min-w-14 max-w-40 shrink-0 items-center justify-center rounded-control border border-default bg-surface-sunken px-2`}
    >
      <Text
        numberOfLines={1}
        className="text-sm font-semibold text-strong"
        style={QUANTITY_TEXT_METRICS}
      >
        {current.label}
      </Text>
    </Pressable>
  )
}

/**
 * Avisos de plausibilidad ya reportados a PostHog (W1.6): `<itemKey>|<motivo>`. Set de MODULO,
 * asi que «una vez por sesion» es mientras viva el proceso de la app. Sin esto cada tap del
 * stepper re-renderiza la fila y mandaria decenas de eventos del mismo aviso.
 */
const REPORTED_IMPLAUSIBLE_ITEMS = new Set<string>()

/**
 * Pill chica de badge inline del nombre (⇄ n / macros editadas / libre / Revisar unidad).
 * Solo tokens. `hint` es la explicacion larga: en el telefono no hay tooltip, asi que viaja como
 * `accessibilityHint` (el texto corto de la pill sigue siendo el `accessibilityLabel`).
 */
function ItemBadge({
  label,
  tone,
  hint,
}: {
  label: string
  tone: 'sport' | 'warning' | 'muted'
  hint?: string
}) {
  const toneClass =
    tone === 'sport'
      ? 'border-sport-500/30 bg-sport-100'
      : tone === 'warning'
        ? 'border-warning-500/30 bg-warning-500/10'
        : 'border-subtle bg-surface-sunken'
  const textClass =
    tone === 'sport' ? 'text-sport-700' : tone === 'warning' ? 'text-warning-700' : 'text-muted'
  return (
    <View
      className={`shrink-0 rounded-pill border px-1.5 py-px ${toneClass}`}
      accessible={hint !== undefined}
      accessibilityLabel={hint === undefined ? undefined : label}
      accessibilityHint={hint}
    >
      <Text className={`text-[10px] font-semibold ${textClass}`}>{label}</Text>
    </View>
  )
}

/**
 * «402 kcal / 100 g» — la DENSIDAD del alimento (mockup A·1). Espejo 1:1 del helper web
 * `itemDensityLabel`, con sus dos fuentes y ninguna inventada:
 *  - `item.food` (catalogo en mano tras un swap/alta): macros por 100 g/ml salvo que declare
 *    `per_serving` (NUT-001), y ahi se imprime la base declarada — decir «por 100» sobre una
 *    fila `per_serving` seria una mentira visual.
 *  - `item.macroBase` (item hidratado del read model: solo trae las macros de la cantidad
 *    prescrita): se reescala a 100 SOLO en g/ml. En unidades contadas no hay densidad que
 *    mostrar y devuelve null.
 */
function itemDensityLabel(item: QeItem): string | null {
  const food = item.food
  if (food) {
    const unitLabel = food.servingUnit === 'ml' ? 'ml' : 'g'
    const basis = food.macrosBasis === 'per_serving' ? food.servingSize : 100
    if (!Number.isFinite(basis) || basis <= 0) return null
    const amount = Number.isInteger(basis) ? String(basis) : basis.toFixed(1)
    return QUICK_EDIT_COPY.itemDensity(Math.round(food.calories), amount, unitLabel)
  }
  const base = item.macroBase
  const unit = (item.unit || '').toLowerCase()
  if (!base || base.quantity <= 0 || (unit !== 'g' && unit !== 'ml')) return null
  return QUICK_EDIT_COPY.itemDensity(
    Math.round((base.macros.calories / base.quantity) * 100),
    '100',
    unit,
  )
}

export function EditableItemRow({
  item,
  macros,
  errors,
  disabled = false,
  first = false,
  scope = null,
  onQuantityChange,
  onQuantityCommit,
  onUnitChange,
  onReinterpretUnit,
  onNameChange,
  onSwap,
  onRemove,
  onOpenMenu,
  onOverrideApplied,
}: {
  item: QeItem
  macros: ItemMacros
  errors: Record<string, string>
  disabled?: boolean
  /** Primera fila de la franja: sin filete superior (NativeWind no tiene `first:`). */
  first?: boolean
  /** Workspace del coach; sin el no hay a donde escribir la correccion. */
  scope?: NutritionV2CoachScope | null
  onQuantityChange: (value: string) => void
  /** Cantidad fijada (blur): la porcion pegajosa del editor la recuerda. */
  onQuantityCommit?: () => void
  onUnitChange: (unit: string) => void
  /**
   * «Cambiar a 30 g» del aviso de plausibilidad (W1.3): cambia la unidad SIN convertir la
   * cantidad. Ausente = la superficie no ofrece el atajo y el aviso queda solo con el mensaje.
   */
  onReinterpretUnit?: (unit: string) => void
  onNameChange: (value: string) => void
  onSwap: () => void
  onRemove: () => void
  /**
   * Menu del item (solo EDITOR unico): reemplazos autorizados y reorden dentro de la franja.
   * Ausente = quick-edit clasico, que no ofrece ninguna de las dos.
   */
  onOpenMenu?: () => void
  /** La correccion es del ALIMENTO: la pantalla la propaga a todas sus apariciones. */
  onOverrideApplied?: (foodId: string, macros: BuilderFoodMacrosPatch, message: string) => void
}) {
  const { theme } = useTheme()
  const isCustom = item.isCustom
  // Sheet de correccion de macros (T2.2), mismo componente que el wizard. Criterio W2 del
  // editor: solo con alimento del catalogo hidratado en la fila (swap/alta de esta sesion).
  const [macrosSheetOpen, setMacrosSheetOpen] = useState(false)
  const food = item.food
  const canCorrectMacros = !isCustom && !!food && !!scope && !!onOverrideApplied
  const quantityError = errors['item.' + item.key + '.quantity']
  const nameError = errors['item.' + item.key + '.name']
  // ── Cantidades honestas (W1.2 + W1.3): el rotulo «1 un = 100 g» y el aviso de plausibilidad,
  // resueltos por los mismos modulos puros que la fila web — cero copia de reglas.
  const plausibility = qeItemPlausibility(item)
  // Un motivo por aviso: `grams` manda sobre `kcal` (es el que explica el absurdo).
  const implausibleReason = plausibility.reasons[0] ?? null
  const unitCaption = food
    ? unitEquivalenceCaption({ unit: item.unit, servingSize: food.servingSize, servingUnit: food.servingUnit })
    : null
  // ── W2 «Cantidades honestas»: la medida casera del ITEM manda sobre la del catalogo (es la que
  // el coach autorizo y la que se congela al publicar); el alimento solo la respalda.
  const householdGrams = item.householdGrams ?? food?.householdGrams ?? null
  const householdLabel = item.householdLabel ?? food?.householdLabel ?? null
  const unitOptions = food
    ? foodUnitOptionsWithCurrent({ ...food, householdGrams, householdLabel }, item.unit)
    : []
  // W2.5 «Usar huevos»: segunda accion del aviso, solo si el item NO esta ya en medida casera.
  const householdAction =
    !isHouseholdUnit(item.unit) && householdGrams != null ? householdUnitActionLabel(householdLabel) : null
  // W2.5 badge «Revisar unidad»: `un` sobre un alimento NO contable con medida casera divergente.
  const unitReviewTitle =
    food &&
    householdGrams != null &&
    householdLabel != null &&
    shouldFlagUnitReview({
      unit: item.unit,
      servingUnit: food.servingUnit,
      servingSize: food.servingSize,
      householdGrams,
    })
      ? unitReviewHint({
          servingSize: food.servingSize,
          householdGrams,
          householdLabel,
          servingUnit: food.servingUnit,
        })
      : null
  useEffect(() => {
    if (implausibleReason === null) return
    const key = item.key + '|' + implausibleReason
    if (REPORTED_IMPLAUSIBLE_ITEMS.has(key)) return
    REPORTED_IMPLAUSIBLE_ITEMS.add(key)
    // Sin kcal exactas ni nombre del alimento (Ley 21.719): unidad, motivo y TRAMO.
    captureNutritionItemImplausible({
      surface: 'editor',
      unit: item.unit,
      reason: implausibleReason,
      kcalBucket: kcalBucket(plausibility.calories),
    })
  }, [implausibleReason, item.key, item.unit, plausibility.calories])
  // QA2-B3a: icono del producto a la izquierda del nombre — espejo del builder web:
  // foto del catalogo si existe, y si no el webp estatico de la categoria (item libre =>
  // categoria derivada del nombre).
  const thumbAlt = item.displayName || 'Alimento'
  const thumbSrc = foodMediaThumbnailUrl(food?.media ?? item.media)
  // Espejo de web `EditableItemRow.tsx:184-185`: categoría del catálogo o del item; si ninguna
  // llega, se deriva del NOMBRE (antes `null` caía al icono genérico «otro»).
  const thumbCategory = isCustom
    ? foodCategoryFromName(item.displayName)
    : (food?.category ?? item.category ?? foodCategoryFromName(item.displayName))
  const itemLabel = item.displayName || 'alimento'
  const substitutions = item.substitutions ?? []
  // Subtitulo v2 (mockup A·1): «marca · 402 kcal / 100 g». La porcion pegajosa («la sueles
  // usar aqui») NO llega a esta fila en RN: la memoria vive en la pantalla y el reducer la
  // aplica al ALTA, no por item — se declara pendiente en vez de inventarse una señal.
  const subtitle = [isCustom ? null : item.brand, itemDensityLabel(item)].filter(Boolean).join(' · ')

  return (
    <View className={first ? 'py-2.5' : 'border-t border-subtle py-2.5'}>
      {/* Linea 1 — foto · nombre con badges · acciones de la fila (intactas). */}
      <View className="flex-row items-start gap-2.5">
        {isCustom ? (
          // El alimento LIBRE no tiene producto que fotografiar: tile punteado con iniciales
          // (36 px, el mismo cuadro que el thumb `sm` del kit — cero salto de layout).
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="h-9 w-9 shrink-0 items-center justify-center rounded-control border border-dashed border-default bg-surface-sunken"
          >
            <Text className="font-mono text-[10px] font-semibold uppercase text-muted">
              {item.displayName.trim().slice(0, 2)}
            </Text>
          </View>
        ) : (
          <FoodThumbnail alt={thumbAlt} src={thumbSrc} fallbackCategory={thumbCategory} size="sm" />
        )}

        <View className="min-w-0 flex-1">
          {isCustom ? (
            <TextInput
              accessibilityLabel="Nombre del alimento"
              value={item.displayName}
              onChangeText={onNameChange}
              editable={!disabled}
              placeholder="Nombre del alimento"
              placeholderTextColor={theme.mutedForeground}
              className="min-h-11 rounded-control border border-default bg-surface-card px-2.5 py-1.5 text-sm font-semibold text-strong"
            />
          ) : (
            <View className="flex-row items-center gap-1.5">
              <Text className="min-w-0 shrink text-sm font-semibold text-strong" numberOfLines={2}>
                {item.displayName}
              </Text>
              {substitutions.length > 0 ? (
                <ItemBadge
                  tone="sport"
                  label={QUICK_EDIT_COPY.itemBadgeSubstitutions(substitutions.length)}
                />
              ) : null}
              {/* Badge ✎: este alimento lleva TUS macros, no los del catalogo. */}
              {food?.hasOverride ? (
                <ItemBadge tone="warning" label={QUICK_EDIT_COPY.itemBadgeMacrosEdited} />
              ) : null}
              {/* W2.5 — «Revisar unidad»: aca «1 un» son los gramos de la porcion y el catalogo
                  dice que una pieza de verdad pesa otra cosa. Avisa, no reescribe. */}
              {unitReviewTitle ? (
                <ItemBadge tone="warning" label={UNIT_REVIEW_BADGE_LABEL} hint={unitReviewTitle} />
              ) : null}
            </View>
          )}
        </View>

        <View className="shrink-0 flex-row items-center">
          {canCorrectMacros ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Corregir macros de ${itemLabel}`}
              disabled={disabled}
              onPress={() => setMacrosSheetOpen(true)}
              className="h-11 w-11 items-center justify-center rounded-control"
            >
              <Pencil color={theme.mutedForeground} size={17} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Reemplazar ${itemLabel}`}
            disabled={disabled}
            onPress={onSwap}
            className="h-11 w-11 items-center justify-center rounded-control"
          >
            <ArrowLeftRight color={theme.primary} size={18} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Eliminar ${itemLabel}`}
            disabled={disabled}
            onPress={onRemove}
            className="h-11 w-11 items-center justify-center rounded-control"
          >
            <Trash2 color={theme.destructive} size={18} />
          </Pressable>
          {onOpenMenu ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Opciones de ${itemLabel}`}
              disabled={disabled}
              onPress={onOpenMenu}
              className="h-11 w-11 items-center justify-center rounded-control"
            >
              <MoreVertical color={theme.textSecondary} size={17} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Linea 2 — badge «libre» + subtitulo, alineados bajo el nombre (46 px = thumb + gap).
          En la web esto va pegado al nombre; en 390 px la columna de identidad mide ~140 px
          entre los botones de accion y el subtitulo quedaria recortado a dos palabras. */}
      {isCustom || subtitle ? (
        <View className="ml-[46px] mt-0.5 flex-row items-center gap-1.5">
          {isCustom ? <ItemBadge tone="muted" label={QUICK_EDIT_COPY.itemBadgeFree} /> : null}
          <Text className="min-w-0 flex-1 text-[11px] leading-4 text-muted" numberOfLines={1}>
            {subtitle || (isCustom ? QUICK_EDIT_COPY.itemFreeHint : '')}
          </Text>
        </View>
      ) : null}

      {nameError ? <Text className="mt-1 text-xs font-medium text-danger-600">{nameError}</Text> : null}

      {/* Linea 3 — cantidad · unidad · spark. Los gramos exactos NO desaparecen: viven a un tap
          del spark (SPEC D3). Item sin macros = track vacio + «Sin macros registrados» en el
          panel, que lo resuelve el propio componente.
          Cantidad y unidad comparten alto declarado y metricas de texto (ver QuantityStepper):
          el hallazgo 2 del owner era que el numero y la unidad no se leian a la misma altura. */}
      <View className="mt-2 flex-row items-center gap-2">
        <QuantityStepper
          value={item.quantity}
          onChange={onQuantityChange}
          onCommit={onQuantityCommit}
          step={quantityStep(item.unit)}
          accessibilityLabel={`Cantidad de ${itemLabel}`}
          disabled={disabled}
        />
        <UnitToggle unit={item.unit} options={unitOptions} onChange={onUnitChange} disabled={disabled} />
        <MacroSparkPopover
          size="sm"
          className="ml-auto shrink-0"
          ariaContext={itemLabel}
          calories={macros.calories}
          proteinG={macros.proteinG}
          carbsG={macros.carbsG}
          fatsG={macros.fatsG}
          fiberG={macros.fiberG > 0 ? macros.fiberG : null}
        />
      </View>
      {quantityError ? (
        <Text className="mt-1 text-xs font-medium text-danger-600">{quantityError}</Text>
      ) : null}

      {/* W1.2 — «1 un = 100 g»: en el 96 % del catálogo «1 un» es una porción de 100 g y nadie lo
          decía (SPEC §4.2). Línea completa bajo el stepper + el toggle de unidad. */}
      {unitCaption ? <Text className="mt-1 text-xs text-muted">{unitCaption}</Text> : null}

      {/* W1.3 — aviso de plausibilidad (mockup M1). Avisa, NO bloquea. La única acción de W1 es
          «keep the number»: reinterpreta la unidad SIN convertir, porque la premisa es que el
          número estaba bien. «Usar {medida casera}» llega en W2. */}
      {plausibility.implausible ? (
        <View className="mt-2">
          <ImplausibleNotice
            variant="box"
            testID="qe-item-implausible"
            message={implausibleItemCopy({
              quantity: Number(item.quantity.trim()),
              unit: item.unit,
              foodName: itemLabel,
              grams: plausibility.grams,
              calories: plausibility.calories,
              servingSize: food?.servingSize ?? null,
              servingUnit: food?.servingUnit ?? null,
              householdLabel,
            })}
            actions={[
              ...(food && onReinterpretUnit && normalizeIntakeUnit(item.unit) === 'un'
                ? [
                    {
                      label: reinterpretUnitActionLabel({
                        quantity: Number(item.quantity.trim()),
                        servingUnit: food.servingUnit,
                      }),
                      disabled,
                      onPress: () => onReinterpretUnit(foodMagnitudeUnit(food.servingUnit)),
                    },
                  ]
                : []),
              /* W2.5 — «Usar huevos»: la cifra estaba bien y lo que faltaba era la medida.
                 Reinterpreta la unidad SIN convertir y copia el par casero al item (esa es la
                 autorizacion explicita del coach). */
              ...(food && onReinterpretUnit && householdAction
                ? [
                    {
                      label: householdAction,
                      disabled,
                      onPress: () => onReinterpretUnit(HOUSEHOLD_UNIT),
                    },
                  ]
                : []),
            ]}
          />
        </View>
      ) : null}

      {canCorrectMacros && macrosSheetOpen && food && scope ? (
        <FoodMacrosOverrideSheet
          food={food}
          scope={scope}
          open={macrosSheetOpen}
          onClose={() => setMacrosSheetOpen(false)}
          onApplied={(patch, message) => onOverrideApplied?.(food.id, patch, message)}
        />
      ) : null}
    </View>
  )
}
