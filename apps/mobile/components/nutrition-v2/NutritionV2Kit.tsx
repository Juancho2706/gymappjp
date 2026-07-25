import { useState, type ReactNode } from 'react'
import { Pressable, ScrollView, Text, View, type ViewStyle } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Image } from 'expo-image'
import { MotiView } from 'moti'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  Clock3,
  Cloud,
  CloudOff,
  ImageIcon,
  Info,
  LoaderCircle,
  Save,
  ShieldAlert,
  Utensils,
  WifiOff,
} from 'lucide-react-native'
import {
  NUTRITION_MACROS,
  NUTRITION_MOTION,
  NUTRITION_STRATEGIES,
  foodCategoryFromName,
  formatNutritionAmount,
  formatNutritionCalories,
  nutritionProgressPercent,
  resolveMacroProgressState,
  type NutritionAttentionModel,
  type NutritionBuilderStepModel,
  type NutritionFoodRowModel,
  type NutritionMacroKey,
  type NutritionMacroValue,
  type NutritionMealSlotModel,
  type NutritionSaveState,
  type NutritionStrategy,
  type NutritionSyncState,
  type NutritionTone,
} from '@eva/nutrition-v2'
import { useTheme } from '../../context/ThemeContext'
import { useEvaMotion } from '../../lib/motion'
import { shadow } from '../../lib/shadows'
import { MacroChipRow } from './MacroChipRow'
import { StateIllustration, type NutritionIllustration } from './state-illustration'

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

const toneClasses: Record<NutritionTone, string> = {
  neutral: 'border-border-subtle bg-surface-card',
  brand: 'border-sport-300 bg-sport-100',
  nutrition: 'border-primary/30 bg-primary/10',
  success: 'border-success-500/30 bg-success-500/10',
  warning: 'border-warning-500/30 bg-warning-500/10',
  danger: 'border-danger-500/30 bg-danger-500/10',
  info: 'border-info-500/30 bg-info-500/10',
}

const toneTextClasses: Record<NutritionTone, string> = {
  neutral: 'text-text-strong',
  brand: 'text-sport-700',
  nutrition: 'text-primary',
  success: 'text-success-700',
  warning: 'text-warning-700',
  danger: 'text-danger-700',
  info: 'text-info-600',
}

// Botones RELLENOS — espejo del web `NutritionV2Motion.tsx:24-32`, donde el CTA es
// color-sobre-fill (nutrition = `bg-primary/100 text-white`), NO el chip fantasma de
// las cards. Los fills de estado usan la convención "solid" del DS RN (Badge.tsx:56-63:
// solid = *-500 fijo en ambos esquemas) como mapa sancionado de los raw
// emerald-600/amber-500/rose-600/sky-600 del web (contrato white-label: cero valores
// crudos nuevos; el paso -600 RN flipea a tinte claro en dark y rompería el fill).
// Texto de contraste: nutrition/danger/info = `text-white` (web: text-white),
// warning/success = glifo ink de los tokens `on-warning`/`on-success` (web usa
// slate-950/white raw; el DS RN define el glifo AA sobre sus fills saturados).
const buttonToneClasses: Record<NutritionTone, string> = {
  neutral: 'border-border-default bg-surface-card',
  brand: 'border-sport-500 bg-sport-500',
  nutrition: 'border-primary bg-primary',
  success: 'border-success-500 bg-success-500',
  warning: 'border-warning-500 bg-warning-500',
  danger: 'border-danger-500 bg-danger-500',
  info: 'border-info-500 bg-info-500',
}

const buttonToneTextClasses: Record<NutritionTone, string> = {
  neutral: 'text-text-strong',
  brand: 'text-on-sport',
  nutrition: 'text-white',
  success: 'text-on-success',
  warning: 'text-on-warning',
  danger: 'text-white',
  info: 'text-white',
}

// Iconos estáticos por categoría de alimento — los MISMOS webp del build web
// (`apps/web/public/food-icons/`, Fluent Emoji (c) Microsoft, MIT) empaquetados en
// `assets/food-icons/`. Require estático por asset (Metro exige literales).
const FOOD_CATEGORY_ICONS: Record<string, ReturnType<typeof require>> = {
  proteina: require('../../assets/food-icons/proteina.webp'),
  carbohidrato: require('../../assets/food-icons/carbohidrato.webp'),
  grasa: require('../../assets/food-icons/grasa.webp'),
  lacteo: require('../../assets/food-icons/lacteo.webp'),
  fruta: require('../../assets/food-icons/fruta.webp'),
  verdura: require('../../assets/food-icons/verdura.webp'),
  legumbre: require('../../assets/food-icons/legumbre.webp'),
  bebida: require('../../assets/food-icons/bebida.webp'),
  snack: require('../../assets/food-icons/snack.webp'),
  otro: require('../../assets/food-icons/otro.webp'),
}

