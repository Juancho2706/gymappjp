import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { Check, ChevronDown, ChevronUp, ClipboardList, Info, Lock } from 'lucide-react-native'
import { NUMERIC_KEYBOARD_ACCESSORY_ID } from '../../KeyboardDoneBar'
import {
  PLAN_NAME_MAX,
  qeAllowedStrategies,
  type NutritionStrategy,
  type NutritionStudentPermissions,
  type QeMeta,
  type QuickEditAction,
  type QuickEditState,
} from '@eva/nutrition-v2'
import { NutritionCard } from '../NutritionCard'
import { SegmentedTabs } from '../../SegmentedTabs'
import { useTheme } from '../../../context/ThemeContext'
import { formatNutritionShortDate } from '../../../lib/date-utils'
import { EDITOR_COPY } from './microcopy'

/**
 * Cabecera del EDITOR UNICO (T3.3b) — espejo RN de `EditorMetaCard` web: los metadatos del plan
 * viven en el MISMO arbol editable (`state.meta`, gramatica compartida) y se editan aca.
 *
 * Solo se pinta cuando la superficie hidrato meta (la ruta `/editor`): en el quick-edit clasico
 * `state.meta` no existe, esta card no aparece y la pantalla queda como siempre.
 *
 * - Nombre: editable (1-180 tras trim, tope del contrato).
 * - Estrategia: `qeAllowedStrategies` — `flexible` SOLO sin franjas (en flexible el alumno ve
 *   metas, no comidas: publicar franjas invisibles es perdida silenciosa). `hybrid` avisa el
 *   candado Pro; el gate REAL es del servidor.
 * - Vigencia: solo en CREACION (la llave existe en meta). En edicion el server computa
 *   max(hoy, base) y aca solo se enuncia.
 * - Permisos: los 4 switches + el tope ±%. `canSubstitute` no se pinta (D4 de T2.5: permiso
 *   muerto, ningun camino de autorizacion lo lee).
 *
 * PASADA VISUAL (2026-08-16, espejo del web): editando un plan que YA existe la card nace
 * COLAPSADA — sus metadatos ya estan decididos y ocupaban la pantalla entera, asi que el coach
 * abria el editor sin ver una sola comida. En creacion y en plantilla arranca abierta, porque
 * ahi definirlos es el primer paso. Colapsada resume nombre · estrategia · permisos activos.
 */

const STRATEGY_LABEL: Record<NutritionStrategy, string> = {
  structured: 'Estructurado',
  flexible: 'Flexible',
  hybrid: 'Híbrido',
}

const PERMISSION_ROWS: Array<[keyof NutritionStudentPermissions, string, string]> = [
  ['canRegisterFreely', 'Registro libre', 'Puede anotar alimentos fuera del plan.'],
  ['canAdjustPrescribedQuantity', 'Ajustar cantidades', 'Puede corregir la cantidad de lo prescrito.'],
  ['canMoveMealSlot', 'Mover comidas de franja', 'Puede registrar una comida en otra franja del día.'],
  ['canSkipOptionalItems', 'Saltar opcionales', 'Puede omitir los alimentos marcados como opcionales.'],
]

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Tope del contrato de guardado (`description`: max 2000 tras trim). */
const TEMPLATE_DESCRIPTION_MAX = 2000

/** Resumen del estado colapsado: lo que el coach necesita reconocer sin abrir. */
function metaSummary(
  name: string,
  strategy: NutritionStrategy,
  permissions: NutritionStudentPermissions,
): string {
  const perms = [
    permissions.canRegisterFreely ? 'registro libre' : null,
    permissions.canAdjustPrescribedQuantity ? 'ajusta cantidades' : null,
  ].filter(Boolean)
  return [name.trim() || 'Sin nombre', STRATEGY_LABEL[strategy], ...perms].join(' · ')
}

