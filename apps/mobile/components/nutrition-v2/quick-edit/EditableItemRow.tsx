import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { ArrowLeftRight, MoreVertical, Pencil, Trash2 } from 'lucide-react-native'
import {
  foodCategoryFromName,
  quantityStep,
  type NutritionV2CoachScope,
  type QeItem,
} from '@eva/nutrition-v2'
import { MacroSparkPopover } from '../MacroSparkPopover'
import { FoodThumbnail } from '../NutritionV2Kit'
import { FoodMacrosOverrideSheet } from '../FoodMacrosOverrideSheet'
import { useTheme } from '../../../context/ThemeContext'
import {
  BUILDER_UNITS,
  type BuilderFoodMacrosPatch,
  type ItemMacros,
} from '../../../lib/nutrition-v2-builder'
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
  onChange,
  disabled,
}: {
  unit: string
  onChange: (unit: string) => void
  disabled?: boolean
}) {
  // Cicla las unidades del builder; si la fila trae una unidad fuera del set (p.ej.
  // 'porcion' heredada de la conversion V1→V2), se conserva en el ciclo para que el
  // coach pueda VOLVER a ella (nunca quedar atrapado fuera de su unidad original).
  const cycle: string[] = BUILDER_UNITS.includes(unit as (typeof BUILDER_UNITS)[number])
    ? [...BUILDER_UNITS]
    : [unit, ...BUILDER_UNITS]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Unidad: ${unit}. Toca para cambiar.`}
      disabled={disabled}
      onPress={() => {
        const index = cycle.indexOf(unit)
        onChange(cycle[(index + 1) % cycle.length])
      }}
      // Misma altura declarada que el stepper (constante compartida) y mismo centrado:
      // el flexbox centra la etiqueta y las metricas de texto son las del numero, asi que
      // «180» y «g» quedan a la misma altura optica dentro de las dos cajas de 44 pt.
      className={`${QUANTITY_CONTROL_HEIGHT_CLASS} min-w-14 shrink-0 items-center justify-center rounded-control border border-default bg-surface-sunken px-2`}
    >
      <Text className="text-sm font-semibold text-strong" style={QUANTITY_TEXT_METRICS}>
        {unit}
      </Text>
    </Pressable>
  )
}

/** Pill chica de badge inline del nombre (⇄ n / macros editadas / libre). Solo tokens. */
function ItemBadge({ label, tone }: { label: string; tone: 'sport' | 'warning' | 'muted' }) {
  const toneClass =
    tone === 'sport'
      ? 'border-sport-500/30 bg-sport-100'
      : tone === 'warning'
        ? 'border-warning-500/30 bg-warning-500/10'
        : 'border-subtle bg-surface-sunken'
  const textClass =
    tone === 'sport' ? 'text-sport-700' : tone === 'warning' ? 'text-warning-700' : 'text-muted'
  return (
    <View className={`shrink-0 rounded-pill border px-1.5 py-px ${toneClass}`}>
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
  // QA2-B3a: icono del producto a la izquierda del nombre — espejo del builder web:
  // foto del catalogo si existe, y si no el webp estatico de la categoria (item libre =>
  // categoria derivada del nombre).
  const thumbAlt = item.displayName || 'Alimento'
  const thumbSrc = foodMediaThumbnailUrl(food?.media ?? item.media)
  const thumbCategory = isCustom ? foodCategoryFromName(item.displayName) : (food?.category ?? item.category)
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
        <UnitToggle unit={item.unit} onChange={onUnitChange} disabled={disabled} />
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
