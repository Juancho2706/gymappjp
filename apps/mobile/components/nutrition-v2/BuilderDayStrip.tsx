import { useEffect, useState } from 'react'
import { Alert, Pressable, Text, TextInput, View, type TextStyle } from 'react-native'
import { Copy, MoreVertical, Pencil, Sliders, Trash2 } from 'lucide-react-native'
import {
  NUTRITION_DAY_LABELS,
  NUTRITION_DAY_SHORT_LABELS,
  formatNutritionCalories,
  formatNutritionDayOfWeek,
  formatNutritionPlanDowCalories,
} from '@eva/nutrition-v2'
import { Sheet } from '../Sheet'
import { PlanDowSelector } from './PlanDowSelector'
import { useTheme } from '../../context/ThemeContext'
import type { BuilderDayCell, BuilderTargets, BuilderVariant } from '../../lib/nutrition-v2-builder'

/**
 * Selector de día del CREADOR RN — "tocas el DÍA, no la variante" (SPEC nutrition-ui-poda punto
 * 10, mockup aprobado `selector-dias`). Reemplaza la barra de pastillas de variantes
 * (`BuilderDayVariantBar`) y su "+ Agregar día".
 *
 * El strip de 7 celdas es el `PlanDowSelector` COMPARTIDO con la ficha (mismas celdas, misma
 * leyenda, mismo formato de kcal y la misma etiqueta accesible): acá se le agrega lo que solo tiene
 * sentido editando —
 *  1. **Barra de contexto** del día elegido. Heredado ⇒ borde discontinuo + "Estás editando el Día
 *     base" + los días que comparten ese contenido + CTA "Personalizar el {día}" (crea la variante
 *     COPIANDO el base, con la primitiva de duplicar que ya existía). Propio ⇒ nombre + kcal contra
 *     su meta + menú ⋮.
 *  2. **Menú del día** (sheet): Renombrar · Objetivos propios · Copiar a otros días · Eliminar día
 *     (eliminar = ese día vuelve a heredar el base). El día base no tiene menú: su nombre es fijo y
 *     sus metas son las del paso "El plan".
 *  3. **Puerta del día base huérfano**: con los 7 días propios ninguna celda representa al base,
 *     que igual se publica — hay que poder abrirlo para corregirlo.
 *
 * Gate Pro: personalizar un día publica una segunda variante (`multi_variant`), así que el CTA
 * lleva candado para el coach BASE. La barrera REAL es el servidor; esto solo evita el callejón.
 *
 * Sin diálogos nativos para elegir: todo por `Sheet nativeModal` (gorhom vetado bajo reanimated
 * 4, misma decisión que el resto del builder). Colores por tokens + `useTheme()`, jamás un hex.
 * Gotcha del repo: nunca `className` + `style` como FUNCIÓN en el mismo elemento (css-interop
 * descarta el prop) — los `style` de acá son objetos estáticos o del theme.
 */

/** `fontVariant` no tiene utilidad NativeWind: va por `style` ESTÁTICO (nunca función). */
const TABULAR_NUMS: TextStyle = { fontVariant: ['tabular-nums'] }

const MACRO_FIELDS: Array<{ field: keyof BuilderTargets; label: string }> = [
  { field: 'calories', label: 'kcal' },
  { field: 'proteinG', label: 'P (g)' },
  { field: 'carbsG', label: 'C (g)' },
  { field: 'fatsG', label: 'G (g)' },
]

export interface BuilderDayStripHandlers {
  /** Selección del strip. `null` = el día base explícito (los 7 días ya son propios). */
  onSelectDay: (dayOfWeek: number | null) => void
  /** "Personalizar el {día}": crea la variante de ese día copiando el Día base. */
  onPersonalize: (dayOfWeek: number) => void
  onRename: (variantKey: string, label: string) => void
  onSetTargetsMode: (variantKey: string, mode: 'inherit' | 'custom') => void
  onSetVariantTarget: (variantKey: string, field: keyof BuilderTargets, value: string) => void
  /** Copia ESTE día (franjas, alimentos, reemplazos y porciones) a días que todavía heredan. */
  onCopyDayTo: (sourceVariantKey: string, days: number[]) => void
  /** Eliminar el día: vuelve a heredar el Día base. */
  onRemove: (variantKey: string) => void
}

