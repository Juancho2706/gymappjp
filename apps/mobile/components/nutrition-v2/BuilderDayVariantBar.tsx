import { useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { Check, Copy, Lock, MoreVertical, Pencil, Plus, Sliders, Trash2 } from 'lucide-react-native'
import {
  NUTRITION_DAY_LABELS,
  NUTRITION_DAY_SHORT_LABELS,
  NUTRITION_WEEK_ORDER,
  formatNutritionCalories,
} from '@eva/nutrition-v2'
import { Sheet } from '../Sheet'
import { useTheme } from '../../context/ThemeContext'
import type { BuilderTargets, BuilderVariant } from '../../lib/nutrition-v2-builder'

/**
 * Barra de días del builder RN multi-día (SPEC nutrition-multiday, UX 1) — espejo nativo de la
 * web `DayVariantBar` + `AddDayPopover`.
 *
 * Vive arriba de las franjas del paso "Construcción": chips HORIZONTALES scrolleables (uno por
 * día del plan: etiqueta + kcal, el activo resaltado), el chip "Agregar día" y, por chip, el
 * menú (botón ⋯ o long-press) con Renombrar · Cambiar día · Duplicar como otro día ·
 * Personalizar objetivos · Eliminar. El día base no se elimina ni cambia de día (invariantes del
 * reducer, espejadas aquí en la UI).
 *
 * Debajo va el banner de herencia de metas del día activo: "…usa los objetivos base (X kcal) ·
 * Personalizar", que despliega el editor de metas SCOPED a ese día.
 *
 * Coach BASE (sin Nutrición Pro): "Agregar día" lleva candado y el sheet muestra el upsell en
 * vez del selector. La barrera REAL es el servidor (`publishDraftRN` responde UPGRADE_REQUIRED
 * con feature `multi_variant`); esto solo evita el callejón sin salida.
 *
 * Sin diálogos nativos para elegir: todo va por `Sheet nativeModal` (gorhom vetado bajo
 * reanimated 4, misma decisión que el resto del builder). Safe areas y dark/white-label salen de
 * los tokens del kit + `useTheme()` — jamás un hex de marca.
 */

/** Orden de lectura Lu→Do como `number[]` (el del paquete es una tupla literal readonly). */
const WEEK_ORDER: number[] = [...NUTRITION_WEEK_ORDER]

const MACRO_FIELDS: Array<{ field: keyof BuilderTargets; label: string }> = [
  { field: 'calories', label: 'kcal' },
  { field: 'proteinG', label: 'P (g)' },
  { field: 'carbsG', label: 'C (g)' },
  { field: 'fatsG', label: 'G (g)' },
]

export type AddDayOrigin = 'copy-base' | 'empty'

export interface BuilderDayVariantBarHandlers {
  onSelect: (variantKey: string) => void
  onAddDays: (days: number[], origin: AddDayOrigin) => void
  onRename: (variantKey: string, label: string) => void
  onChangeDay: (variantKey: string, dayOfWeek: number) => void
  onDuplicate: (sourceVariantKey: string, dayOfWeek: number) => void
  onSetTargetsMode: (variantKey: string, mode: 'inherit' | 'custom') => void
  onSetVariantTarget: (variantKey: string, field: keyof BuilderTargets, value: string) => void
  onRemove: (variantKey: string) => void
  /** CTA del upsell (coach BASE): la pantalla navega a Módulos. */
  onUpgrade: () => void
}

function kcalLabel(value: number): string {
  return formatNutritionCalories(Math.round(value))
}

/** Fila Lu-Do de selección: chips 44pt, días ocupados deshabilitados. */
function DayChipRow({
  selected,
  taken,
  currentDay,
  multi,
  onToggle,
}: {
  selected: number[]
  taken: ReadonlySet<number>
  /** Día que ya tiene la variante (en "Cambiar día" no se deshabilita a sí mismo). */
  currentDay?: number | null
  multi: boolean
  onToggle: (day: number) => void
}) {
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {WEEK_ORDER.map((day) => {
        const isCurrent = currentDay != null && day === currentDay
        const isTaken = taken.has(day) && !isCurrent
        const isOn = multi ? selected.includes(day) : isCurrent
        return (
          <Pressable
            key={day}
            accessibilityRole="button"
            accessibilityState={{ disabled: isTaken, selected: isOn }}
            accessibilityLabel={
              isTaken ? `${NUTRITION_DAY_LABELS[day]}: ya tiene su propio día` : NUTRITION_DAY_LABELS[day]
            }
            disabled={isTaken}
            onPress={() => onToggle(day)}
            className={`h-11 min-w-11 items-center justify-center rounded-control border px-2 ${
              isTaken
                ? 'border-border-subtle bg-surface-sunken opacity-50'
                : isOn
                  ? 'border-primary bg-primary/10'
                  : 'border-border-default bg-surface-card'
            }`}
          >
            <Text className={`text-sm font-semibold ${isOn ? 'text-primary' : 'text-text-strong'}`}>
              {NUTRITION_DAY_SHORT_LABELS[day]}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** Panel de upsell del coach BASE dentro del sheet "Agregar día". */
function UpsellPanel({ onUpgrade }: { onUpgrade: () => void }) {
  const { theme } = useTheme()
  return (
    <View className="gap-2 pb-2">
      <View className="flex-row items-center gap-2">
        <Lock color={theme.primary} size={18} />
        <Text className="font-display text-base font-semibold text-text-strong">
          Días distintos con Nutrición Pro
        </Text>
      </View>
      <Text className="text-sm leading-5 text-text-muted">
        Armar un día especial (por ejemplo, el fin de semana) es parte de Nutrición Pro, incluido en los planes
        pagos. Tu plan actual publica un solo día para toda la semana.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mejorar mi plan"
        onPress={onUpgrade}
        className="min-h-11 flex-row items-center justify-center self-start rounded-control border border-primary/30 bg-primary/10 px-4"
      >
        <Text className="text-sm font-semibold text-primary">Mejorar mi plan</Text>
      </Pressable>
    </View>
  )
}

/** Sheet "Agregar día": multi-select Lu-Do + origen del contenido + CTA "Crear N días". */
function AddDaySheet({
  open,
  onClose,
  takenDays,
  canCopyBase,
  locked,
  onCreate,
  onUpgrade,
}: {
  open: boolean
  onClose: () => void
  takenDays: readonly number[]
  canCopyBase: boolean
  locked: boolean
  onCreate: (days: number[], origin: AddDayOrigin) => void
  onUpgrade: () => void
}) {
  const { theme } = useTheme()
  const [selected, setSelected] = useState<number[]>([])
  const [origin, setOrigin] = useState<AddDayOrigin>(canCopyBase ? 'copy-base' : 'empty')
  const taken = new Set(takenDays)
  const allTaken = WEEK_ORDER.every((day) => taken.has(day))

  // Cada apertura arranca limpia (el sheet no se desmonta entre aperturas).
  useEffect(() => {
    if (open) {
      setSelected([])
      setOrigin(canCopyBase ? 'copy-base' : 'empty')
    }
  }, [open, canCopyBase])

  return (
    <Sheet open={open} onClose={onClose} nativeModal snapPoints={['65%']} title="Agregar día" accessibilityLabel="Agregar día">
      {locked ? (
        <UpsellPanel onUpgrade={onUpgrade} />
      ) : allTaken ? (
        <Text className="py-4 text-sm leading-5 text-text-muted">
          Ya tienes los siete días definidos por separado. Elimina alguno para volver a usar el día base.
        </Text>
      ) : (
        <View className="gap-4 pb-2">
          <View>
            <Text className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Elige los días
            </Text>
            <DayChipRow
              selected={selected}
              taken={taken}
              multi
              onToggle={(day) =>
                setSelected((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))
              }
            />
          </View>

          <View>
            <Text className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Contenido inicial
            </Text>
            {(
              [
                ['copy-base', 'Copiar el día base (comidas y porciones)'],
                ['empty', 'Empezar vacío'],
              ] as const
            ).map(([value, label]) => {
              const disabled = value === 'copy-base' && !canCopyBase
              const checked = origin === value
              return (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked, disabled }}
                  accessibilityLabel={label}
                  disabled={disabled}
                  onPress={() => setOrigin(value)}
                  className={`min-h-11 flex-row items-center gap-2.5 rounded-control px-1 ${disabled ? 'opacity-50' : ''}`}
                >
                  <View
                    className={`h-5 w-5 items-center justify-center rounded-full border ${
                      checked ? 'border-transparent' : 'border-border-default bg-surface-card'
                    }`}
                    style={checked ? { backgroundColor: theme.primary } : undefined}
                  >
                    {checked ? <Check color={theme.primaryForeground} size={13} /> : null}
                  </View>
                  <Text className="flex-1 text-sm text-text-body">{label}</Text>
                </Pressable>
              )
            })}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={selected.length <= 1 ? 'Crear día' : `Crear ${selected.length} días`}
            accessibilityState={{ disabled: selected.length === 0 }}
            disabled={selected.length === 0}
            onPress={() =>
              onCreate([...selected].sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b)), origin)
            }
            className={`min-h-12 flex-row items-center justify-center gap-1.5 rounded-control px-4 ${
              selected.length === 0 ? 'opacity-50' : ''
            }`}
            style={{ backgroundColor: theme.primary }}
          >
            <Plus color={theme.primaryForeground} size={16} />
            <Text className="text-sm font-bold" style={{ color: theme.primaryForeground }}>
              {selected.length <= 1 ? 'Crear día' : `Crear ${selected.length} días`}
            </Text>
          </Pressable>
        </View>
      )}
    </Sheet>
  )
}

/** Fila de acción del menú del día (44pt, icono + texto, variante destructiva). */
function MenuRow({
  icon: Icon,
  label,
  destructive,
  disabled,
  onPress,
}: {
  icon: React.ComponentType<{ color?: string; size?: number }>
  label: string
  destructive?: boolean
  disabled?: boolean
  onPress: () => void
}) {
  const { theme } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-12 flex-row items-center gap-3 rounded-control px-2 ${disabled ? 'opacity-50' : 'active:bg-surface-sunken'}`}
    >
      <Icon color={destructive ? theme.destructive : theme.foreground} size={18} />
      <Text className={`flex-1 text-sm font-medium ${destructive ? 'text-danger-600' : 'text-text-strong'}`}>
        {label}
      </Text>
    </Pressable>
  )
}

/** Sheet del menú de un día. El día base solo ofrece Renombrar y Duplicar. */
function DayMenuSheet({
  variant,
  takenDays,
  canAddMore,
  onClose,
  handlers,
}: {
  /** Siempre presente: el padre monta el sheet solo cuando hay día seleccionado. */
  variant: BuilderVariant
  takenDays: readonly number[]
  canAddMore: boolean
  onClose: () => void
  handlers: BuilderDayVariantBarHandlers
}) {
  const { theme } = useTheme()
  const [panel, setPanel] = useState<'menu' | 'rename' | 'change' | 'duplicate'>('menu')
  const [renameDraft, setRenameDraft] = useState(variant.label)

  // Reabrir el menú (otro día) vuelve al panel raíz con el nombre de ESE día.
  useEffect(() => {
    setPanel('menu')
    setRenameDraft(variant.label)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant.key])

  const taken = new Set(takenDays)

  return (
    <Sheet
      open
      onClose={onClose}
      nativeModal
      snapPoints={['60%']}
      title={`Día: ${variant.label}`}
      accessibilityLabel={`Opciones del día ${variant.label}`}
    >
      {panel === 'menu' ? (
        <View className="gap-0.5 pb-2">
          <MenuRow icon={Pencil} label="Renombrar" onPress={() => setPanel('rename')} />
          {!variant.isDefault ? (
            <MenuRow icon={Check} label="Cambiar día" onPress={() => setPanel('change')} />
          ) : null}
          <MenuRow
            icon={Copy}
            label="Duplicar como otro día"
            disabled={!canAddMore}
            onPress={() => setPanel('duplicate')}
          />
          {!variant.isDefault ? (
            <MenuRow
              icon={Sliders}
              label={variant.targetsMode === 'custom' ? 'Volver a los objetivos base' : 'Personalizar objetivos'}
              onPress={() => {
                handlers.onSetTargetsMode(variant.key, variant.targetsMode === 'custom' ? 'inherit' : 'custom')
                onClose()
              }}
            />
          ) : null}
          {!variant.isDefault ? (
            <MenuRow
              icon={Trash2}
              label="Eliminar día"
              destructive
              onPress={() =>
                Alert.alert(
                  `¿Eliminar ${variant.label}?`,
                  'Se quitarán sus franjas, alimentos y porciones. El resto del plan no cambia.',
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
          ) : null}
        </View>
      ) : null}

      {panel === 'rename' ? (
        <View className="gap-3 pb-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">Nombre del día</Text>
          <TextInput
            autoFocus
            accessibilityLabel="Nombre del día"
            value={renameDraft}
            onChangeText={setRenameDraft}
            maxLength={120}
            placeholder="Sábado, Día de entrenamiento…"
            placeholderTextColor={theme.mutedForeground}
            className="min-h-11 rounded-control border border-border-default bg-surface-card px-3 py-2 text-base text-text-strong"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Guardar nombre"
            onPress={() => {
              handlers.onRename(variant.key, renameDraft.trim() === '' ? 'Día' : renameDraft.trim())
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

      {panel === 'change' ? (
        <View className="gap-3 pb-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">Cambiar día</Text>
          <DayChipRow
            selected={[]}
            taken={taken}
            currentDay={variant.dayOfWeek}
            multi={false}
            onToggle={(day) => {
              handlers.onChangeDay(variant.key, day)
              onClose()
            }}
          />
        </View>
      ) : null}

      {panel === 'duplicate' ? (
        <View className="gap-3 pb-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Duplicar como otro día
          </Text>
          <DayChipRow
            selected={[]}
            taken={taken}
            multi={false}
            onToggle={(day) => {
              handlers.onDuplicate(variant.key, day)
              onClose()
            }}
          />
        </View>
      ) : null}
    </Sheet>
  )
}

export function BuilderDayVariantBar({
  variants,
  activeVariantKey,
  kcalByVariantKey,
  baseTargets,
  addDayLocked,
  handlers,
}: {
  variants: BuilderVariant[]
  activeVariantKey: string
  /** kcal del día (items + porciones) por `variant.key`, para el chip. */
  kcalByVariantKey: Record<string, number>
  /** Metas del día base (paso "Objetivos"), para el banner de herencia. */
  baseTargets: BuilderTargets
  /** Coach sin Nutrición Pro: "Agregar día" con candado + upsell. */
  addDayLocked: boolean
  handlers: BuilderDayVariantBarHandlers
}) {
  const { theme } = useTheme()
  const [addOpen, setAddOpen] = useState(false)
  const [menuKey, setMenuKey] = useState<string | null>(null)

  const active = variants.find((variant) => variant.key === activeVariantKey) ?? variants[0]
  const baseVariant = variants.find((variant) => variant.isDefault) ?? variants[0]
  const takenDays = variants
    .filter((variant) => !variant.isDefault && variant.dayOfWeek != null)
    .map((variant) => variant.dayOfWeek as number)
  const canAddMore = takenDays.length < WEEK_ORDER.length
  const menuVariant = menuKey != null ? (variants.find((variant) => variant.key === menuKey) ?? null) : null

  return (
    <View className="gap-2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="flex-row items-center gap-1.5 pr-1"
        accessibilityLabel="Días del plan"
      >
        {variants.map((variant) => {
          const isActive = variant.key === active?.key
          const kcal = kcalByVariantKey[variant.key] ?? 0
          return (
            <View
              key={variant.key}
              className={`flex-row items-center gap-0.5 rounded-pill border pl-3 pr-0.5 ${
                isActive ? 'border-primary bg-primary/10' : 'border-border-default bg-surface-card'
              }`}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`Día ${variant.label}`}
                onPress={() => handlers.onSelect(variant.key)}
                onLongPress={() => setMenuKey(variant.key)}
                className="min-h-11 flex-row items-center gap-1.5"
              >
                <Text className={`text-xs font-semibold ${isActive ? 'text-primary' : 'text-text-strong'}`}>
                  {variant.label}
                </Text>
                <Text className="text-[11px] text-text-muted" style={{ fontVariant: ['tabular-nums'] }}>
                  {kcalLabel(kcal)}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Opciones del día ${variant.label}`}
                onPress={() => setMenuKey(variant.key)}
                hitSlop={4}
                className="h-11 w-9 items-center justify-center rounded-pill"
              >
                <MoreVertical color={theme.mutedForeground} size={16} />
              </Pressable>
            </View>
          )
        })}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Agregar un día distinto al plan"
          onPress={() => setAddOpen(true)}
          className="min-h-11 flex-row items-center gap-1.5 rounded-pill border border-dashed border-border-default bg-surface-card px-3"
        >
          {addDayLocked ? <Lock color={theme.primary} size={14} /> : <Plus color={theme.primary} size={14} />}
          <Text className="text-xs font-semibold text-primary">Agregar día</Text>
        </Pressable>
      </ScrollView>

      {/* Coach BASE con un plan que YA tiene varios días (típicamente convertido de V1): el
          servidor rechazará el publish con UPGRADE_REQUIRED. Se avisa acá, no al final. */}
      {addDayLocked && variants.length > 1 ? (
        <View className="rounded-control border border-warning-500/30 bg-warning-500/10 px-3 py-2">
          <Text className="text-xs leading-5 text-warning-700">
            Este plan tiene {variants.length} días distintos y publicarlos requiere Nutrición Pro. Puedes eliminar
            los días extra desde su menú, o mejorar tu plan.
          </Text>
        </View>
      ) : null}

      {/* Banner de herencia de metas del día ACTIVO. El día base nunca lo muestra: sus metas son
          las del paso "Objetivos". */}
      {active != null && !active.isDefault ? (
        active.targetsMode === 'custom' ? (
          <View className="rounded-control border border-primary/25 bg-primary/5 px-3 py-2">
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <Text className="text-xs font-semibold text-primary">Objetivos propios de {active.label}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Volver a los objetivos base"
                onPress={() => handlers.onSetTargetsMode(active.key, 'inherit')}
                className="min-h-11 justify-center"
              >
                <Text className="text-xs font-semibold text-primary underline">Volver a los objetivos base</Text>
              </Pressable>
            </View>
            <View className="mt-2 flex-row gap-2">
              {MACRO_FIELDS.map(({ field, label }) => (
                <View key={field} className="flex-1">
                  <Text className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-text-subtle">
                    {label}
                  </Text>
                  <TextInput
                    accessibilityLabel={`${label} de ${active.label}`}
                    value={active.targets[field]}
                    onChangeText={(value) => handlers.onSetVariantTarget(active.key, field, value)}
                    placeholder={baseTargets[field] || '0'}
                    placeholderTextColor={theme.mutedForeground}
                    keyboardType="number-pad"
                    className="min-h-11 rounded-control border border-border-default bg-surface-card px-2 py-1.5 text-sm text-text-strong"
                    style={{ fontVariant: ['tabular-nums'] }}
                  />
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View className="flex-row flex-wrap items-center gap-2 rounded-control border border-border-subtle bg-surface-sunken px-3 py-2">
            <Text className="min-w-0 flex-1 text-xs text-text-muted">
              {active.label} usa los objetivos base
              {baseTargets.calories.trim() !== '' ? ` (${baseTargets.calories} kcal)` : ''}.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Personalizar los objetivos de ${active.label}`}
              onPress={() => handlers.onSetTargetsMode(active.key, 'custom')}
              className="min-h-11 justify-center"
            >
              <Text className="text-xs font-semibold text-primary underline">Personalizar</Text>
            </Pressable>
          </View>
        )
      ) : null}

      <AddDaySheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        takenDays={takenDays}
        canCopyBase={baseVariant != null && baseVariant.slots.length > 0}
        locked={addDayLocked}
        onUpgrade={() => {
          setAddOpen(false)
          handlers.onUpgrade()
        }}
        onCreate={(days, origin) => {
          setAddOpen(false)
          handlers.onAddDays(days, origin)
        }}
      />

      {menuVariant ? (
        <DayMenuSheet
          variant={menuVariant}
          takenDays={takenDays}
          canAddMore={canAddMore}
          onClose={() => setMenuKey(null)}
          handlers={handlers}
        />
      ) : null}
    </View>
  )
}