export function EditorMetaCard({
  state,
  meta,
  dispatch,
  errors,
  disabled,
  hasNutritionPro,
  today,
  futureDateLabel,
  template = false,
  templateDescription = '',
  onTemplateDescription,
}: {
  state: QuickEditState
  meta: QeMeta
  dispatch: (action: QuickEditAction) => void
  errors: Record<string, string>
  disabled: boolean
  hasNutritionPro: boolean
  /** Fecha local del alumno (YYYY-MM-DD): piso de la vigencia elegible en creacion. */
  today: string
  /** Vigencia FUTURA de la version base (dd-mm-yyyy) o null si ya rige. Solo en edicion. */
  futureDateLabel: string | null
  /** Modo PLANTILLA: cambia el vocabulario y suma la descripcion de la fila. */
  template?: boolean
  templateDescription?: string
  onTemplateDescription?: (value: string) => void
}) {
  const { theme } = useTheme()
  const allowed = qeAllowedStrategies(state)
  const flexibleBlocked = !allowed.includes('flexible')
  // Modo creacion = la vigencia es elegible (la llave existe). En plantilla no existe nunca.
  const isCreation = meta.effectiveFrom !== undefined
  const effectiveFromText = meta.effectiveFrom ?? today
  const [open, setOpen] = useState(() => isCreation || template)
  // Un error de validacion en un campo escondido seria invisible: la card se abre sola.
  const expanded = open || Boolean(errors['meta.name'] || errors['meta.effectiveFrom'])

  return (
    <NutritionCard>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={template ? EDITOR_COPY.templateTitle : EDITOR_COPY.planTitle}
        onPress={() => setOpen((value) => !value)}
        className="min-h-11 flex-row items-center gap-2"
      >
        <ClipboardList color={theme.textSecondary} size={16} />
        <View className="min-w-0 flex-1">
          <Text className="font-display text-base font-semibold text-strong">
            {template ? EDITOR_COPY.templateTitle : EDITOR_COPY.planTitle}
          </Text>
          {expanded ? null : (
            <Text className="mt-0.5 text-xs leading-5 text-muted" numberOfLines={1}>
              {metaSummary(meta.name, meta.strategy, meta.permissions)}
            </Text>
          )}
        </View>
        {expanded ? (
          <ChevronUp color={theme.textSecondary} size={16} />
        ) : (
          <ChevronDown color={theme.textSecondary} size={16} />
        )}
      </Pressable>
      {expanded ? (
      <>

      <Text className="mt-3 text-xs font-semibold text-muted">
        {template ? EDITOR_COPY.templateNameLabel : EDITOR_COPY.planNameLabel}
      </Text>
      <TextInput
        accessibilityLabel={template ? EDITOR_COPY.templateNameLabel : EDITOR_COPY.planNameLabel}
        value={meta.name}
        onChangeText={(value) => dispatch({ type: 'SET_PLAN_NAME', value })}
        editable={!disabled}
        maxLength={PLAN_NAME_MAX}
        placeholder={template ? EDITOR_COPY.templateNamePlaceholder : EDITOR_COPY.planNamePlaceholder}
        placeholderTextColor={theme.mutedForeground}
        className="mt-1.5 min-h-12 rounded-control border border-default bg-surface-card px-3 py-2 text-base leading-6 text-strong"
      />
      {errors['meta.name'] ? (
        <Text className="mt-1 text-xs font-medium text-danger-600">{errors['meta.name']}</Text>
      ) : null}

      {template && onTemplateDescription ? (
        <>
          <Text className="mt-4 text-xs font-semibold text-muted">
            {EDITOR_COPY.templateDescriptionLabel}
          </Text>
          <TextInput
            accessibilityLabel={EDITOR_COPY.templateDescriptionLabel}
            value={templateDescription}
            onChangeText={onTemplateDescription}
            editable={!disabled}
            multiline
            maxLength={TEMPLATE_DESCRIPTION_MAX}
            textAlignVertical="top"
            placeholder={EDITOR_COPY.templateDescriptionPlaceholder}
            placeholderTextColor={theme.mutedForeground}
            className="mt-1.5 min-h-20 rounded-control border border-default bg-surface-card px-3 py-2 text-base leading-6 text-strong"
          />
        </>
      ) : null}

      <Text className="mt-4 text-xs font-semibold text-muted">{EDITOR_COPY.strategyLabel}</Text>
      <View className="mt-1.5">
        <SegmentedTabs
          size="sm"
          items={allowed.map((strategy) => ({ value: strategy, label: STRATEGY_LABEL[strategy] }))}
          value={meta.strategy}
          onChange={(value) => {
            if (disabled) return
            dispatch({ type: 'SET_STRATEGY', value: value as NutritionStrategy })
          }}
        />
      </View>
      {flexibleBlocked ? (
        <Text className="mt-1.5 text-xs leading-5 text-muted">{EDITOR_COPY.flexibleBlocked}</Text>
      ) : null}
      {!hasNutritionPro ? (
        <View className="mt-1.5 flex-row items-center gap-1.5">
          <Lock color={theme.primary} size={13} />
          <Text className="min-w-0 flex-1 text-xs leading-5 text-muted">{EDITOR_COPY.hybridLocked}</Text>
        </View>
      ) : null}

      {isCreation ? (
        <>
          <Text className="mt-4 text-xs font-semibold text-muted">{EDITOR_COPY.effectiveFromLabel}</Text>
          <TextInput
            accessibilityLabel={EDITOR_COPY.effectiveFromLabel}
            value={effectiveFromText}
            onChangeText={(value) =>
              dispatch({ type: 'SET_EFFECTIVE_FROM', value: value.trim() === '' ? null : value })
            }
            editable={!disabled}
            maxLength={10}
            keyboardType="numbers-and-punctuation"
            inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
            returnKeyType="done"
            placeholder="AAAA-MM-DD"
            placeholderTextColor={theme.mutedForeground}
            className="mt-1.5 min-h-12 rounded-control border border-default bg-surface-card px-3 py-2 text-base leading-6 text-strong"
          />
          <Text className="mt-1 text-xs leading-5 text-muted">
            {ISO_DATE_RE.test(effectiveFromText)
              ? EDITOR_COPY.effectiveFromHint(
                  formatNutritionShortDate(effectiveFromText, { relative: true }),
                )
              : EDITOR_COPY.effectiveFromFormat}
          </Text>
          {errors['meta.effectiveFrom'] ? (
            <Text className="mt-1 text-xs font-medium text-danger-600">
              {errors['meta.effectiveFrom']}
            </Text>
          ) : null}
        </>
      ) : null}

      <View className="mt-4 gap-1">
        {PERMISSION_ROWS.map(([key, label, hint]) => (
          <PermissionRow
            key={key}
            label={label}
            hint={hint}
            checked={meta.permissions[key] === true}
            disabled={disabled}
            onToggle={() =>
              dispatch({ type: 'SET_PERMISSION', patch: { [key]: meta.permissions[key] !== true } })
            }
          />
        ))}
      </View>

      {meta.permissions.canAdjustPrescribedQuantity ? (
        <View className="mt-3 flex-row items-center justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold leading-5 text-strong">
              {EDITOR_COPY.adjustPercentLabel}
            </Text>
            <Text className="text-xs leading-5 text-muted">{EDITOR_COPY.adjustPercentHint}</Text>
          </View>
          <TextInput
            accessibilityLabel={EDITOR_COPY.adjustPercentLabel}
            value={
              meta.permissions.quantityAdjustmentPercent == null
                ? ''
                : String(meta.permissions.quantityAdjustmentPercent)
            }
            onChangeText={(value) =>
              dispatch({
                type: 'SET_PERMISSION',
                patch: { quantityAdjustmentPercent: clampPercent(value) },
              })
            }
            editable={!disabled}
            keyboardType="number-pad"
            inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
            returnKeyType="done"
            maxLength={3}
            placeholder="Sin tope"
            placeholderTextColor={theme.mutedForeground}
            className="min-h-12 w-28 rounded-control border border-default bg-surface-card px-3 py-2 text-right text-base leading-6 text-strong"
          />
        </View>
      ) : null}

      <View className="mt-4 flex-row items-start gap-1.5">
        <Info color={theme.textSecondary} size={14} />
        <Text className="min-w-0 flex-1 text-xs leading-5 text-muted">
          {template
            ? EDITOR_COPY.templateFooterInfo
            : isCreation
            ? EDITOR_COPY.footerCreation
            : futureDateLabel
              ? EDITOR_COPY.footerFuture(futureDateLabel)
              : EDITOR_COPY.footerToday}
        </Text>
      </View>
      </>
      ) : null}
    </NutritionCard>
  )
}