/** Icono de categoría; cae a `otro` si es desconocida/null (web `foodCategoryIconUrl`). */
function foodCategoryIconSource(category: string | null | undefined): ReturnType<typeof require> {
  return category && category in FOOD_CATEGORY_ICONS
    ? FOOD_CATEGORY_ICONS[category]
    : FOOD_CATEGORY_ICONS.otro
}

const macroBarClasses: Record<NutritionMacroKey, string> = {
  protein: 'bg-ember-500',
  carbs: 'bg-sport-500',
  fats: 'bg-aqua-500',
}

const macroTextClasses: Record<NutritionMacroKey, string> = {
  protein: 'text-ember-700',
  carbs: 'text-sport-700',
  fats: 'text-aqua-700',
}

export function NutritionPageShell({
  eyebrow,
  title,
  description,
  actions,
  toolbar,
  children,
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  toolbar?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <View className={cx('flex-1 bg-surface-app px-4 pb-8 pt-4', className)}>
      <NutritionHeader eyebrow={eyebrow} title={title} description={description} actions={actions} />
      {toolbar ? <View className="mt-4">{toolbar}</View> : null}
      <View className="mt-5 flex-1">{children}</View>
    </View>
  )
}

export function NutritionHeader({
  eyebrow,
  title,
  description,
  actions,
  onBack,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  /**
   * Variante compacta con flecha de volver (web NutritionV2Kit.tsx:122-150).
   * Adaptación nativa por escrito: el web navega con `backHref` (Link); en RN la
   * navegación es imperativa (router del stack), así que la flecha recibe un callback.
   */
  onBack?: () => void
}) {
  const { theme } = useTheme()
  if (onBack) {
    // Compacta (móvil): una sola fila [flecha][eyebrow+título] [CTA]. El eyebrow va
    // como overline sobre el título para dejar el borde derecho libre a UNA acción
    // primaria (espejo del comentario web:123-126).
    return (
      <View className="flex-row items-center gap-1.5">
        <Pressable
          accessibilityLabel="Volver"
          accessibilityRole="button"
          className="-ml-2 h-10 w-10 shrink-0 items-center justify-center rounded-full active:bg-surface-card"
          onPress={onBack}
        >
          <ArrowLeft color={theme.foreground} size={20} />
        </Pressable>
        <View className="min-w-0 flex-1">
          {eyebrow ? (
            <Text
              className="font-mono text-[10px] font-semibold uppercase leading-4 tracking-[1.6px] text-primary"
              numberOfLines={1}
            >
              {eyebrow}
            </Text>
          ) : null}
          <Text
            accessibilityRole="header"
            className="font-display-black text-[22px] leading-7 tracking-[-0.44px] text-text-strong"
            numberOfLines={1}
          >
            {title}
          </Text>
          {description ? (
            <Text className="mt-0.5 text-[12.5px] leading-4 text-text-muted" numberOfLines={1}>
              {description}
            </Text>
          ) : null}
        </View>
        {actions ? <View className="shrink-0 flex-row items-center gap-2">{actions}</View> : null}
      </View>
    )
  }
  return (
    <View className="gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          {eyebrow ? (
            <Text className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-[1.5px] text-primary">
              {eyebrow}
            </Text>
          ) : null}
          <Text accessibilityRole="header" className="font-display text-3xl font-bold tracking-tight text-text-strong">
            {title}
          </Text>
          {description ? <Text className="mt-2 text-sm leading-5 text-text-muted">{description}</Text> : null}
        </View>
        {actions ? <View className="shrink-0 flex-row items-center gap-2">{actions}</View> : null}
      </View>
    </View>
  )
}

export function NutritionToolbar({ children }: { children: ReactNode }) {
  const { theme } = useTheme()
  return (
    <ScrollView
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="items-center gap-2 p-2"
      className="min-h-14 rounded-card border border-border-subtle bg-surface-card"
      // Decisión única del kit: `shadow-sm` web (NutritionV2Kit.tsx:173) = token DS
      // RN `shadow('sm', scheme)` de lib/shadows.ts (misma escala en Card/Slot/botón).
      style={shadow('sm', theme.scheme)}
    >
      {children}
    </ScrollView>
  )
}

