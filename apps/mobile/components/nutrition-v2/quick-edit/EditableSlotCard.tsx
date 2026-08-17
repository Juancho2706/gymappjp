import { useCallback, useState } from 'react'
import { Animated, Easing, LayoutAnimation, Pressable, Text, TextInput, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { Image } from 'expo-image'
import { ChevronDown, MoreVertical, Trash2 } from 'lucide-react-native'
import { exchangeGroupColor } from '@eva/nutrition-engine'
import {
  qeExchangeGroups,
  qeItemMacros,
  qeSlotPortionTotals,
  qeSlotSubtotal,
  type NutritionV2CoachScope,
  type QeItem,
  type QePortionTarget,
  type QeSlot,
} from '@eva/nutrition-v2'
import { NutritionCard } from '../NutritionCard'
import { MacroSparkPopover } from '../MacroSparkPopover'
import { AddActionButton } from '../AddActionButton'
import { foodCategoryIconSource } from '../NutritionV2Kit'
import { useTheme } from '../../../context/ThemeContext'
import { resolveEffectiveCoachBrandTheme } from '../../../lib/theme'
import type { BuilderFoodMacrosPatch, ItemMacros } from '../../../lib/nutrition-v2-builder'
import {
  foodCategoryEmoji,
  foodCategoryEmojiFromName,
  foodMediaThumbnailUrl,
} from '../../../lib/nutrition-v2-food-media'
import { PORTIONS_COPY } from '../../../lib/nutrition-portions-copy'
import { EditableItemRow } from './EditableItemRow'
import {
  EditablePortionsSection,
  type PortionPickerGroup,
  type QuickEditGroupAdmin,
} from './EditablePortionsSection'
import { QUICK_EDIT_COPY } from './microcopy'

/**
 * Franja editable (qe-design §1.2.B.2): nombre y hora inline en el header, filas de
 * alimentos editables, "+ Agregar alimento" (buscador en sheet) y "Libre" al pie,
 * eliminar franja con confirmacion (la maneja el orquestador). Franja vacia es un
 * estado VALIDO ("Franja sin alimentos") — el RPC exige ≥1 franja, no ≥1 item.
 *
 * T3.v Cabina (V3.2) — espejo nativo de la franja v2 web (mockup «Cabina v2» A·1/A·2):
 *  - El bloque «Subtotal franja» + ristra de chips del pie MUERE: el subtotal sube al header
 *    como `MacroSparkPopover` md (una cifra + la barra apilada), con los gramos exactos y el
 *    «{n}% de la meta» a un tap. El NUMERO no cambia: sigue siendo `qeSlotSubtotal` (items),
 *    exactamente el mismo cálculo que la card ya mostraba.
 *  - Franja CONTRAIBLE (chevron, estado local sin persistencia): con 5-6 comidas la pila
 *    obliga a scrollear a ciegas. Contraída la card sigue diciendo lo que importa de un
 *    vistazo — nombre, hora, subtotal y el stack de hasta 4 fotos de sus alimentos.
 *    QA T3.v (hallazgo 3 del owner): el chevron no se leía como botón y el plegado era un
 *    salto seco. Ahora el disparador tiene caja (relleno hundido + filete sutil del kit), el
 *    icono GIRA y el alto de la card se interpola con `LayoutAnimation` (easeInEaseOut, misma
 *    duración que el giro). Bajo reduced motion del sistema las dos cosas son instantáneas.
 *  - Strip de porciones al pie (filete punteado): pills con el punto de color de identidad del
 *    grupo, y el aporte referencial «≈ n kcal». Las pills SOLO aparecen contraída (expandida,
 *    `EditablePortionsSection` ya muestra los mismos grupos con sus steppers tres píxeles más
 *    arriba: repetirlos sería ruido); la nota completa del builder viaja igual como nombre
 *    accesible de la cifra.
 *
 * Cero cambios de acciones, sheets ni dispatches: esta pasada es de PRESENTACION.
 */

/** Fotos que entran en el stack de la franja contraida antes del «+n» (mockup A·1/A·2). */
const STACK_MAX_THUMBS = 4

/**
 * Trío del `stack` de «Agregar alimento» (Familia N): proteína + carbohidrato + verdura, el plato
 * completo. Es FIJO y decorativo a propósito — no espeja lo que la franja ya tiene cargado, porque
 * la gracia de la familia es que el botón se reconozca por silueta SIEMPRE igual, y un stack que
 * cambia con el contenido se leería como estado, no como acción. Son los mismos assets bundleados
 * que pintan las filas del catálogo (`foodCategoryIconSource`), así que no suman peso al bundle.
 */
const ADD_FOOD_STACK = [
  foodCategoryIconSource('proteina'),
  foodCategoryIconSource('carbohidrato'),
  foodCategoryIconSource('verdura'),
] as const

/**
 * Duracion del contraer/expandir. Un solo numero para el alto de la card (LayoutAnimation) y
 * para el giro del chevron: si divergen, el icono termina de girar antes o despues de que el
 * cuerpo termine de plegarse y el gesto se lee como dos animaciones distintas.
 */
const COLLAPSE_MS = 220

export function EditableSlotCard({
  slot,
  index,
  errors,
  disabled = false,
  portionGroups,
  targetCalories = null,
  scope = null,
  onFoodOverrideApplied,
  onSlotPatch,
  onRemoveSlot,
  onOpenMenu,
  onSearchFood,
  onAddFreeItem,
  onItemQuantity,
  onItemQuantityCommit,
  onItemUnit,
  onItemName,
  onSwapItem,
  onRemoveItem,
  onOpenItemMenu,
  onPortionStep,
  onPortionNotes,
  onPortionRemove,
  onPortionAdd,
  portionGroupAdmin,
}: {
  slot: QeSlot
  index: number
  errors: Record<string, string>
  disabled?: boolean
  /** Grupos elegibles del picker; [] + franja sin targets = seccion invisible (SPEC UX-c). */
  portionGroups: PortionPickerGroup[]
  /**
   * Meta de kcal del DIA (no de la franja): habilita el «{n}% de la meta» del popover del
   * subtotal. Sin meta cargada el popover simplemente no lo dice — jamas se inventa un
   * porcentaje contra una meta vacia.
   */
  targetCalories?: number | null
  onSlotPatch: (patch: { name?: string; startTime?: string }) => void
  onRemoveSlot: () => void
  /**
   * Menú de la franja (CE-5): copiar a otros días / aplicar a todos. Ausente = plan de un
   * solo día, donde copiar no tiene destino y la afordancia sería ruido.
   */
  onOpenMenu?: () => void
  onSearchFood: () => void
  onAddFreeItem: () => void
  onItemQuantity: (itemKey: string, value: string) => void
  /** Cantidad fijada (blur) — porcion pegajosa del editor. Ausente = no se recuerda nada. */
  onItemQuantityCommit?: (itemKey: string) => void
  onItemUnit: (itemKey: string, unit: string) => void
  onItemName: (itemKey: string, value: string) => void
  onSwapItem: (itemKey: string) => void
  onRemoveItem: (itemKey: string) => void
  /** Menu por item (solo editor unico): reemplazos autorizados + reorden. */
  onOpenItemMenu?: (itemKey: string) => void
  onPortionStep: (targetKey: string, direction: 1 | -1) => void
  onPortionNotes: (targetKey: string, value: string) => void
  onPortionRemove: (target: QePortionTarget, index: number) => void
  onPortionAdd: (group: PortionPickerGroup) => void
  /** Porciones propias (FD6a): altas/edición de grupos desde el picker. Ausente = sin esa UI. */
  portionGroupAdmin?: QuickEditGroupAdmin
  /** Workspace del coach: habilita el lápiz de corrección de macros (T2.2). */
  scope?: NutritionV2CoachScope | null
  /** La corrección es del ALIMENTO: la pantalla la propaga a todas sus apariciones. */
  onFoodOverrideApplied?: (foodId: string, macros: BuilderFoodMacrosPatch, message: string) => void
}) {
  const { theme, branding } = useTheme()
  /**
   * Color de marca REAL del coach para la «Familia N». El default del componente es el primary de
   * la web (#2563EB) y el del móvil es otro (#1462DC): dejarlo librado al default pintaría el «+»
   * de un azul que no es el de esta pantalla, y en las pastillas `primary` de otras superficies
   * calcularía la tinta contra un fondo que no es el que se ve. `resolveEffectiveCoachBrandTheme`
   * es el MISMO resolutor del que sale `theme` (tier + preset + fallback EVA), así que el acento
   * del botón y el `bg-primary` del resto de la card no pueden divergir.
   */
  const brandColor = resolveEffectiveCoachBrandTheme(branding).brandColor
  /**
   * Franja contraida (chevron). Estado LOCAL y sin persistencia a proposito (mismo criterio que
   * la web): cual dejo abierta el coach no es una preferencia que valga recordar entre sesiones.
   * Arranca expandida.
   */
  const [collapsed, setCollapsed] = useState(false)
  /**
   * Reduced motion del SISTEMA. Mismo helper que ya usa el resto de la app (`useReducedMotion`
   * de reanimated, con `<ReducedMotionConfig mode={System}>` montado en app/_layout.tsx): con
   * el ajuste activo el plegado es INSTANTANEO — ni LayoutAnimation ni giro.
   */
  const reduceMotion = useReducedMotion()
  /**
   * Giro del chevron: 0 = franja abierta (apunta abajo), 1 = contraida (apunta a la izquierda).
   * `Animated` del core basta para una rotacion — no hace falta Reanimated ni Moti aqui, y
   * `useNativeDriver` la saca del hilo de JS.
   */
  const [chevronSpin] = useState(() => new Animated.Value(0))
  const chevronRotate = chevronSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-90deg'],
  })
  const toggleCollapsed = useCallback(() => {
    const next = !collapsed
    if (reduceMotion) {
      // Sin animacion: el cuerpo aparece/desaparece de una y el chevron salta a su angulo.
      chevronSpin.setValue(next ? 1 : 0)
      setCollapsed(next)
      return
    }
    // El alto de la card lo anima el propio sistema de layout: `configureNext` pide que el
    // PROXIMO commit (el del setState de abajo) se interpole en vez de saltar. Presets
    // easeInEaseOut + opacity, que es lo que hace que las filas se disuelvan al plegarse.
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        COLLAPSE_MS,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity,
      ),
    )
    setCollapsed(next)
    Animated.timing(chevronSpin, {
      toValue: next ? 1 : 0,
      duration: COLLAPSE_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start()
  }, [chevronSpin, collapsed, reduceMotion])
  const subtotal: ItemMacros = qeSlotSubtotal(slot)
  // Aporte referencial de las porciones a eleccion de ESTA franja, solo para el strip del pie
  // (el subtotal del header sigue siendo el de los items, como esta card ya lo mostraba).
  const portionTotals = qeSlotPortionTotals(slot, qeExchangeGroups(portionGroups))
  const nameError = errors['slot.' + slot.key + '.name']
  const timeError = errors['slot.' + slot.key + '.startTime']
  const slotLabel = slot.name.trim() || `Franja ${index + 1}`
  // Orden del catálogo del plan: es el `sortOrder` con el que `exchangeGroupColor` elige el color
  // de identidad de cada grupo. Misma fuente y criterio que `EditablePortionsSection`, para que el
  // punto de la pill y el del circulito con stepper nunca tengan colores distintos.
  const portionGroupOrder = new Map(
    portionGroups.map((group) => [group.exchangeGroupId, group.sortOrder ?? 0]),
  )
  // Las pills son el sustituto de la sección de porciones mientras está escondida. Sin pills ni
  // nota, el strip no se pinta: nada de filetes punteados vacíos.
  const showPortionPills = collapsed && slot.portionTargets.length > 0

  return (
    <NutritionCard>
      <View className="flex-row items-start justify-between gap-2">
        <Text className="font-mono text-[11px] font-semibold uppercase tracking-wide text-primary">
          Franja {index + 1}
        </Text>
        {/* `gap-1`: el botón de contraer ahora tiene caja propia, y pegado al ⋮ y al tacho (que
            son icono pelado) se leería como un error de render. */}
        <View className="flex-row items-center gap-1">
          {/* Contraer/expandir: con 5-6 comidas por día la pila obliga a scrollear a ciegas.
              Es un BOTON, no un icono suelto: caja de 44 pt con relleno hundido y filete sutil
              (el mismo par `border-subtle` + `bg-surface-sunken` del kit), para que se lea como
              control y no como adorno del header — espejo del botón web, que ahí se delata con
              el hover que el teléfono no tiene. El chevron GIRA (no salta) y el cuerpo se pliega
              con la misma curva y duración; con reduced motion las dos cosas son instantáneas.
              `className` sin `style`-función: css-interop descartaría el estilo entero. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              collapsed
                ? QUICK_EDIT_COPY.expandSlot(slotLabel)
                : QUICK_EDIT_COPY.collapseSlot(slotLabel)
            }
            accessibilityState={{ expanded: !collapsed }}
            onPress={toggleCollapsed}
            className="h-11 w-11 items-center justify-center rounded-control border border-subtle bg-surface-sunken"
          >
            <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
              <ChevronDown color={theme.textSecondary} size={18} />
            </Animated.View>
          </Pressable>
          {onOpenMenu ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${QUICK_EDIT_COPY.slotMenuTitle} ${slot.name || index + 1}`}
              disabled={disabled}
              onPress={onOpenMenu}
              className="h-11 w-11 items-center justify-center rounded-control"
            >
              <MoreVertical color={theme.textSecondary} size={17} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Eliminar franja ${slot.name || index + 1}`}
            disabled={disabled}
            onPress={onRemoveSlot}
            className="h-11 w-11 items-center justify-center rounded-control"
          >
            <Trash2 color={theme.destructive} size={17} />
          </Pressable>
        </View>
      </View>

      <View className="flex-row gap-2">
        <View className="flex-1">
          <TextInput
            accessibilityLabel="Nombre de la franja"
            value={slot.name}
            onChangeText={(value) => onSlotPatch({ name: value })}
            editable={!disabled}
            placeholder="Nombre (ej: Desayuno)"
            placeholderTextColor={theme.mutedForeground}
            className="min-h-11 rounded-control border border-default bg-surface-card px-2.5 py-2 text-sm font-semibold text-strong"
          />
        </View>
        <View className="w-24">
          <TextInput
            accessibilityLabel="Hora de la franja"
            value={slot.startTime}
            onChangeText={(value) => onSlotPatch({ startTime: value })}
            editable={!disabled}
            placeholder="HH:MM"
            placeholderTextColor={theme.mutedForeground}
            className="min-h-11 rounded-control border border-default bg-surface-card px-2.5 py-2 text-sm text-strong"
          />
        </View>
      </View>
      {nameError || timeError ? (
        <Text className="mt-1 text-xs font-medium text-danger-600">{nameError ?? timeError}</Text>
      ) : null}

      {/* Subtotal de la franja + qué lleva sin abrirla. En la web esto vive en la MISMA línea del
          nombre; en 390 px esa línea ya la ocupan el input de nombre, la hora y tres botones de
          44 pt, así que el bloque baja a su propio renglón (misma información, mismo orden). */}
      <View className="mt-2 flex-row flex-wrap items-center justify-end gap-2">
        {collapsed && slot.items.length > 0 ? <SlotItemStack items={slot.items} /> : null}
        <MacroSparkPopover
          size="md"
          calories={subtotal.calories}
          proteinG={subtotal.proteinG}
          carbsG={subtotal.carbsG}
          fatsG={subtotal.fatsG}
          fiberG={subtotal.fiberG > 0 ? subtotal.fiberG : null}
          targetCalories={targetCalories}
          ariaContext={`Subtotal de ${slotLabel}`}
        />
      </View>

      {collapsed ? null : (
        <>
          {slot.items.length === 0 ? (
            <Text className="mt-3 text-sm text-muted">{QUICK_EDIT_COPY.emptySlot}</Text>
          ) : (
            <View className="mt-2">
              {slot.items.map((item, itemIndex) => (
                <EditableItemRow
                  key={item.key}
                  item={item}
                  first={itemIndex === 0}
                  macros={qeItemMacros(item)}
                  errors={errors}
                  disabled={disabled}
                  scope={scope}
                  onOverrideApplied={onFoodOverrideApplied}
                  onQuantityChange={(value) => onItemQuantity(item.key, value)}
                  onQuantityCommit={
                    onItemQuantityCommit ? () => onItemQuantityCommit(item.key) : undefined
                  }
                  onUnitChange={(unit) => onItemUnit(item.key, unit)}
                  onNameChange={(value) => onItemName(item.key, value)}
                  onSwap={() => onSwapItem(item.key)}
                  onRemove={() => onRemoveItem(item.key)}
                  onOpenMenu={onOpenItemMenu ? () => onOpenItemMenu(item.key) : undefined}
                />
              ))}
            </View>
          )}

          {/* Altas de la franja, «Familia N» (T3.v Cabina): la misma pastilla que agrega en TODO
              el editor. `flex-wrap` y ancho natural (nada de `flex-1`): con el trío de íconos, el
              «+» y las dos etiquetas del microcopy, las dos pastillas no entran en una línea de
              390 px — forzarlas comprimía el label hasta partirlo en dos renglones. Envolviendo,
              cada una conserva su silueta y la segunda baja limpia. */}
          <View className="mt-3 flex-row flex-wrap items-center gap-2">
            <AddActionButton
              variant="neutral"
              stack={ADD_FOOD_STACK}
              label={QUICK_EDIT_COPY.addFood}
              accessibilityLabel={`${QUICK_EDIT_COPY.addFood} en ${slot.name || 'la franja'}`}
              brandColor={brandColor}
              disabled={disabled}
              onPress={onSearchFood}
            />
            {/* Punteado = «hueco por llenar»: el alimento libre lo escribe el coach a mano. */}
            <AddActionButton
              variant="dashed"
              icon="libre"
              label={QUICK_EDIT_COPY.freeFood}
              brandColor={brandColor}
              disabled={disabled}
              onPress={onAddFreeItem}
            />
          </View>

          {/* Seccion "Porciones a eleccion" (SPEC UX-a): hermana de los items, bajo
              "+ Agregar alimento". Se pinta sola solo si el plan usa porciones. */}
          <EditablePortionsSection
            targets={slot.portionTargets}
            groups={portionGroups}
            disabled={disabled}
            onStep={onPortionStep}
            onSetNotes={onPortionNotes}
            onRemove={onPortionRemove}
            onAdd={onPortionAdd}
            groupAdmin={portionGroupAdmin}
          />
        </>
      )}

      {/* Pie v2 (mockup A·1, `q-portions`): filete punteado, pills con el color de identidad del
          grupo y el aporte referencial. */}
      {showPortionPills || portionTotals ? (
        <View className="mt-3 flex-row flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-dashed border-subtle pt-2.5">
          {showPortionPills ? (
            <>
              <Text className="font-mono text-[9px] uppercase tracking-widest text-muted">
                {PORTIONS_COPY.builder.sectionTitle}
              </Text>
              {slot.portionTargets.map((target) => (
                <PortionGroupPill
                  key={target.key}
                  target={target}
                  sortOrder={portionGroupOrder.get(target.exchangeGroupId) ?? 0}
                />
              ))}
            </>
          ) : null}
          {portionTotals ? (
            // Redondeo entero + prefijo ~: valor referencial (mismo copy que el builder). Lo que
            // se LEE es la forma corta del mockup («≈ 118 kcal»); la nota completa de siempre es
            // el nombre accesible de la cifra (el equivalente RN del `sr-only` + `title` web).
            <Text
              accessibilityLabel={PORTIONS_COPY.builder.subtotalPortionsNote(
                String(Math.round(portionTotals.calories)),
              )}
              className="ml-auto font-mono text-[11px] text-muted"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {`≈ ${Math.round(portionTotals.calories)} kcal`}
            </Text>
          ) : null}
        </View>
      ) : null}
    </NutritionCard>
  )
}