/**
 * QW-2 (H-10) — día de semana de una variante cuando su etiqueta ya NO lo dice. El label por
 * defecto ES el día ("Sábado"), pero renombrarlo a "Día de entrenamiento" borraba toda referencia
 * a qué día aplica. Devuelve el par corto/largo (corto para pintar, largo para el lector de
 * pantalla) solo cuando aporta información nueva: etiqueta automática ⇒ `null` (no se repite
 * "Sábado Sá"), día base ⇒ `null` (no tiene día).
 *
 * PURA: solo lee `label` + `dayOfWeek`; la fuente de verdad sigue siendo el reducer. La etiqueta
 * automática se detecta con el MISMO formateador del paquete que usa `autoVariantLabel`, así el
 * componente no arrastra el lib del builder a runtime.
 */
export function variantDayBadge(variant: {
  label: string
  dayOfWeek: number | null
}): { short: string; long: string } | null {
  if (variant.dayOfWeek == null) return null
  const short = formatNutritionDayOfWeek(variant.dayOfWeek, { short: true })
  const long = formatNutritionDayOfWeek(variant.dayOfWeek)
  if (short == null || long == null) return null
  if (variant.label.trim() === long) return null
  return { short, long }
}

/** "Lu · Ma · Mi · Ju · Vi" — los días que comparten el contenido del Día base. */
function joinShortDays(days: readonly number[]): string {
  return days.map((day) => NUTRITION_DAY_SHORT_LABELS[day]).join(' · ')
}

