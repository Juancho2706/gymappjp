import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Animated, LayoutAnimation, Pressable, Text, TextInput, View } from 'react-native'
import type { TextStyle } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { ChevronDown, Minus, Pencil, Plus, StickyNote, Trash2 } from 'lucide-react-native'
import { exchangeGroupColor, type ExchangeGroup } from '@eva/nutrition-engine'
import type { NutritionV2CoachScope, PortionSystem } from '@eva/nutrition-v2'
import { GroupDot as PortionGroupDot } from '../../alumno/nutrition-v2/PortionChip'
import { Sheet } from '../../Sheet'
import { ExchangeGroupFormSheet, type ExchangeGroupFormInitial } from '../ExchangeGroupFormSheet'
import { AddActionButton } from '../AddActionButton'
import { useTheme } from '../../../context/ThemeContext'
import { hexToRgba, resolveEffectiveCoachBrandTheme } from '../../../lib/theme'
import { readableInkOn } from '../../../lib/color-contrast'
import { PORTIONS_COPY } from '../../../lib/nutrition-portions-copy'
import { CoachNoteSheet } from './CoachNoteSheet'
import { QUICK_EDIT_COPY } from './microcopy'
import { NUMERIC_KEYBOARD_ACCESSORY_ID } from '../../KeyboardDoneBar'
import {
  PORTION_MAX,
  PORTION_MIN,
  PORTION_NOTES_MAX,
  comparePickerGroups,
  formatPortionsEsCl,
  parsePortionsValue,
  qeExchangeGroups,
  qeGroupRefLabel,
  qeGroupRefPerPortionFromDict,
  systemOf,
  visibleExchangeGroupsForCoach,
  type QeExchangeGroup,
  type QePortionGroup,
  type QePortionTarget,
} from '@eva/nutrition-v2'

/**
 * Grupo elegible del picker: el `QePortionGroup` compartido + `sortOrder` opcional para el
 * color fallback del circulito (los grupos del catalogo del coach lo traen; los snapshots
 * congelados del read model no — caen al indice 0, solo cosmetico).
 */
export type PortionPickerGroup = QePortionGroup & { sortOrder?: number }

/**
 * Display es-CL de un valor de porciones que viaja como TEXTO en el árbol del editor. El
 * formateador vive en el paquete (`formatPortionsEsCl`, SPEC §10.6): acá solo se parsea el texto
 * crudo y, si no es un número, se devuelve tal cual — mientras el coach tipea "1," el campo no
 * puede borrarle lo que escribió.
 */
function displayPortions(portions: string): string {
  const n = parsePortionsValue(portions)
  return n == null ? portions : formatPortionsEsCl(n)
}

/** Grupo del picker con la marca de set ya resuelta para ESTE coach (§7.1). */
type PickerRow = { group: PortionPickerGroup; legacy: boolean }

/**
 * Las tres secciones del sheet, en el orden del mockup M1. `legacy` puede venir vacía.
 *
 * `sectioned` es el veredicto sobre si la partición chileno/propios es CONOCIDA: sin catálogo
 * vivo no hay forma de saber qué grupo es del sistema, y anunciar «Propios» sobre los 13 grupos
 * chilenos sería peor que no titular. Con `sectioned: false` todo lo no-legado viaja en `chile` y
 * el sheet lo pinta como una sola lista sin encabezados (el legado sí se sigue marcando: esa
 * marca no depende del catálogo).
 */
type PickerSections = {
  chile: PickerRow[]
  own: PickerRow[]
  legacy: PickerRow[]
  sectioned: boolean
}

/**
 * Partición del picker (§7.1, R17): se hace ACÁ, sobre la lista que ya devolvió
 * `mergePortionGroupChoices` —que NO se toca y sigue mandando «plan primero, catálogo después»—,
 * con la MISMA regla de visibilidad que usan la ruta móvil y el picker web
 * (`visibleExchangeGroupsForCoach`) y el orden de `comparePickerGroups`.
 *
 * El adaptador a `ExchangeGroup` existe porque el picker maneja `QePortionGroup`, que no declara
 * `isSystem` ni `code`: se completa con lo que sí sabemos y el resto queda en valores neutros que
 * la función de visibilidad no mira. Duplicar la regla acá en vez de adaptar sería justo lo que
 * §7.3 prohíbe.
 *
 * `systemGroupIds` es la lista de ids que el catálogo vivo marcó `is_system`. `undefined` es
 * «todavía no cargó / no se pudo leer», y es DISTINTO de un set vacío («se leyó y no hay ninguno
 * del sistema»): mientras no cargue, todos los grupos caerían en «Propios» y el coach vería sus
 * 13 grupos chilenos bajo el título equivocado. Por eso ese caso devuelve `sectioned: false` y el
 * sheet no titula nada. Un id AUSENTE de un set ya cargado sí se trata como propio, que es el
 * lado seguro: los custom nunca se filtran por set.
 *
 * `coachSystemKnown` es la MISMA duda por el otro lado: si el borde no pudo leer
 * `coaches.portion_system`, `coachSystem` es el fallback 'cl' inventado acá, no un dato. Con el
 * catálogo cargado pero el set del coach en blanco, los grupos SMAE quedarían sin marca de legado
 * y se pintarían bajo el título «SISTEMA CHILENO», que es afirmar algo que nadie leyó. Ese borde
 * también va sin encabezados.
 */