/**
 * Stack de fotos de la franja contraída (mockup A·1/A·2): hasta cuatro miniaturas de 22 px
 * solapadas, con un aro del color de la card para que se lean como una baraja, y «+n» si quedan
 * más. Mismo camino de imagen que la fila: URL pública directa del bucket (cero Image
 * Transformations, que son cuota) y respaldo al emoji local de la categoría — en RN los íconos
 * .webp de categoría no se descargan, así que el fallback del kit móvil es el emoji.
 *
 * Decorativo a propósito: la lista real vive en el cuerpo de la card, y contraída el subtotal
 * ya se anuncia por el nombre accesible del spark de al lado.
 */
function SlotItemStack({ items }: { items: QeItem[] }) {
  const shown = items.slice(0, STACK_MAX_THUMBS)
  const rest = items.length - shown.length

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="shrink-0 flex-row items-center"
    >
      {shown.map((item, thumbIndex) => {
        const url = foodMediaThumbnailUrl(item.food?.media ?? item.media)
        const category = item.food?.category ?? item.category
        const emoji = category
          ? foodCategoryEmoji(category)
          : foodCategoryEmojiFromName(item.displayName)
        return (
          <View
            key={item.key}
            className={
              'h-[22px] w-[22px] shrink-0 items-center justify-center overflow-hidden rounded-md border-2 border-card bg-surface-sunken' +
              (thumbIndex > 0 ? ' -ml-2' : '')
            }
          >
            {url ? (
              <Image source={{ uri: url }} contentFit="cover" style={{ width: '100%', height: '100%' }} />
            ) : (
              <Text style={{ fontSize: 10 }}>{emoji}</Text>
            )}
          </View>
        )
      })}
      {rest > 0 ? (
        <View className="-ml-2 h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-md border-2 border-card bg-surface-sunken px-1">
          <Text
            className="font-mono text-[9px] font-bold text-muted"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {`+${rest}`}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

/**
 * Pill de un grupo de porciones en el strip del pie: punto con el color de identidad del grupo
 * (el del catálogo, vía `exchangeGroupColor` — NO es un color de macro) + nombre + «×n».
 * Presentación pura: quien edita las porciones sigue siendo `EditablePortionsSection`.
 */
function PortionGroupPill({ target, sortOrder }: { target: QePortionTarget; sortOrder: number }) {
  const portions = target.portions.trim()
  return (
    <View className="max-w-[192px] flex-row items-center gap-1.5 rounded-pill border border-subtle bg-surface-card px-2 py-0.5">
      <View
        className="h-2.5 w-2.5 shrink-0 rounded-xs"
        style={{ backgroundColor: exchangeGroupColor({ color: target.color, sortOrder }) }}
      />
      <Text className="min-w-0 shrink text-[11px] font-semibold text-body" numberOfLines={1}>
        {target.groupName}
      </Text>
      {portions !== '' ? (
        <Text
          className="shrink-0 font-mono text-[11px] font-semibold text-body"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {`×${portions}`}
        </Text>
      ) : null}
    </View>
  )
}