export function StrategyBadge({ strategy, compact = false }: { strategy: NutritionStrategy; compact?: boolean }) {
  const { theme } = useTheme()
  const meta = NUTRITION_STRATEGIES[strategy]
  return (
    <View
      accessibilityLabel={`${meta.label}. ${meta.description}`}
      className="self-start flex-row items-center gap-1.5 rounded-pill border border-primary/30 bg-primary/10 px-2.5 py-1"
    >
      <Utensils color={theme.primary} size={14} />
      <Text className="text-xs font-semibold text-primary">{compact ? meta.shortLabel : meta.label}</Text>
    </View>
  )
}

export function PlanVersionBadge({
  version,
  status,
  effectiveLabel,
}: {
  version: number | string
  status: 'draft' | 'published' | 'superseded' | 'archived'
  effectiveLabel?: string
}) {
  const config = {
    draft: { label: 'Borrador', tone: 'warning' as const },
    published: { label: 'Publicado', tone: 'success' as const },
    superseded: { label: 'Anterior', tone: 'neutral' as const },
    archived: { label: 'Archivado', tone: 'neutral' as const },
  }[status]
  return (
    <View className={cx('self-start rounded-pill border px-2.5 py-1', toneClasses[config.tone])}>
      <Text className={cx('text-xs font-semibold', toneTextClasses[config.tone])}>
        v{version} · {config.label}
        {effectiveLabel ? ` · ${effectiveLabel}` : ''}
      </Text>
    </View>
  )
}

export function MacroBudget({
  calories,
  macros,
  compact = false,
}: {
  calories?: { consumed: number; target: number }
  macros: NutritionMacroValue[]
  compact?: boolean
}) {
  return (
    <View accessibilityLabel="Presupuesto nutricional" className="rounded-card border border-border-subtle bg-surface-card p-4">
      {calories ? (
        <View className="mb-4 flex-row flex-wrap items-end justify-between gap-3 border-b border-border-subtle pb-4">
          <View>
            <Text className="text-xs font-semibold uppercase tracking-wide text-text-subtle">Energía</Text>
            <Text className="mt-1 font-display text-2xl font-bold text-text-strong">
              {formatNutritionCalories(calories.consumed)}
            </Text>
            <Text className="mt-0.5 text-xs text-text-muted">de {formatNutritionCalories(calories.target)}</Text>
          </View>
          <Text className="text-sm font-semibold text-primary">
            {formatNutritionCalories(Math.max(calories.target - calories.consumed, 0))} restantes
          </Text>
        </View>
      ) : null}
      <View className="flex-row gap-3">
        {macros.map((macro) => (
          <View key={macro.macro} className="min-w-0 flex-1">
            <MacroProgress {...macro} compact={compact} />
          </View>
        ))}
      </View>
    </View>
  )
}

export function MacroProgress({
  macro,
  consumed,
  target,
  unit = 'g',
  tolerancePercent = 5,
  compact = false,
}: NutritionMacroValue & { compact?: boolean }) {
  const { duration } = useEvaMotion()
  const meta = NUTRITION_MACROS[macro]
  const percent = nutritionProgressPercent(consumed, target)
  const state = resolveMacroProgressState(consumed, target, tolerancePercent)
  const stateLabel = {
    empty: 'Sin registros',
    under: 'Bajo el rango',
    'in-range': 'En rango',
    over: 'Sobre el rango',
  }[state]

  return (
    <View className={cx('min-w-0', compact ? 'gap-1.5' : 'gap-2')}>
      <View className="flex-row flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <Text className={cx('text-xs font-semibold', macroTextClasses[macro])}>{compact ? meta.shortLabel : meta.label}</Text>
        <Text className="text-[10px] font-medium text-text-muted">{stateLabel}</Text>
      </View>
      <View
        accessibilityLabel={`${meta.label}: ${consumed} de ${target} ${unit}`}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: target, now: Math.min(consumed, target) }}
        className="h-2 overflow-hidden rounded-pill bg-surface-sunken"
      >
        <MotiView
          animate={{ width: `${percent}%` }}
          className={cx('h-full rounded-pill', macroBarClasses[macro])}
          transition={{ type: 'timing', duration: duration('base') }}
        />
      </View>
      <Text className="font-mono text-xs text-text-muted">
        <Text className="font-semibold text-text-strong">{formatNutritionAmount(consumed, unit, 1)}</Text>
        {' / '}
        {formatNutritionAmount(target, unit, 1)}
      </Text>
    </View>
  )
}