/**
 * Tope de ajuste: entero 0-100; vacio = SIN tope (null, no cero — un cero significaria "no
 * puede moverse ni un gramo"). Se sanea aca porque RN no tiene `<input type=number>`.
 */
function clampPercent(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, '')
  if (digits === '') return null
  const parsed = Number.parseInt(digits, 10)
  if (!Number.isFinite(parsed)) return null
  return Math.min(100, Math.max(0, parsed))
}

/**
 * Fila-checkbox de permiso: patron ya sancionado en el builder RN (Pressable +
 * accessibilityRole="checkbox"), tintada con `theme.primary` — jamas un hex (white-label).
 * La UI NO autoriza: los permisos son metadatos del plan y el enforcement vive en el read-model
 * del alumno y en el RPC.
 */
function PermissionRow({
  label,
  hint,
  checked,
  disabled,
  onToggle,
}: {
  label: string
  hint: string
  checked: boolean
  disabled: boolean
  onToggle: () => void
}) {
  const { theme } = useTheme()
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      disabled={disabled}
      onPress={onToggle}
      className="min-h-11 flex-row items-start gap-2.5 rounded-control px-1 py-1.5"
    >
      <View
        className={
          'mt-0.5 h-5 w-5 shrink-0 items-center justify-center rounded-control border ' +
          (checked ? 'border-transparent' : 'border-default bg-surface-card')
        }
        style={checked ? { backgroundColor: theme.primary } : undefined}
      >
        {checked ? <Check color={theme.primaryForeground} size={14} /> : null}
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm text-body">{label}</Text>
        <Text className="mt-0.5 text-xs text-muted">{hint}</Text>
      </View>
    </Pressable>
  )
}