/** Fila Lu-Do de selección múltiple (destino de "Copiar a otros días"). Chips 44pt. */
function DayPickRow({
  days,
  selected,
  onToggle,
}: {
  /** Solo los días que todavía heredan: un día propio no se pisa desde acá. */
  days: readonly number[]
  selected: readonly number[]
  onToggle: (day: number) => void
}) {
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {days.map((day) => {
        const isOn = selected.includes(day)
        return (
          <Pressable
            key={day}
            accessibilityRole="button"
            accessibilityState={{ selected: isOn }}
            accessibilityLabel={NUTRITION_DAY_LABELS[day]}
            onPress={() => onToggle(day)}
            className={`h-11 min-w-11 items-center justify-center rounded-control border px-2 ${
              isOn ? 'border-primary bg-primary/10' : 'border-default bg-surface-card'
            }`}
          >
            <Text className={`text-sm font-semibold ${isOn ? 'text-primary' : 'text-strong'}`}>
              {NUTRITION_DAY_SHORT_LABELS[day]}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** Fila de acción del menú del día (44pt, icono + texto, variante destructiva). */
function MenuRow({
  icon: Icon,
  label,
  hint,
  destructive,
  disabled,
  onPress,
}: {
  icon: React.ComponentType<{ color?: string; size?: number }>
  label: string
  hint?: string
  destructive?: boolean
  disabled?: boolean
  onPress: () => void
}) {
  const { theme } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-12 flex-row items-center gap-3 rounded-control px-2 py-1.5 ${disabled ? 'opacity-50' : 'active:bg-surface-sunken'}`}
    >
      <Icon color={destructive ? theme.destructive : theme.foreground} size={18} />
      <View className="min-w-0 flex-1">
        <Text className={`text-sm font-medium ${destructive ? 'text-danger-600' : 'text-strong'}`}>{label}</Text>
        {hint ? <Text className="mt-0.5 text-xs leading-4 text-muted">{hint}</Text> : null}
      </View>
    </Pressable>
  )
}

/** Sheet del menú de un día PROPIO (el día base no tiene menú). */
function DayMenuSheet({
  variant,
  freeDays,
  onClose,
  handlers,
}: {
  variant: BuilderVariant
  /** Días que todavía heredan el base: los destinos posibles de "Copiar a otros días". */
  freeDays: readonly number[]
  onClose: () => void
  handlers: BuilderDayStripHandlers
}) {
  const { theme } = useTheme()
  const [panel, setPanel] = useState<'menu' | 'rename' | 'copy'>('menu')
  const [renameDraft, setRenameDraft] = useState(variant.label)
  const [selected, setSelected] = useState<number[]>([])

  // Reabrir el menú (otro día) vuelve al panel raíz con el nombre de ESE día.
  useEffect(() => {
    setPanel('menu')
    setRenameDraft(variant.label)
    setSelected([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant.key])

  const badge = variantDayBadge(variant)
  const dayName = formatNutritionDayOfWeek(variant.dayOfWeek) ?? variant.label
  const lowerDay = dayName.toLocaleLowerCase()
  const custom = variant.targetsMode === 'custom'

  return (
    <Sheet
      open
      onClose={onClose}
      nativeModal
      snapPoints={['58%']}
      title={badge ? `${variant.label} (${badge.long})` : variant.label}
      accessibilityLabel={badge ? `Opciones de ${variant.label}, ${badge.long}` : `Opciones de ${variant.label}`}
    >
      {panel === 'menu' ? (
        <View className="gap-0.5 pb-2">
          <MenuRow icon={Pencil} label="Renombrar" onPress={() => setPanel('rename')} />
          <MenuRow
            icon={Sliders}
            label={custom ? 'Volver a los objetivos base' : 'Objetivos propios'}
            hint={custom ? undefined : `Metas distintas solo para el ${lowerDay}.`}
            onPress={() => {
              handlers.onSetTargetsMode(variant.key, custom ? 'inherit' : 'custom')
              onClose()
            }}
          />
          <MenuRow
            icon={Copy}
            label="Copiar a otros días"
            hint={
              freeDays.length === 0
                ? 'Los demás días ya tienen contenido propio.'
                : 'Copia franjas, alimentos, reemplazos y porciones.'
            }
            disabled={freeDays.length === 0}
            onPress={() => setPanel('copy')}
          />
          <MenuRow
            icon={Trash2}
            label="Eliminar día"
            hint={`El ${lowerDay} volverá a seguir el Día base.`}
            destructive
            onPress={() =>
              Alert.alert(
                `¿Eliminar ${variant.label}?`,
                `El ${lowerDay} volverá a seguir el Día base. Sus franjas, alimentos y porciones propias se descartan; el resto del plan no cambia.`,
                [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Eliminar día',
                    style: 'destructive',
                    onPress: () => {
                      handlers.onRemove(variant.key)
                      onClose()
                    },
                  },
                ],
              )
            }
          />
        </View>
      ) : null}

      {panel === 'rename' ? (
        <View className="gap-3 pb-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-muted">Nombre del día</Text>
          <TextInput
            autoFocus
            accessibilityLabel="Nombre del día"
            value={renameDraft}
            onChangeText={setRenameDraft}
            maxLength={120}
            placeholder="Sábado, Día de entrenamiento…"
            placeholderTextColor={theme.mutedForeground}
            className="min-h-11 rounded-control border border-default bg-surface-card px-3 py-2 text-base text-strong"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Guardar nombre"
            onPress={() => {
              handlers.onRename(variant.key, renameDraft.trim() === '' ? dayName : renameDraft.trim())
              onClose()
            }}
            className="min-h-12 items-center justify-center rounded-control px-4"
            style={{ backgroundColor: theme.primary }}
          >
            <Text className="text-sm font-bold" style={{ color: theme.primaryForeground }}>
              Guardar
            </Text>
          </Pressable>
        </View>
      ) : null}

      {panel === 'copy' ? (
        <View className="gap-3 pb-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-muted">Días destino</Text>
          <DayPickRow
            days={freeDays}
            selected={selected}
            onToggle={(day) =>
              setSelected((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))
            }
          />
          <Text className="text-xs leading-5 text-muted">
            Cada día elegido pasa a tener su propio contenido, copiado de {variant.label}. Los días que ya son
            propios no aparecen acá: elimínalos primero si quieres reemplazarlos.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              selected.length <= 1 ? 'Copiar este día al día elegido' : `Copiar este día a ${selected.length} días`
            }
            accessibilityState={{ disabled: selected.length === 0 }}
            disabled={selected.length === 0}
            onPress={() => {
              handlers.onCopyDayTo(variant.key, selected)
              onClose()
            }}
            className={`min-h-12 flex-row items-center justify-center gap-1.5 rounded-control px-4 ${
              selected.length === 0 ? 'opacity-50' : ''
            }`}
            style={{ backgroundColor: theme.primary }}
          >
            <Copy color={theme.primaryForeground} size={16} />
            <Text className="text-sm font-bold" style={{ color: theme.primaryForeground }}>
              {selected.length <= 1 ? 'Copiar al día' : `Copiar a ${selected.length} días`}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Sheet>
  )
}

export function BuilderDayStrip({
  cells,
  selectedDayOfWeek,
  activeVariant,
  inheritedDays,
  activeKcal,
  baseTargets,
  activeTargetCalories,
  errorDays,
  handlers,
}: {
  /** Las 7 celdas ya resueltas (`builderDayCells`): la UI no vuelve a decidir qué día recibe qué. */
  cells: readonly BuilderDayCell[]
  /** Día seleccionado; `null` = el Día base explícito (los 7 días son propios). */
  selectedDayOfWeek: number | null
  /** Variante que el día seleccionado recibe (`builderVariantForDayOfWeek`). */
  activeVariant: BuilderVariant
  /** Días que heredan el Día base, en orden de lectura (`inheritedDayOfWeeks`). */
  inheritedDays: readonly number[]
  /** kcal del día seleccionado (items + porciones). */
  activeKcal: number
  /** Metas del día base (paso "El plan"), para los placeholders del editor de metas propias. */
  baseTargets: BuilderTargets
  /** Meta de energía EFECTIVA del día seleccionado, para la línea "X / Y". */
  activeTargetCalories: string
  /**
   * Días cuya validación falló. El paso monta solo las franjas del día elegido, así que un item
   * incompleto de otro día bloqueaba "Publicar" sin señal: acá se marca su celda. Solo EXPONE lo
   * que `validateStep` ya calculó.
   */
  errorDays?: readonly number[]
  handlers: BuilderDayStripHandlers
}) {
  const { theme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)

  const inherited = activeVariant.isDefault
  const badge = variantDayBadge(activeVariant)
  const freeDays = cells.filter((cell) => !cell.isOwnDay).map((cell) => cell.dayOfWeek)
  const selectedLongLabel = selectedDayOfWeek == null ? null : formatNutritionDayOfWeek(selectedDayOfWeek)
  // Meta del día: el campo es texto libre y las metas POR DÍA no pasan por `validateStep`, así que
  // un "2,700" a medio escribir no puede convertirse en un "0 kcal" que el coach lea como real.
  const targetCalories = Number(activeTargetCalories.trim())
  const hasTarget = activeTargetCalories.trim() !== '' && Number.isFinite(targetCalories)
  // El Día base dejó de regir cualquier día (los 7 son propios): sigue viajando en el draft, así
  // que hay que poder abrirlo para corregirlo — el strip solo no lo alcanza.
  const baseOrphan = inheritedDays.length === 0

  return (
    <View className="gap-2">
      {/* Strip Lu-Do compartido con la ficha: mismas celdas, misma leyenda, mismo formato. */}
      <PlanDowSelector
        cells={cells}
        selectedDow={selectedDayOfWeek}
        errorDays={errorDays}
        onSelect={(dayOfWeek) => handlers.onSelectDay(dayOfWeek)}
        label="Días del plan: toca un día para editar lo que recibe"
      />

      {/* Barra de contexto: qué se está editando y a quién afecta. */}
      {inherited ? (
        <View className="gap-2.5 rounded-card border border-dashed border-default bg-surface-card p-3">
          <View>
            <Text className="text-sm font-semibold text-strong">Estás editando el Día base</Text>
            <Text className="mt-0.5 text-xs leading-4 text-muted">
              {inheritedDays.length === 0
                ? 'Ningún día lo usa: los siete tienen contenido propio.'
                : inheritedDays.length === 7
                  ? 'Se aplica a los siete días de la semana.'
                  : `Se aplica a ${joinShortDays(inheritedDays)} — lo que cambies acá cambia en ${
                      inheritedDays.length === 1 ? 'ese día' : `esos ${inheritedDays.length} días`
                    }.`}
            </Text>
          </View>
          {selectedDayOfWeek != null && selectedLongLabel != null ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Personalizar el ${selectedLongLabel.toLocaleLowerCase()}`}
                onPress={() => handlers.onPersonalize(selectedDayOfWeek)}
                className="min-h-11 flex-row items-center justify-center gap-1.5 rounded-control border border-primary/40 bg-primary/10 px-3"
              >
                <Text className="text-sm font-bold text-primary">
                  Personalizar el {selectedLongLabel.toLocaleLowerCase()}
                </Text>
              </Pressable>
              <Text className="text-[11px] leading-4 text-subtle">
                Copia este contenido a ese día y ahí lo editas sin tocar el resto de la semana.
              </Text>
            </>
          ) : null}
        </View>
      ) : (
        <View className="flex-row items-center gap-2 rounded-card border border-default bg-surface-card p-3">
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-strong" numberOfLines={1}>
              {activeVariant.label}
              {badge ? ` · ${badge.long}` : ''}
            </Text>
            <Text className="mt-0.5 text-xs text-muted" style={TABULAR_NUMS}>
              {hasTarget
                ? `${formatNutritionPlanDowCalories(activeKcal)} / ${formatNutritionCalories(targetCalories)} · día propio`
                : `${formatNutritionCalories(Math.round(activeKcal))} · día propio`}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Opciones de ${activeVariant.label}`}
            onPress={() => setMenuOpen(true)}
            hitSlop={4}
            className="h-11 w-11 items-center justify-center rounded-control border border-default"
          >
            <MoreVertical color={theme.mutedForeground} size={16} />
          </Pressable>
        </View>
      )}

      {/* El Día base huérfano necesita una puerta: sin esto no hay forma de corregir su contenido
          (ni de ver su error de validación) cuando los 7 días son propios. */}
      {baseOrphan ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: selectedDayOfWeek == null }}
          accessibilityLabel="Abrir el Día base, que ya no se aplica a ningún día"
          onPress={() => handlers.onSelectDay(null)}
          className={`min-h-11 flex-row items-center justify-between gap-2 rounded-control border px-3 ${
            selectedDayOfWeek == null ? 'border-primary bg-primary/10' : 'border-subtle bg-surface-sunken'
          }`}
        >
          <Text className="min-w-0 flex-1 text-xs text-muted">
            El Día base ya no rige ningún día, pero sigue publicándose.
          </Text>
          <Text className="text-xs font-semibold text-primary">Ver</Text>
        </Pressable>
      ) : null}

      {/* Editor de metas propias del día seleccionado (se abre desde el menú ⋮). El Día base nunca
          lo muestra: sus metas son las del paso "El plan". */}
      {!inherited && activeVariant.targetsMode === 'custom' ? (
        <View className="rounded-control border border-primary/25 bg-primary/5 px-3 py-2">
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text className="text-xs font-semibold text-primary">
              Objetivos propios de {badge ? `${activeVariant.label} (${badge.long})` : activeVariant.label}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver a los objetivos base"
              onPress={() => handlers.onSetTargetsMode(activeVariant.key, 'inherit')}
              className="min-h-11 justify-center"
            >
              <Text className="text-xs font-semibold text-primary underline">Volver a los objetivos base</Text>
            </Pressable>
          </View>
          <View className="mt-2 flex-row gap-2">
            {MACRO_FIELDS.map(({ field, label }) => (
              <View key={field} className="flex-1">
                <Text className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-subtle">{label}</Text>
                <TextInput
                  accessibilityLabel={`${label} de ${activeVariant.label}`}
                  value={activeVariant.targets[field]}
                  onChangeText={(value) => handlers.onSetVariantTarget(activeVariant.key, field, value)}
                  placeholder={baseTargets[field] || '0'}
                  placeholderTextColor={theme.mutedForeground}
                  // QW-3 (H-08): `number-pad` en iOS no trae separador decimal y el modelo acepta
                  // coma es-CL. Las metas se escriben con decimales.
                  keyboardType="decimal-pad"
                  className="min-h-11 rounded-control border border-default bg-surface-card px-2 py-1.5 text-sm text-strong"
                  style={TABULAR_NUMS}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {menuOpen && !inherited ? (
        <DayMenuSheet
          variant={activeVariant}
          freeDays={freeDays}
          onClose={() => setMenuOpen(false)}
          handlers={handlers}
        />
      ) : null}
    </View>
  )
}