export function MealTimeline({
  slots,
  renderActions,
  emptyAction,
}: {
  slots: NutritionMealSlotModel[]
  renderActions?: (slot: NutritionMealSlotModel) => ReactNode
  emptyAction?: ReactNode
}) {
  if (slots.length === 0) {
    return (
      <NutritionStatePanel
        title="Aún no hay franjas para este día"
        description="El plan puede ser completamente flexible o todavía no se ha publicado una estructura diaria."
        icon="empty"
        action={emptyAction}
      />
    )
  }

  return (
    <View accessibilityLabel="Registro de comidas del día" className="gap-4">
      {slots.map((slot, index) => (
        <View key={slot.id} className="flex-row gap-3">
          <View className="w-5 items-center">
            <View
              className={cx(
                'mt-5 h-4 w-4 rounded-full border-[3px] border-surface-app',
                slot.state === 'consumed' ? 'bg-success-500' : slot.state === 'offline' ? 'bg-warning-500' : 'bg-primary',
              )}
            />
            {index < slots.length - 1 ? <View className="min-h-20 w-px flex-1 bg-border-subtle" /> : null}
          </View>
          <View className="min-w-0 flex-1">
            <MealSlotCard slot={slot} actions={renderActions?.(slot)} />
          </View>
        </View>
      ))}
    </View>
  )
}

export function MealSlotCard({ slot, actions }: { slot: NutritionMealSlotModel; actions?: ReactNode }) {
  const { theme } = useTheme()
  const state = {
    empty: { label: 'Sin registros', tone: 'neutral' as const },
    prescribed: { label: 'Esperado', tone: 'nutrition' as const },
    partial: { label: 'Parcial', tone: 'warning' as const },
    consumed: { label: 'Consumido', tone: 'success' as const },
    different: { label: 'Diferente al plan', tone: 'info' as const },
    corrected: { label: 'Corregido', tone: 'info' as const },
    offline: { label: 'Pendiente de sincronizar', tone: 'warning' as const },
  }[slot.state]

  return (
    // Web MealSlotCard (NutritionV2Kit.tsx:266): `shadow-sm` → token DS RN shadow('sm').
    <View className="rounded-card border border-border-subtle bg-surface-card p-4" style={shadow('sm', theme.scheme)}>
      <View className="flex-row flex-wrap items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="font-display text-lg font-semibold text-text-strong">{slot.name}</Text>
            <View className={cx('rounded-pill border px-2 py-0.5', toneClasses[state.tone])}>
              <Text className={cx('text-[10px] font-semibold', toneTextClasses[state.tone])}>{state.label}</Text>
            </View>
          </View>
          {slot.timeLabel ? (
            <View className="mt-1 flex-row items-center gap-1">
              <Clock3 color="#818C9A" size={13} />
              <Text className="text-xs text-text-muted">{slot.timeLabel}</Text>
            </View>
          ) : null}
          {slot.prescriptionLabel ? <Text className="mt-2 text-sm leading-5 text-text-body">{slot.prescriptionLabel}</Text> : null}
        </View>
        {slot.subtotalCalories !== null && slot.subtotalCalories !== undefined ? (
          <Text className="font-mono text-sm font-semibold text-text-strong">{formatNutritionCalories(slot.subtotalCalories)}</Text>
        ) : null}
      </View>

      <View className="mt-4">
        {slot.foods.length > 0 ? (
          slot.foods.map((food, index) => (
            <View key={food.id} className={cx(index > 0 && 'border-t border-border-subtle')}>
              <FoodRow food={food} />
            </View>
          ))
        ) : (
          <Text className="py-4 text-sm text-text-muted">Aún no registras alimentos en esta franja.</Text>
        )}
      </View>
      {actions ? <View className="mt-4 flex-row flex-wrap gap-2 border-t border-border-subtle pt-4">{actions}</View> : null}
    </View>
  )
}