function partitionPickerGroups(
  groups: readonly PortionPickerGroup[],
  coachSystem: PortionSystem,
  coachSystemKnown: boolean,
  usedSystems: readonly PortionSystem[] | undefined,
  systemGroupIds: ReadonlySet<string> | undefined,
): PickerSections {
  const byId = new Map(groups.map((group) => [group.exchangeGroupId, group]))
  const visible = visibleExchangeGroupsForCoach({
    groups: groups.map((group) => ({
      id: group.exchangeGroupId,
      slug: group.groupCode.toLowerCase(),
      code: group.groupCode,
      name: group.groupName,
      coachId: null,
      teamId: null,
      isSystem: systemGroupIds?.has(group.exchangeGroupId) === true,
      refCalories: group.ref.calories,
      refProteinG: group.ref.proteinG,
      refCarbsG: group.ref.carbsG,
      refFatsG: group.ref.fatsG,
      color: group.color,
      sortOrder: group.sortOrder ?? 0,
      composedOf: group.composedOf,
      macrosConfirmed: group.macrosConfirmed,
      portionSystem: group.portionSystem,
    })),
    coachSystem,
    usedSystems,
  })

  // Sin catálogo vivo —o sin el set del coach— no se sabe qué grupo es del sistema para ESTE
  // coach: la lista va entera y sin títulos.
  const sectioned = systemGroupIds !== undefined && coachSystemKnown
  const sections: PickerSections = { chile: [], own: [], legacy: [], sectioned }
  for (const entry of visible) {
    const group = byId.get(entry.id)
    if (!group) continue
    const row: PickerRow = { group, legacy: entry.legacy }
    if (entry.legacy) sections.legacy.push(row)
    else if (!sectioned || entry.isSystem) sections.chile.push(row)
    else sections.own.push(row)
  }

  const order = (rows: PickerRow[]): PickerRow[] =>
    [...rows].sort((a, b) =>
      comparePickerGroups({ ...a.group, legacy: a.legacy }, { ...b.group, legacy: b.legacy }),
    )
  return {
    chile: order(sections.chile),
    own: order(sections.own),
    legacy: order(sections.legacy),
    sectioned,
  }
}

/**
 * Porciones propias (FD6a) en el quick-edit: la lista del picker es el dict CONGELADO del plan
 * (grupos que ya usa), así que crear/editar/eliminar necesita dos cosas del orquestador —
 * quiénes son los grupos PROPIOS del coach (el dict congelado no lo sabe) y dónde depositar el
 * grupo escrito para que la lista lo refleje sin cerrar el picker. `undefined` = superficie sin
 * administración de grupos: la sección se pinta EXACTAMENTE como antes (cero UI nueva).
 */
export interface QuickEditGroupAdmin {
  scope: NutritionV2CoachScope
  /** Ids de grupos propios del coach; los del sistema no llevan afordancia de edición. */
  ownGroupIds: ReadonlySet<string>
  /** Carga perezosa de la propiedad (se dispara al abrir el picker). Best-effort. */
  ensureLoaded: () => void
  onSaved: (group: ExchangeGroup) => void
  onDeleted: (groupId: string) => void
}

/**
 * Seccion "Porciones a eleccion" del quick-edit RN (SPEC UX-a, T1.4) — espejo movil de
 * `EditablePortionsCard` web, DENTRO de la card de franja bajo "+ Agregar alimento":
 * fila grupo (circulito `exchangeGroupColor` con letra blanca + nombre + stepper 0,5
 * SOLO de botones — jamas teclado numerico, hallazgo M4 — + eliminar con Deshacer via
 * snackbar del orquestador) + nota opcional del target (📝 → `CoachNoteSheet`, SPEC
 * nutrition-coach-notes N2: reemplaza al TextInput inline de T1.4) + altas via Sheet
 * nativeModal (gorhom vetado bajo reanimated 4) con los grupos que el plan YA usa.
 * Plan sin porciones => la seccion NO se pinta (capa invisible, SPEC UX-c).
 */

/**
 * Circulito de identidad del grupo: color del catalogo SOLO aqui, letra blanca (SPEC UX).
 *
 * QA2-B3b: delega en el `GroupDot` del DS de porciones (el mismo que usan
 * `PrescribedPortionChips` / `PortionDayCoverageCard`), que escala la tipografia con el
 * diametro, fija `numberOfLines={1}` y desactiva `allowFontScaling`. La version previa
 * clavaba `text-[10px]` en un circulo de 20px y recortaba el code a 3 letras: un code de
 * 3 ("PRO") ENVOLVIA en dos lineas dentro del circulo. Ahora el code va completo en una
 * sola linea — mismo criterio adaptativo que el `PortionsGroupDot` del builder web.
 */
function GroupDot({
  group,
  sortOrder,
}: {
  group: { groupCode: string; color: string | null }
  sortOrder: number
}) {
  return (
    <PortionGroupDot
      code={group.groupCode}
      color={exchangeGroupColor({ color: group.color, sortOrder })}
      size={20}
    />
  )
}

/**
 * Estilo del campo numérico del stepper. OBJETO estático, jamás función junto a `className`
 * (css-interop descartaría el `className` entero). Mismas métricas que `QuantityStepper`:
 * `includeFontPadding: false` + `paddingVertical: 0` + `textAlignVertical` centran la línea en
 * Android dentro de la caja de 44 pt, y las cifras tabulares evitan que el ancho baile al teclear.
 */
const portionsInputStyle: TextStyle = {
  includeFontPadding: false,
  fontVariant: ['tabular-nums'],
  paddingVertical: 0,
  textAlignVertical: 'center',
}