export function FoodThumbnail({
  src,
  alt,
  size = 'md',
  fallbackEmoji,
  fallbackCategory,
}: {
  src?: string | null
  alt: string
  size?: 'sm' | 'md' | 'lg'
  /**
   * @deprecated Legado (adaptación pre-4A-07). El fallback 1:1 con web es el icono
   * estático de categoría (`fallbackCategory`); el emoji solo se usa si no llega categoría.
   */
  fallbackEmoji?: string | null
  /**
   * Categoría del catálogo para el icono estático de fallback (web
   * `NutritionFoodRow.tsx:70-81` + `foodCategoryIconUrl`): tinte `bg-primary/10`
   * sobre sunken + webp de categoría empaquetado. `null` cae al icono `otro`;
   * `undefined` = sin categoría conocida (rutas legadas emoji/lucide).
   */
  fallbackCategory?: string | null
}) {
  const { theme } = useTheme()
  const dimension = { sm: 36, md: 48, lg: 64 }[size]
  if (!src) {
    if (fallbackCategory !== undefined) {
      // Web dibuja el icono a 24px dentro de un thumb de 44px (h-11/h-6): misma
      // proporción aplicada a los tamaños RN (36/48/64 → 20/26/35).
      const iconSize = Math.round((dimension * 24) / 44)
      return (
        <View
          accessibilityLabel={`Sin imagen para ${alt}`}
          accessibilityRole="image"
          className="shrink-0 items-center justify-center overflow-hidden rounded-control border border-border-subtle bg-surface-sunken"
          style={{ width: dimension, height: dimension }}
        >
          <View className="absolute inset-0 items-center justify-center bg-primary/10">
            <Image
              contentFit="contain"
              source={foodCategoryIconSource(fallbackCategory)}
              style={{ width: iconSize, height: iconSize }}
            />
          </View>
        </View>
      )
    }
    return (
      <View
        accessibilityLabel={`Sin imagen para ${alt}`}
        accessibilityRole="image"
        className="shrink-0 items-center justify-center rounded-control border border-border-subtle bg-surface-sunken"
        style={{ width: dimension, height: dimension }}
      >
        {fallbackEmoji ? (
          <Text style={{ fontSize: Math.round(dimension * 0.5) }}>{fallbackEmoji}</Text>
        ) : (
          <ImageIcon color={theme.textSecondary} size={20} />
        )}
      </View>
    )
  }

  return (
    <Image
      accessibilityLabel={alt}
      cachePolicy="memory-disk"
      contentFit="cover"
      source={{ uri: src }}
      style={{ width: dimension, height: dimension, borderRadius: 14 } satisfies ViewStyle}
      transition={120}
    />
  )
}

export function FoodRow({
  food,
  actions,
  fallbackEmoji,
  fallbackCategory,
  note,
  nameLines = 1,
}: {
  food: NutritionFoodRowModel
  actions?: ReactNode
  /**
   * @deprecated Legado: la fila ya NUNCA cae a emoji — el fallback 1:1 con web es el
   * icono estático de categoría (explícita vía `fallbackCategory` o derivada del nombre).
   */
  fallbackEmoji?: string | null
  /**
   * Categoría del catálogo para el icono de fallback. Si no llega, se deriva del
   * nombre con la heurística compartida web/RN (web `NutritionFoodRow.tsx:102`:
   * `foodCategoryIconUrl(category) : foodCategoryIconUrlFromName(name)`).
   */
  fallbackCategory?: string | null
  /** Nota corta bajo los macros (guía del plan; web `NutritionFoodRow.tsx:127`). */
  note?: string | null
  nameLines?: 1 | 2
}) {
  const statusLabel = {
    default: null,
    pending: 'Guardando',
    corrected: 'Corregido',
    offline: 'Sin sincronizar',
    error: 'Error',
  }[food.status ?? 'default']
  const category = fallbackCategory !== undefined ? fallbackCategory : foodCategoryFromName(food.name)

  return (
    <View className="min-h-16 flex-row items-center gap-3 py-3">
      <FoodThumbnail alt={food.name} src={food.thumbnailUrl} fallbackCategory={category} />
      <View className="min-w-0 flex-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="min-w-0 shrink font-semibold text-text-strong" numberOfLines={nameLines}>
            {food.name}
          </Text>
          {statusLabel ? <Text className="text-[10px] font-semibold text-warning-700">{statusLabel}</Text> : null}
        </View>
        <Text className="mt-0.5 text-xs text-text-muted" numberOfLines={1}>
          {food.quantityLabel}
          {food.detail ? ` · ${food.detail}` : ''}
        </Text>
        <View className="mt-1">
          <MacroChipRow
            calories={food.calories}
            proteinG={food.proteinG}
            carbsG={food.carbsG}
            fatsG={food.fatsG}
            size="sm"
          />
        </View>
        {note ? (
          <Text className="mt-1 text-[11px] leading-4 text-text-subtle">{note}</Text>
        ) : null}
      </View>
      {actions ? <View className="shrink-0">{actions}</View> : null}
    </View>
  )
}

export function SyncOfflineState({
  state,
  label,
  onRetry,
}: {
  state: NutritionSyncState
  label?: string
  onRetry?: () => void
}) {
  const { theme } = useTheme()
  const config = {
    synced: { icon: Cloud, text: label ?? 'Sincronizado', tone: 'success' as const, color: theme.success },
    pending: { icon: Cloud, text: label ?? 'Pendiente', tone: 'warning' as const, color: theme.warning },
    syncing: { icon: LoaderCircle, text: label ?? 'Sincronizando…', tone: 'info' as const, color: theme.cyan },
    error: { icon: AlertTriangle, text: label ?? 'Error de sincronización', tone: 'danger' as const, color: theme.destructive },
    offline: { icon: CloudOff, text: label ?? 'Sin conexión', tone: 'warning' as const, color: theme.warning },
  }[state]
  const Icon = config.icon

  return (
    <View className={cx('self-start flex-row items-center gap-1.5 rounded-pill border px-2.5 py-1', toneClasses[config.tone])}>
      <Icon color={config.color} size={14} />
      <Text className={cx('text-xs font-semibold', toneTextClasses[config.tone])}>{config.text}</Text>
      {onRetry && state === 'error' ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Reintentar sincronización" hitSlop={8} onPress={onRetry}>
          <Text className="ml-1 text-xs font-semibold text-danger-700 underline">Reintentar</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export function NutritionStatePanel({
  title,
  description,
  icon = 'empty',
  tone = 'neutral',
  illustration,
  action,
}: {
  title: string
  description: string
  icon?: 'empty' | 'error' | 'permission' | 'offline' | 'info'
  tone?: NutritionTone
  /**
   * Ilustración del CEO para el estado vacío/error (web NutritionV2Kit.tsx:360-391):
   * reemplaza el glifo lucide por el arte empaquetado (webp local, sin red).
   * Aditivo: sin esta prop, el panel se comporta exactamente como antes.
   */
  illustration?: NutritionIllustration
  action?: ReactNode
}) {
  const { theme } = useTheme()
  const Icon = {
    empty: Utensils,
    error: AlertTriangle,
    permission: ShieldAlert,
    offline: WifiOff,
    info: Info,
  }[icon]
  const color = {
    neutral: theme.textSecondary,
    brand: theme.primary,
    nutrition: theme.primary,
    success: theme.success,
    warning: theme.warning,
    danger: theme.destructive,
    info: theme.cyan,
  }[tone]

  return (
    <View className={cx('min-h-48 items-center justify-center rounded-card border p-6', toneClasses[tone])}>
      {illustration ? (
        // Web: círculo tintado `mb-5` (NutritionV2Kit.tsx:375-391); glifo lucide `mb-4`.
        <View className="mb-5">
          <StateIllustration name={illustration} />
        </View>
      ) : (
        <View className="mb-4 h-11 w-11 items-center justify-center rounded-full bg-surface-sunken">
          <Icon color={color} size={21} />
        </View>
      )}
      <Text className={cx('text-center font-display text-lg font-semibold', toneTextClasses[tone])}>{title}</Text>
      <Text className="mt-2 max-w-md text-center text-sm leading-5 text-text-muted">{description}</Text>
      {action ? <View className="mt-5">{action}</View> : null}
    </View>
  )
}

export function NutritionSkeleton({
  variant = 'today',
  rows = 3,
}: {
  variant?: 'today' | 'history' | 'coach' | 'builder'
  rows?: number
}) {
  const { reduced, duration } = useEvaMotion()
  const transition = reduced
    ? { type: 'timing' as const, duration: 0 }
    : { type: 'timing' as const, duration: duration('slower'), loop: true, repeatReverse: true }

  return (
    <View accessibilityLabel="Cargando Nutrición" accessibilityState={{ busy: true }} className="gap-4">
      <MotiView animate={{ opacity: reduced ? 1 : 0.55 }} className="h-28 rounded-card bg-surface-sunken" transition={transition} />
      {variant === 'builder' ? (
        <MotiView animate={{ opacity: reduced ? 1 : 0.55 }} className="h-96 rounded-card bg-surface-sunken" transition={transition} />
      ) : (
        Array.from({ length: rows }, (_, index) => (
          <MotiView
            animate={{ opacity: reduced ? 1 : 0.55 }}
            className="h-32 rounded-card bg-surface-sunken"
            key={index}
            transition={transition}
          />
        ))
      )}
    </View>
  )
}

export function NutritionMotionButton({
  children,
  onPress,
  tone = 'nutrition',
  pending = false,
  success = false,
  disabled = false,
  accessibilityLabel,
}: {
  children: ReactNode
  onPress?: () => void
  tone?: NutritionTone
  pending?: boolean
  success?: boolean
  disabled?: boolean
  accessibilityLabel: string
}) {
  const { theme } = useTheme()
  const { reduced, duration } = useEvaMotion()
  const [pressed, setPressed] = useState(false)
  const Icon = pending ? LoaderCircle : success ? Check : null
  // Glifo sobre el fill: warning/success = ink fijo (canales de --color-text-on-warning/
  // -on-success, global.css:99-100); neutral = texto fuerte; resto = blanco (web text-white).
  const iconColor =
    tone === 'warning' || tone === 'success'
      ? '#0B0E13'
      : tone === 'neutral'
        ? theme.foreground
        : '#FFFFFF'

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy: pending, disabled }}
      disabled={disabled || pending}
      onPress={() => {
        if (!disabled && !pending) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          onPress?.()
        }
      }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      <MotiView
        animate={{ scale: reduced || disabled ? 1 : pressed ? NUTRITION_MOTION.press.scale : success ? 1.03 : 1 }}
        transition={{ type: 'timing', duration: duration('fast') }}
      >
        <View
          className={cx(
            'min-h-11 flex-row items-center justify-center gap-2 rounded-control border px-4',
            buttonToneClasses[tone],
            // Web `disabled:opacity-55` (NutritionV2Motion.tsx:57).
            disabled && 'opacity-55',
          )}
          // Web: `shadow-sm` en el botón (NutritionV2Motion.tsx:57) → token DS RN.
          style={shadow('sm', theme.scheme)}
        >
          {Icon ? <Icon color={iconColor} size={16} /> : null}
          <Text className={cx('text-sm font-semibold', buttonToneTextClasses[tone])}>{children}</Text>
        </View>
      </MotiView>
    </Pressable>
  )
}