/**
 * Stepper de porciones con TAP-TO-EDIT (M3, §7.3): botones −/+ de 44 pt y un `TextInput`
 * **siempre montado** —calcado de `QuantityStepper.tsx:91-109`— en vez del `<Text>` que había.
 *
 * El hallazgo M4 que prohibía el teclado numérico era por el swap botón↔input: el árbol cambiaba
 * al enfocar y Fabric lo sufría. Acá el árbol es 100 % estable (ni el wrapper ni el input cambian
 * de clases por foco), que es la forma correcta de dar tap-to-edit en nativo.
 *
 * Mientras el campo tiene el foco se muestra el valor CRUDO del reducer (si no, "1," se
 * convertiría en "1" a mitad de la escritura); al salir se muestra formateado en es-CL. El
 * formateo es de DISPLAY: nunca se reescribe el estado con una coma, porque el texto del árbol es
 * el que viaja al publish.
 */
function PortionsStepper({
  targetKey,
  groupName,
  portions,
  disabled,
  editing,
  onEditingChange,
  onStep,
  onSetValue,
}: {
  targetKey: string
  groupName: string
  /** Texto del arbol compartido ("2", "1.5"); el guard usa el numero parseado. */
  portions: string
  disabled: boolean
  editing: boolean
  onEditingChange: (editing: boolean) => void
  onStep: (direction: 1 | -1) => void
  onSetValue: (targetKey: string, value: string) => void
}) {
  const { theme } = useTheme()
  const numeric = parsePortionsValue(portions) ?? 0
  const canDecrement = !disabled && numeric > PORTION_MIN
  const canIncrement = !disabled && numeric < PORTION_MAX
  return (
    <View className="h-11 flex-row items-center gap-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={PORTIONS_COPY.builder.stepDownAria(groupName)}
        disabled={!canDecrement}
        onPress={() => onStep(-1)}
        className={`h-11 w-11 items-center justify-center rounded-control border border-default bg-surface-card ${canDecrement ? '' : 'opacity-40'}`}
      >
        <Minus color={theme.foreground} size={16} />
      </Pressable>
      <TextInput
        accessibilityLabel={`Porciones de ${groupName}`}
        value={editing ? portions : displayPortions(portions)}
        onChangeText={(value) => onSetValue(targetKey, value)}
        onFocus={() => onEditingChange(true)}
        onBlur={() => onEditingChange(false)}
        editable={!disabled}
        keyboardType="decimal-pad"
        // Cerrar el teclado: iOS no trae tecla de retorno en el decimal-pad y cuelga la barra
        // «Listo» que la pantalla ya monta (`QuickEditMode`); Android usa su tecla ✓. El stepper
        // vive en el LIENZO, no dentro de un Sheet, así que el accessory resuelve sin montar nada.
        inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
        returnKeyType="done"
        selectTextOnFocus
        className="h-11 w-12 rounded-control border border-default bg-surface-card text-center text-base font-semibold text-strong"
        style={portionsInputStyle}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={PORTIONS_COPY.builder.stepUpAria(groupName)}
        disabled={!canIncrement}
        onPress={() => onStep(1)}
        className={`h-11 w-11 items-center justify-center rounded-control border border-default bg-surface-card ${canIncrement ? '' : 'opacity-40'}`}
      >
        <Plus color={theme.foreground} size={16} />
      </Pressable>
    </View>
  )
}

/** Duración del resalte de la fila tras un bump (§7.4). */
const BUMP_HIGHLIGHT_MS = 1200

/** Duración del plegado de la sección legado del picker (mismo número que el de la franja). */
const LEGACY_COLLAPSE_MS = 220