export function SelectableStrategyCard({
  strategy,
  selected,
  onSelect,
  disabled = false,
}: {
  strategy: NutritionStrategy
  selected: boolean
  onSelect: (strategy: NutritionStrategy) => void
  disabled?: boolean
}) {
  const { theme } = useTheme()
  const { reduced, duration } = useEvaMotion()
  const [pressed, setPressed] = useState(false)
  const meta = NUTRITION_STRATEGIES[strategy]

  return (
    <Pressable
      accessibilityLabel={`${meta.label}. ${meta.description}`}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={() => {
        void Haptics.selectionAsync()
        onSelect(strategy)
      }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      <MotiView
        animate={{
          scale: reduced || disabled ? 1 : pressed ? NUTRITION_MOTION.press.scale : 1,
          translateY: reduced ? 0 : selected ? -2 : 0,
        }}
        transition={{ type: 'timing', duration: duration('fast') }}
      >
        <View
          className={cx(
            'min-h-36 rounded-card border bg-surface-card p-4',
            selected ? 'border-primary' : 'border-border-subtle',
            disabled && 'opacity-50',
          )}
        >
          <Text className="pr-10 font-display text-lg font-semibold text-text-strong">{meta.label}</Text>
          <Text className="mt-2 text-sm leading-5 text-text-muted">{meta.description}</Text>
          {selected ? (
            <MotiView
              animate={{ opacity: 1, scale: 1 }}
              from={reduced ? undefined : { opacity: 0, scale: 0.7 }}
              style={{ position: 'absolute', right: 16, top: 16 }}
              transition={{ type: 'timing', duration: duration('base') }}
            >
              <View className="h-7 w-7 items-center justify-center rounded-full bg-primary">
                <Check color={theme.primaryForeground} size={16} />
              </View>
            </MotiView>
          ) : null}
        </View>
      </MotiView>
    </Pressable>
  )
}

export function SaveStateIndicator({ state }: { state: NutritionSaveState }) {
  const { theme } = useTheme()
  const { reduced, duration } = useEvaMotion()
  const config = {
    idle: { label: 'Sin cambios', icon: Save, tone: 'neutral' as const, color: theme.textSecondary },
    dirty: { label: 'Cambios sin guardar', icon: Save, tone: 'warning' as const, color: theme.warning },
    saving: { label: 'Guardando…', icon: LoaderCircle, tone: 'info' as const, color: theme.cyan },
    saved: { label: 'Guardado', icon: Check, tone: 'success' as const, color: theme.success },
    error: { label: 'No se pudo guardar', icon: AlertTriangle, tone: 'danger' as const, color: theme.destructive },
  }[state]
  const Icon = config.icon

  return (
    <MotiView
      animate={{ opacity: 1, translateY: 0 }}
      from={reduced ? undefined : { opacity: 0, translateY: 3 }}
      key={state}
      transition={{ type: 'timing', duration: duration('base') }}
    >
      <View accessibilityLiveRegion="polite" className="min-h-8 flex-row items-center gap-1.5">
        <Icon color={config.color} size={14} />
        <Text className={cx('text-xs font-semibold', toneTextClasses[config.tone])}>{config.label}</Text>
      </View>
    </MotiView>
  )
}

export function CoachAttentionCard({
  item,
  onAction,
}: {
  item: NutritionAttentionModel
  onAction?: (id: string) => void
}) {
  const { theme } = useTheme()
  const Icon = item.tone === 'warning' || item.tone === 'danger' ? AlertTriangle : Info
  const color = item.tone === 'danger' ? theme.destructive : item.tone === 'warning' ? theme.warning : theme.cyan

  return (
    <View className={cx('rounded-card border p-4', toneClasses[item.tone])}>
      <View className="flex-row items-start gap-3">
        <View className="mt-0.5 h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken">
          <Icon color={color} size={17} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className={cx('font-semibold', toneTextClasses[item.tone])}>{item.title}</Text>
          <Text className="mt-1 text-sm leading-5 text-text-body">{item.description}</Text>
        </View>
        <Pressable
          accessibilityLabel={`${item.actionLabel}: ${item.title}`}
          accessibilityRole="button"
          className="min-h-11 flex-row items-center justify-center gap-1 rounded-control px-2"
          onPress={() => onAction?.(item.id)}
        >
          <Text className={cx('text-xs font-semibold', toneTextClasses[item.tone])}>{item.actionLabel}</Text>
          <ChevronRight color={color} size={16} />
        </Pressable>
      </View>
    </View>
  )
}

export function BuilderStepList({ steps }: { steps: NutritionBuilderStepModel[] }) {
  const { theme } = useTheme()
  return (
    <View accessibilityLabel="Pasos del constructor" className="rounded-card border border-border-subtle bg-surface-card p-3">
      {steps.map((step, index) => (
        <View
          accessibilityState={{ selected: step.state === 'current' }}
          className={cx(
            'min-h-11 flex-row items-start gap-3 rounded-control px-3 py-2',
            step.state === 'current' && 'bg-primary/10',
            step.state === 'error' && 'bg-danger-100/40',
          )}
          key={step.id}
        >
          <View
            className={cx(
              'mt-0.5 h-6 w-6 shrink-0 items-center justify-center rounded-full border',
              step.state === 'complete' && 'border-success-500 bg-success-500',
              step.state === 'current' && 'border-primary bg-primary',
              step.state === 'upcoming' && 'border-border-default bg-surface-sunken',
              step.state === 'error' && 'border-danger-500 bg-danger-500',
            )}
          >
            {step.state === 'complete' ? (
              <Check color={theme.primaryForeground} size={13} />
            ) : (
              <Text className={cx('text-xs font-bold', step.state === 'upcoming' ? 'text-text-muted' : 'text-white')}>{index + 1}</Text>
            )}
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-text-strong">{step.label}</Text>
            {step.description ? <Text className="mt-0.5 text-xs leading-4 text-text-muted">{step.description}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  )
}

export function BuilderInspector({ title = 'Inspector', children, footer }: { title?: string; children: ReactNode; footer?: ReactNode }) {
  const { theme } = useTheme()
  return (
    // Web BuilderInspector (NutritionV2Kit.tsx:455): `shadow-sm` → token DS RN shadow('sm').
    <View className="rounded-card border border-border-subtle bg-surface-card" style={shadow('sm', theme.scheme)}>
      <View className="border-b border-border-subtle px-4 py-3">
        <Text className="font-display text-base font-semibold text-text-strong">{title}</Text>
      </View>
      <View className="gap-4 p-4">{children}</View>
      {footer ? <View className="border-t border-border-subtle p-4">{footer}</View> : null}
    </View>
  )
}

export function StudentPreview({
  title = 'Vista del alumno',
  themeLabel,
  children,
}: {
  title?: string
  themeLabel?: string
  children: ReactNode
}) {
  return (
    <View className="overflow-hidden rounded-sheet border-[6px] border-ink-900 bg-surface-app">
      <View className="h-7 items-center justify-center bg-ink-900">
        <View className="h-1.5 w-20 rounded-pill bg-white/20" />
      </View>
      <View className="flex-row items-center justify-between border-b border-border-subtle bg-surface-card px-4 py-3">
        <Text className="text-sm font-semibold text-text-strong">{title}</Text>
        {themeLabel ? <Text className="text-xs text-text-muted">{themeLabel}</Text> : null}
      </View>
      <View className="max-h-[620px] p-3">{children}</View>
    </View>
  )
}