function PortionTargetRow({
  target,
  index,
  sortOrder,
  brandColor,
  disabled,
  error,
  highlightNonce,
  onStep,
  onSetValue,
  onSetNotes,
  onRemove,
}: {
  target: QePortionTarget
  index: number
  sortOrder: number
  /** Marca REAL del coach para el tinte con-nota del 📝 (ver nota en `EditableSlotCard`). */
  brandColor: string
  disabled: boolean
  /** `errors['portion.<key>.portions']` del reducer; null = fila sin error. */
  error: string | null
  /**
   * Contador que cambia cada vez que ESTA fila recibió un bump desde el picker. Es un nonce y no
   * un booleano a propósito: dos bumps seguidos al mismo grupo tienen que volver a disparar el
   * resalte, y un booleano que ya está en `true` no cambia.
   */
  highlightNonce: number
  onStep: (targetKey: string, direction: 1 | -1) => void
  onSetValue: (targetKey: string, value: string) => void
  onSetNotes: (targetKey: string, value: string) => void
  onRemove: (target: QePortionTarget, index: number) => void
}) {
  const { theme } = useTheme()
  // Nota del grupo en sheet (SPEC nutrition-coach-notes N2, espejo del QeBottomSheet web N-B):
  // reemplaza el TextInput inline de T1.4 — el textarea + contador + limpiar viven en la hoja
  // y la fila solo delata la nota por el tinte de marca del 📝. Solo la VISIBILIDAD es local;
  // el texto sigue viajando por `SET_PORTION_NOTES` como siempre (misma gramatica, N5).
  const [noteOpen, setNoteOpen] = useState(false)
  const hasNote = (target.notes ?? '').trim() !== ''
  // Tap-to-edit (M3): mientras el campo tiene el foco la fila muestra el valor crudo y cambia el
  // subtítulo por la ayuda del rango. Solo VISUAL: el texto vive en el árbol del editor.
  const [editing, setEditing] = useState(false)

  /**
   * Resalte del bump (§7.4): `Animated` del core —el quick-edit no usa reanimated— del primary al
   * 12 % hasta transparente en 1,2 s. `useNativeDriver: false` porque `backgroundColor` no lo
   * soporta. Con reduced motion del sistema NO hay animación: la fila no parpadea y el aviso lo
   * da el toast, que sigue apareciendo igual.
   */
  const reduceMotion = useReducedMotion()
  const [highlight] = useState(() => new Animated.Value(0))
  const highlightColor = highlight.interpolate({
    inputRange: [0, 1],
    outputRange: [hexToRgba(theme.primary, 0), hexToRgba(theme.primary, 0.12)],
  })
  useEffect(() => {
    if (highlightNonce === 0) return
    if (reduceMotion) {
      highlight.setValue(0)
      return
    }
    highlight.setValue(1)
    const animation = Animated.timing(highlight, {
      toValue: 0,
      duration: BUMP_HIGHLIGHT_MS,
      useNativeDriver: false,
    })
    animation.start()
    return () => animation.stop()
  }, [highlightNonce, reduceMotion, highlight])

  return (
    // El `className` va en el View de afuera y el color animado en el `Animated.View` de adentro:
    // css-interop mapea `className` a `style` en los componentes del kit, no en los envoltorios de
    // `Animated`, así que una clase colgada del animado no pintaría nada.
    <View className="overflow-hidden rounded-control">
      <Animated.View style={{ backgroundColor: highlightColor }}>
        <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <GroupDot group={target} sortOrder={sortOrder} />
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-medium text-strong" numberOfLines={1}>
              {target.groupName}
            </Text>
            {editing ? (
              // Mientras se tipea la fila explica el rango en vez de repetir el estado del grupo:
              // el error de validación llega recién al salir, y esto lo previene.
              <Text className="text-[10px] font-medium text-muted" numberOfLines={1}>
                {PORTIONS_COPY.builder.stepperEditHint}
              </Text>
            ) : !target.macrosConfirmed ? (
              <Text className="text-[10px] font-semibold text-warning-700" numberOfLines={1}>
                {PORTIONS_COPY.builder.referentialBadge}
              </Text>
            ) : null}
          </View>
        </View>
        {/* Stepper de ancho fijo (SPEC UX-a: el nombre trunca, el stepper nunca se comprime). */}
        <PortionsStepper
          targetKey={target.key}
          groupName={target.groupName}
          portions={target.portions}
          disabled={disabled}
          editing={editing}
          onEditingChange={setEditing}
          onStep={(direction) => onStep(target.key, direction)}
          onSetValue={onSetValue}
        />
        {/* CON nota el 📝 se tiñe con la marca y la tinta la pone `readableInkOn` (mismo patrón
            de contraste que el 📝 del header de la franja); SIN nota queda apagado como siempre.
            `style` objeto estático, jamás función (gotcha css-interop). */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={PORTIONS_COPY.builder.noteFor(target.groupName)}
          disabled={disabled}
          onPress={() => setNoteOpen(true)}
          hitSlop={6}
          className="h-11 w-8 items-center justify-center rounded-control"
          style={hasNote ? { backgroundColor: brandColor } : undefined}
        >
          <StickyNote color={hasNote ? readableInkOn(brandColor) : theme.mutedForeground} size={16} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Quitar porciones de ${target.groupName}`}
          disabled={disabled}
          onPress={() => onRemove(target, index)}
          hitSlop={6}
          className="h-11 w-8 items-center justify-center rounded-control"
        >
          <Trash2 color={theme.destructive} size={16} />
        </Pressable>
      </View>
      <CoachNoteSheet
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        title={PORTIONS_COPY.builder.noteFor(target.groupName)}
        hint={QUICK_EDIT_COPY.groupNoteHint}
        value={target.notes ?? ''}
        maxLength={PORTION_NOTES_MAX}
        placeholder={PORTIONS_COPY.builder.notePlaceholder}
        disabled={disabled}
        onChange={(value) => onSetNotes(target.key, value)}
      />
      {/* Error de validación de la cantidad, BAJO la fila (§7.3). La clave ya viaja al chip del
          día y a PublishBar sin tocar la capa de validación: acá solo se muestra. */}
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          className="mt-1 pl-7 text-xs font-medium text-danger-600"
        >
          {error}
        </Text>
      ) : null}
      </Animated.View>
    </View>
  )
}

/** Encabezado «eyebrow» de sección del picker (M1): mono, 10 px, versalitas. */
/**
 * Encabezado de sección del picker. Va FIJO (`stickyHeaderIndices` del `Sheet`), así que lleva
 * fondo OPACO —`bg-surface-card`, el mismo del sheet— por contrato: sin él las filas se leerían a
 * través del título al hacer scroll.
 */
function PickerSectionHeader({ label }: { label: string }) {
  return (
    <Text className="bg-surface-card px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted">
      {label}
    </Text>
  )
}

/**
 * Fila del picker. Tres estados y ningún otro (§7.1):
 *  - LIBRE: subtítulo con «1 porción = …» ya EXPANDIDO (`qeGroupRefPerPortion`, D5) — es el fix
 *    que hace que Legumbres deje de decir «0 kcal».
 *  - YA USADA (D2-A): sigue tocable, con fondo `bg-primary/10` y subtítulo en color de marca que
 *    dice QUÉ VA A PASAR («Toca para sumar ½»), no solo el estado. Antes estaba `disabled` y con
 *    `opacity-50`: el coach que quería más porciones de un grupo se topaba con una lista muerta.
 *  - EN EL TOPE (99): único caso que sigue `disabled`, con `groupAtMax` y sin toast.
 */
function GroupPickerRow({
  group,
  legacy,
  groupsDict,
  usedTarget,
  slotName,
  brandColor,
  own,
  onPick,
  onEdit,
}: {
  group: PortionPickerGroup
  legacy: boolean
  /**
   * Diccionario YA armado del picker completo: contra él se expanden los compuestos. Llega hecho
   * y no como lista porque esta fila se pinta N veces por apertura y rearmarlo acá es N×N.
   */
  groupsDict: QeExchangeGroup[]
  usedTarget: QePortionTarget | undefined
  slotName: string
  brandColor: string
  own: boolean
  onPick: (group: PortionPickerGroup) => void
  onEdit: (group: PortionPickerGroup) => void
}) {
  const { theme } = useTheme()
  const usedPortions = usedTarget ? (parsePortionsValue(usedTarget.portions) ?? 0) : 0
  const used = usedTarget != null
  const atMax = used && usedPortions >= PORTION_MAX
  const subtitle = atMax
    ? PORTIONS_COPY.builder.groupAtMax(slotName)
    : used
      ? PORTIONS_COPY.builder.groupUsedBump(slotName, formatPortionsEsCl(usedPortions), 'rn')
      : qeGroupRefLabel(qeGroupRefPerPortionFromDict(group, groupsDict), {
          confirmed: group.macrosConfirmed,
        })

  return (
    <View className="flex-row items-center gap-1">
      <Pressable
        accessibilityRole="button"
        // Dice qué va a pasar, no solo el estado: es el criterio de a11y de W2.4.
        accessibilityLabel={`${group.groupName}: ${subtitle}`}
        accessibilityState={{ disabled: atMax }}
        disabled={atMax}
        onPress={() => onPick(group)}
        className={`min-h-12 min-w-0 flex-1 flex-row items-center gap-3 rounded-control px-2 py-2 ${
          atMax ? 'opacity-50' : used ? 'bg-primary/10 active:bg-surface-sunken' : 'active:bg-surface-sunken'
        }`}
      >
        <GroupDot group={group} sortOrder={group.sortOrder ?? 0} />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text className="shrink text-sm font-semibold text-strong" numberOfLines={1}>
              {group.groupName}
            </Text>
            {/* El set chileno viene con `macros_confirmed`: no lleva chip. El viejo lo cambia por
                «Legado (SMAE)» —mismas clases del chip ámbar— y los propios del coach siguen con
                «Valores referenciales», que es lo que son. */}
            {legacy || !group.macrosConfirmed ? (
              <View className="shrink-0 rounded-pill border border-warning-500/30 bg-warning-500/10 px-1.5 py-px">
                <Text className="text-[10px] font-semibold text-warning-700">
                  {legacy ? PORTIONS_COPY.builder.legacyBadge : PORTIONS_COPY.builder.referentialBadge}
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            className="text-xs text-muted"
            numberOfLines={1}
            // Color de MARCA solo en la fila viva que invita a sumar (objeto estático, jamás
            // función junto al className).
            style={used && !atMax ? { color: brandColor } : undefined}
          >
            {subtitle}
          </Text>
        </View>
      </Pressable>
      {own ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={PORTIONS_COPY.groupEditor.manageAria(group.groupName)}
          onPress={() => onEdit(group)}
          hitSlop={4}
          className="h-11 w-11 items-center justify-center rounded-control"
        >
          <Pencil color={theme.mutedForeground} size={16} />
        </Pressable>
      ) : null}
    </View>
  )
}

/**
 * Bottom sheet de altas (nativeModal), ahora en TRES SECCIONES (M1, §7.1): «Sistema chileno ·
 * INTA 1999 · UDD 2019», «Propios» y «Legado (SMAE)» colapsable, que solo existe si el coach
 * todavía tiene grupos del set viejo.
 *
 * La partición se hace acá, sobre la lista que YA mergeó `mergePortionGroupChoices` (que no se
 * toca y sigue devolviendo «plan primero, catálogo después»), con `visibleExchangeGroupsForCoach`
 * + `comparePickerGroups`. Sin esto, para el coach al que apunta el tren —el que ya tiene un plan
 * SMAE— sus grupos legados se anteponen a los 13 chilenos por más que se ordene el catálogo.
 *
 * Porciones propias (FD6a, solo con `groupAdmin`): al final va "+ Crear grupo nuevo" y cada fila
 * PROPIA lleva su afordancia de opciones. Ambas abren el `ExchangeGroupFormSheet`, montado DENTRO
 * de este sheet a proposito (dos `Modal` hermanos no apilan bien en iOS): al guardar, la lista se
 * refresca en el acto sin cerrar el picker. La escritura va SIEMPRE por
 * `/api/mobile/nutrition/exchanges/groups`, nunca por Supabase directo.
 */
function GroupPickerSheet({
  open,
  onClose,
  groups,
  usedTargets,
  slotName,
  brandColor,
  coachSystem,
  coachSystemKnown,
  usedSystems,
  systemGroupIds,
  legacyPlanCount,
  onPick,
  groupAdmin,
}: {
  open: boolean
  onClose: () => void
  groups: PortionPickerGroup[]
  /** Targets de ESTA franja por `exchangeGroupId`: quién está usada y con cuántas porciones. */
  usedTargets: ReadonlyMap<string, QePortionTarget>
  slotName: string
  brandColor: string
  coachSystem: PortionSystem
  /** ¿`coachSystem` es un dato leído o el fallback 'cl'? Ver `partitionPickerGroups`. */
  coachSystemKnown: boolean
  usedSystems: readonly PortionSystem[] | undefined
  systemGroupIds: ReadonlySet<string> | undefined
  /** `undefined` = nadie sabe cuántos planes: el copy omite el conteo en vez de inventarlo. */
  legacyPlanCount: number | undefined
  onPick: (group: PortionPickerGroup) => void
  groupAdmin?: QuickEditGroupAdmin
}) {
  const { theme } = useTheme()
  const [formOpen, setFormOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<ExchangeGroupFormInitial | null>(null)
  /**
   * Sección legado colapsada por defecto: el coach que ya migró no tiene por qué ver nueve filas
   * viejas antes de las suyas. Estado local sin persistencia (mismo criterio que el plegado de la
   * franja).
   */
  const [legacyOpen, setLegacyOpen] = useState(false)
  const reduceMotion = useReducedMotion()

  const sections = useMemo(
    () => partitionPickerGroups(groups, coachSystem, coachSystemKnown, usedSystems, systemGroupIds),
    [groups, coachSystem, coachSystemKnown, usedSystems, systemGroupIds],
  )

  /**
   * Diccionario de grupos para expandir los compuestos (LEG = 1P + 1C) en la etiqueta de cada
   * fila. Se arma UNA vez por apertura del sheet: `qeGroupRefPerPortion` lo reconstruía por fila
   * —22 veces con el set chileno completo— y el paquete expone `qeGroupRefPerPortionFromDict`
   * justo para que el consumidor memoice el dict, tal como dice su JSDoc.
   */
  const groupsDict = useMemo(() => qeExchangeGroups(groups), [groups])

  const openEditor = (group: PortionPickerGroup) => {
    setEditingGroup({
      id: group.exchangeGroupId,
      name: group.groupName,
      code: group.groupCode,
      refCalories: group.ref.calories,
      refProteinG: group.ref.proteinG,
      refCarbsG: group.ref.carbsG,
      refFatsG: group.ref.fatsG,
      color: group.color,
    })
    setFormOpen(true)
  }

  const renderRow = (row: PickerRow) => (
    <GroupPickerRow
      key={row.group.exchangeGroupId}
      group={row.group}
      legacy={row.legacy}
      groupsDict={groupsDict}
      usedTarget={usedTargets.get(row.group.exchangeGroupId)}
      slotName={slotName}
      brandColor={brandColor}
      own={groupAdmin?.ownGroupIds.has(row.group.exchangeGroupId) === true}
      onPick={onPick}
      onEdit={openEditor}
    />
  )

  const toggleLegacy = () => {
    if (!reduceMotion) {
      LayoutAnimation.configureNext(
        LayoutAnimation.create(
          LEGACY_COLLAPSE_MS,
          LayoutAnimation.Types.easeInEaseOut,
          LayoutAnimation.Properties.opacity,
        ),
      )
    }
    setLegacyOpen((prev) => !prev)
  }

  /**
   * Cuerpo del sheet como lista PLANA de hijos directos del scroll: `stickyHeaderIndices` fija por
   * índice de hijo directo, así que los encabezados no pueden ir envueltos (§7.1 los pide fijos —
   * 13 + 9 + propios no caben en el viewport de un 70 % y al hacer scroll se perdía de qué sección
   * era cada fila). El scroll del `Sheet` separa hijos con `gap: 14`, que es la separación que
   * queremos ENTRE secciones; cada bloque de filas la compensa con `marginTop: -10` para quedar
   * pegado a su encabezado (neto 4 px, el mismo `gap-1` de antes).
   */
  const body: ReactNode[] = []
  const stickyIndices: number[] = []
  const pushSticky = (node: ReactNode) => {
    stickyIndices.push(body.length)
    body.push(node)
  }
  const pushRows = (key: string, rows: PickerRow[], underHeader: boolean) => {
    body.push(
      <View key={key} className="gap-1" style={underHeader ? { marginTop: -10 } : undefined}>
        {rows.map(renderRow)}
      </View>,
    )
  }

  if (sections.chile.length > 0) {
    // Sin catálogo vivo (`sectioned: false`) no se titula nada: la lista va entera, sin mentir
    // sobre qué grupo es del sistema y cuál es propio.
    if (sections.sectioned) {
      pushSticky(<PickerSectionHeader key="sec-chile" label={PORTIONS_COPY.builder.setChile} />)
    }
    pushRows('rows-chile', sections.chile, sections.sectioned)
  }

  if (sections.own.length > 0) {
    pushSticky(<PickerSectionHeader key="sec-own" label={PORTIONS_COPY.builder.setOwn} />)
    pushRows('rows-own', sections.own, true)
  }

  // La sección legado SOLO existe si quedan grupos del set viejo: al coach que ya migró el picker
  // no le muestra ni el encabezado.
  if (sections.legacy.length > 0) {
    pushSticky(
      <Pressable
        key="sec-legacy"
        accessibilityRole="button"
        accessibilityLabel={PORTIONS_COPY.builder.setLegacy(legacyPlanCount)}
        accessibilityState={{ expanded: legacyOpen }}
        onPress={toggleLegacy}
        className="min-h-11 flex-row items-center gap-2 rounded-control bg-surface-card px-2 py-1 active:bg-surface-sunken"
      >
        <Text className="min-w-0 flex-1 font-mono text-[10px] uppercase tracking-widest text-muted">
          {PORTIONS_COPY.builder.setLegacy(legacyPlanCount)}
        </Text>
        <ChevronDown
          color={theme.mutedForeground}
          size={16}
          // El chevron apunta a la derecha cuando la sección está cerrada: mismo lenguaje
          // que el plegado de la franja. Estilo objeto, nunca función.
          style={legacyOpen ? undefined : { transform: [{ rotate: '-90deg' }] }}
        />
      </Pressable>,
    )
    if (legacyOpen) pushRows('rows-legacy', sections.legacy, true)
  }

  if (groupAdmin) {
    body.push(
      <Pressable
        key="create-group"
        accessibilityRole="button"
        accessibilityLabel={PORTIONS_COPY.groupEditor.createRow}
        onPress={() => {
          setEditingGroup(null)
          setFormOpen(true)
        }}
        className="min-h-12 flex-row items-center gap-3 rounded-control border border-dashed border-default px-2 py-2 active:bg-surface-sunken"
      >
        <View className="h-5 w-5 items-center justify-center rounded-full border border-dashed border-primary/60">
          <Plus color={theme.primary} size={12} />
        </View>
        <Text className="text-sm font-semibold text-primary">{PORTIONS_COPY.groupEditor.createRow}</Text>
      </Pressable>,
    )
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      nativeModal
      snapPoints={['70%']}
      title={PORTIONS_COPY.builder.addGroup}
      accessibilityLabel={PORTIONS_COPY.builder.addGroup}
      stickyHeaderIndices={stickyIndices}
    >
      {body}

      {groupAdmin ? (
        <ExchangeGroupFormSheet
          open={formOpen}
          initial={editingGroup}
          scope={groupAdmin.scope}
          onClose={() => setFormOpen(false)}
          onSaved={groupAdmin.onSaved}
          onDeleted={groupAdmin.onDeleted}
        />
      ) : null}
    </Sheet>
  )
}

export function EditablePortionsSection({
  targets,
  groups,
  slotName,
  disabled = false,
  errors,
  coachSystem,
  usedSystems,
  systemGroupIds,
  legacyPlanCount,
  bumpedGroupId = null,
  bumpNonce = 0,
  onStep,
  onSetValue,
  onSetNotes,
  onRemove,
  onAdd,
  onBumpGroup,
  onConvertPress,
  groupAdmin,
}: {
  targets: QePortionTarget[]
  groups: PortionPickerGroup[]
  /** Nombre de la franja: los copys del bump lo dicen («Ya está en Desayuno con 2 · …»). */
  slotName: string
  disabled?: boolean
  /** Errores del reducer; se lee `portion.<targetKey>.portions`. */
  errors?: Record<string, string>
  /**
   * Set del coach (`coaches.portion_system`) y sets con targets vivos en OTROS planes suyos. Los
   * dos llegan del borde (`fetchNutritionV2ExchangeGroups`) y son OPCIONALES: sin ellos el picker
   * cae al fail-open del motor —muestra todo, no marca nada como legado— en vez de esconder un
   * grupo que la pauta del coach usa.
   */
  coachSystem?: PortionSystem | null
  usedSystems?: readonly PortionSystem[]
  /**
   * Ids que el catálogo vivo marcó `is_system`. Un id ausente se trata como PROPIO, que es el lado
   * seguro: los custom nunca se filtran por set.
   */
  systemGroupIds?: ReadonlySet<string>
  /**
   * `n` del encabezado «Legado (SMAE) · Lo usas en {n} planes». Ausente ⇒ el encabezado se queda
   * en «Legado (SMAE) · Toca para ver»: hoy NADIE sabe el conteo (el borde manda una lista de
   * sets, no de planes) y el «1» que se pasaba antes le imprimía «Lo usas en 1 planes» a todo
   * coach con set viejo.
   */
  legacyPlanCount?: number
  /** Grupo que acaba de recibir un bump (resalte de su fila) y nonce que lo redispara. */
  bumpedGroupId?: string | null
  bumpNonce?: number
  onStep: (targetKey: string, direction: 1 | -1) => void
  /** Tap-to-edit del stepper (M3): texto CRUDO hacia `SET_PORTION_TARGET`. */
  onSetValue: (targetKey: string, value: string) => void
  onSetNotes: (targetKey: string, value: string) => void
  onRemove: (target: QePortionTarget, index: number) => void
  onAdd: (group: PortionPickerGroup) => void
  /**
   * Tocar en el picker un grupo que la franja YA tiene (D2-A). Ausente = comportamiento previo
   * (la fila usada no hace nada). El bump lo resuelve el padre por `exchangeGroupId`: este
   * componente no toca el merge ni conoce el `targetKey`.
   */
  onBumpGroup?: (exchangeGroupId: string) => void
  /**
   * Carcasa del banner del plan legado (colisión W2/W3 declarada en TASKS): sin este handler el
   * banner NO se monta, así que hasta que W3 lo cablee no hay nada visible.
   */
  onConvertPress?: () => void
  /** Porciones propias (FD6a). Ausente = picker sin altas/edición de grupos (comportamiento previo). */
  groupAdmin?: QuickEditGroupAdmin
}) {
  const { branding } = useTheme()
  // Marca real del coach para el acento de la pastilla (ver nota en `EditableSlotCard`).
  const brandColor = resolveEffectiveCoachBrandTheme(branding).brandColor
  const [pickerOpen, setPickerOpen] = useState(false)
  /** «Ahora no» del banner legado: oculta la carcasa por lo que dure la sesión de edición. */
  const [convertDismissed, setConvertDismissed] = useState(false)
  /**
   * Un solo pick por apertura del sheet. En Android dos taps en el mismo frame despachaban dos
   * veces antes de que el `Modal` terminara de cerrarse; el ref se resetea en `onClose`.
   */
  const pickedRef = useRef(false)

  // Set efectivo del coach: sin dato, el default de la columna ('cl'), igual que el motor. El
  // flag guarda si eso fue un DATO o el fallback: el picker no titula secciones sobre un invento.
  const coachSystemKnown = coachSystem === 'smae' || coachSystem === 'cl'
  const effectiveSystem: PortionSystem = coachSystem === 'smae' ? 'smae' : 'cl'

  const usedTargets = useMemo(
    () => new Map(targets.map((target) => [target.exchangeGroupId, target])),
    [targets],
  )
  const groupOrder = useMemo(
    () => new Map(groups.map((group) => [group.exchangeGroupId, group.sortOrder ?? 0])),
    [groups],
  )
  /**
   * ¿Este plan prescribe porciones del set viejo? Se mira lo PRESCRITO, no el catálogo: el banner
   * habla del plan, no de lo que el coach podría elegir. `systemOf` cae al set del coach cuando el
   * snapshot congelado no guarda el set, así que un grupo sin dato nunca dispara el banner.
   */
  const planUsesLegacy = useMemo(
    () =>
      targets.some((target) => {
        const group = groups.find((g) => g.exchangeGroupId === target.exchangeGroupId)
        return systemOf(group ?? { groupCode: target.groupCode }, effectiveSystem) !== effectiveSystem
      }),
    [targets, groups, effectiveSystem],
  )

  // Plan sin capa de porciones: CERO UI nueva (SPEC UX-c). Los grupos elegibles derivan
  // del read model, asi que un plan sin targets nunca pinta esta seccion.
  if (groups.length === 0 && targets.length === 0) return null

  return (
    <View className="mt-3 border-t border-subtle pt-3">
      <Text className="text-sm font-medium text-strong">{PORTIONS_COPY.builder.sectionTitle}</Text>
      <Text className="mt-0.5 text-xs text-muted">{PORTIONS_COPY.builder.sectionHint}</Text>

      {/* Carcasa del banner del plan legado (W2.4). Se monta SOLO si llega `onConvertPress` —lo
          cablea W3.6— y el plan realmente usa SMAE. Antes de eso no hay nada que ver. */}
      {onConvertPress && planUsesLegacy && !convertDismissed ? (
        <View className="mt-2 gap-2 rounded-card border border-subtle bg-surface-card p-3">
          <Text className="text-sm font-semibold text-strong">{PORTIONS_COPY.convert.bannerTitle}</Text>
          <Text className="text-xs leading-4 text-muted">{PORTIONS_COPY.convert.bannerBody}</Text>
          <View className="flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={PORTIONS_COPY.convert.bannerCta}
              disabled={disabled}
              onPress={onConvertPress}
              className="min-h-11 items-center justify-center rounded-control bg-primary px-3 active:opacity-80"
            >
              <Text className="text-sm font-semibold text-white">{PORTIONS_COPY.convert.bannerCta}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={PORTIONS_COPY.convert.bannerDismiss}
              onPress={() => setConvertDismissed(true)}
              className="min-h-11 items-center justify-center rounded-control px-3 active:bg-surface-sunken"
            >
              <Text className="text-sm font-semibold text-muted">{PORTIONS_COPY.convert.bannerDismiss}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {targets.length > 0 ? (
        <View className="mt-2 gap-2">
          {targets.map((target, index) => (
            <PortionTargetRow
              key={target.key}
              target={target}
              index={index}
              sortOrder={groupOrder.get(target.exchangeGroupId) ?? 0}
              brandColor={brandColor}
              disabled={disabled}
              error={errors?.[`portion.${target.key}.portions`] ?? null}
              highlightNonce={bumpedGroupId === target.exchangeGroupId ? bumpNonce : 0}
              onStep={onStep}
              onSetValue={onSetValue}
              onSetNotes={onSetNotes}
              onRemove={onRemove}
            />
          ))}
        </View>
      ) : null}

      {groups.length > 0 || groupAdmin ? (
        // «Familia N» (T3.v Cabina): misma pastilla de alta que el resto del editor. El handler
        // (carga perezosa de los grupos propios + apertura del picker) es el de siempre.
        <AddActionButton
          variant="neutral"
          icon="porciones"
          label={PORTIONS_COPY.builder.addGroup}
          brandColor={brandColor}
          disabled={disabled}
          onPress={() => {
            groupAdmin?.ensureLoaded()
            // Cada apertura empieza limpia: el sheet se cierra desde `onPick` sin pasar por
            // `onClose`, así que resetear solo allá dejaría el picker mudo la segunda vez.
            pickedRef.current = false
            setPickerOpen(true)
          }}
          className="mt-2 self-start"
        />
      ) : null}

      <GroupPickerSheet
        open={pickerOpen}
        onClose={() => {
          pickedRef.current = false
          setPickerOpen(false)
        }}
        groups={groups}
        usedTargets={usedTargets}
        slotName={slotName}
        brandColor={brandColor}
        coachSystem={effectiveSystem}
        coachSystemKnown={coachSystemKnown}
        usedSystems={usedSystems}
        systemGroupIds={systemGroupIds}
        legacyPlanCount={legacyPlanCount}
        groupAdmin={groupAdmin}
        onPick={(group) => {
          // Doble tap en el mismo frame (Android): el `Modal` tarda en cerrarse y el segundo tap
          // llegaba a despachar. Se resetea al cerrar el sheet.
          if (pickedRef.current) return
          pickedRef.current = true
          setPickerOpen(false)
          // Grupo YA presente en la franja: NO se agrega (el guard de unicidad de
          // `ADD_PORTION_TARGET` sigue vivo) — se avisa al padre, que hace el bump por grupo.
          if (usedTargets.has(group.exchangeGroupId)) {
            onBumpGroup?.(group.exchangeGroupId)
            return
          }
          onAdd(group)
        }}
      />
    </View>
  )
}
