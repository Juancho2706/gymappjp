import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native'
import { Check, Trash2 } from 'lucide-react-native'
import {
  EXCHANGE_GROUP_PALETTE,
  EXCHANGE_GROUP_NAME_MAX,
  exchangeGroupKcalFromMacros,
  toExchangeGroupSlug,
} from '@eva/schemas'
import type { ExchangeGroup } from '@eva/nutrition-engine'
import { Sheet } from '../Sheet'
import { useTheme } from '../../context/ThemeContext'
import { PORTIONS_COPY } from '../../lib/nutrition-portions-copy'
import {
  createCoachExchangeGroup,
  deleteCoachExchangeGroup,
  updateCoachExchangeGroup,
} from '../../lib/nutrition-exchanges.coach'

/**
 * Alta/edición de un grupo de porciones PROPIO del coach (porciones propias §P-A, FD6a) —
 * espejo nativo del `PortionsGroupForm` web. Vive como sheet sobre el picker de grupos (builder
 * RN y quick-edit RN), así el coach crea "SHK" sin salir de la franja que está armando.
 *
 * ESCRITURA: exclusivamente `/api/mobile/nutrition/exchanges/groups` (POST/PATCH/DELETE) vía
 * `lib/nutrition-exchanges.coach.ts` — JAMÁS Supabase directo (lección NUT-005): el endpoint
 * corre `assertModule` server-side antes de escribir y reusa el mismo schema/servicio de la web,
 * así que la unicidad de código/slug, el cap de grupos propios y `macros_confirmed = false`
 * salen idénticos en las dos superficies.
 *
 * kcal: se autocalculan con Atwater (4/4/9, `exchangeGroupKcalFromMacros` del contrato
 * compartido) mientras el coach no las toque; en cuanto las edita a mano, el campo deja de
 * seguir a las macros (misma regla que la web).
 */

const COPY = PORTIONS_COPY.groupEditor

export interface ExchangeGroupFormInitial {
  id: string
  name: string
  code: string
  refCalories: number
  refProteinG: number
  refCarbsG: number
  refFatsG: number
  color: string | null
}

function numberText(value: number): string {
  return Number.isFinite(value) ? String(value) : ''
}

/** Texto libre -> número no negativo. Acepta coma decimal es-CL. `null` = inválido. */
function parseNonNegative(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.')
  if (normalized === '') return 0
  const n = Number(normalized)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Código sugerido desde el nombre: primeras letras del slug, en mayúsculas (máx 3). */
export function suggestExchangeGroupCode(name: string): string {
  const slug = toExchangeGroupSlug(name)
  const letters = slug.replace(/[^a-z]/g, '')
  return letters.slice(0, 3).toUpperCase()
}

export function ExchangeGroupFormSheet({
  open,
  initial,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean
  /** Presente = edición del grupo propio; ausente = alta. */
  initial?: ExchangeGroupFormInitial | null
  onClose: () => void
  onSaved: (group: ExchangeGroup) => void
  onDeleted?: (groupId: string) => void
}) {
  const { theme } = useTheme()
  const editing = initial != null

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [codeTouched, setCodeTouched] = useState(false)
  const [protein, setProtein] = useState('0')
  const [carbs, setCarbs] = useState('0')
  const [fats, setFats] = useState('0')
  const [kcal, setKcal] = useState('0')
  const [kcalTouched, setKcalTouched] = useState(false)
  const [color, setColor] = useState<string | null>(EXCHANGE_GROUP_PALETTE[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cada apertura rehidrata desde `initial` (el sheet no se desmonta entre aperturas).
  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setCode(initial?.code ?? '')
    setCodeTouched(initial != null)
    setProtein(numberText(initial?.refProteinG ?? 0))
    setCarbs(numberText(initial?.refCarbsG ?? 0))
    setFats(numberText(initial?.refFatsG ?? 0))
    setKcal(numberText(initial?.refCalories ?? 0))
    setKcalTouched(initial != null)
    setColor(initial?.color ?? EXCHANGE_GROUP_PALETTE[0])
    setSaving(false)
    setError(null)
  }, [open, initial])

  const autoKcal = useMemo(
    () =>
      exchangeGroupKcalFromMacros({
        refProteinG: parseNonNegative(protein) ?? 0,
        refCarbsG: parseNonNegative(carbs) ?? 0,
        refFatsG: parseNonNegative(fats) ?? 0,
      }),
    [protein, carbs, fats],
  )
  const kcalValue = kcalTouched ? kcal : String(autoKcal)

  function updateName(value: string) {
    setName(value)
    // El código sigue al nombre hasta que el coach lo escribe a mano (alta).
    if (!codeTouched) setCode(suggestExchangeGroupCode(value))
  }

  async function handleSave() {
    setError(null)
    const trimmedName = name.trim()
    if (trimmedName === '' || toExchangeGroupSlug(trimmedName).length === 0) {
      setError(COPY.nameRequired)
      return
    }
    const upperCode = code.trim().toUpperCase()
    if (!/^[A-Z]{1,3}$/.test(upperCode)) {
      setError(COPY.codeRequired)
      return
    }
    const refProteinG = parseNonNegative(protein)
    const refCarbsG = parseNonNegative(carbs)
    const refFatsG = parseNonNegative(fats)
    const refCalories = parseNonNegative(kcalValue)
    if (refProteinG == null || refCarbsG == null || refFatsG == null || refCalories == null) {
      setError(COPY.macrosRequired)
      return
    }

    const values = { name: trimmedName, code: upperCode, refCalories, refProteinG, refCarbsG, refFatsG, color }
    setSaving(true)
    const res = editing
      ? await updateCoachExchangeGroup(initial.id, values)
      : await createCoachExchangeGroup(values)
    setSaving(false)
    if (!res.ok) {
      setError(res.error || COPY.writeFailed)
      return
    }
    onSaved(res.group)
    onClose()
  }

  function handleDelete() {
    if (!editing || !onDeleted) return
    Alert.alert(COPY.deleteConfirmTitle(initial.name), COPY.deleteInUseNotice, [
      { text: COPY.cancel, style: 'cancel' },
      {
        text: COPY.deleteConfirm,
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSaving(true)
            const res = await deleteCoachExchangeGroup(initial.id)
            setSaving(false)
            if (!res.ok) {
              setError(res.error || COPY.writeFailed)
              return
            }
            onDeleted(initial.id)
            onClose()
          })()
        },
      },
    ])
  }

  const title = editing ? COPY.editTitle : COPY.createTitle

  return (
    <Sheet open={open} onClose={onClose} nativeModal snapPoints={['85%']} title={title} accessibilityLabel={title}>
      <View className="gap-3 pb-2">
        <View>
          <Text className="mb-1.5 text-sm font-semibold text-text-strong">{COPY.nameLabel}</Text>
          <TextInput
            accessibilityLabel={COPY.nameLabel}
            value={name}
            onChangeText={updateName}
            maxLength={EXCHANGE_GROUP_NAME_MAX}
            placeholder={COPY.namePlaceholder}
            placeholderTextColor={theme.mutedForeground}
            editable={!saving}
            className="min-h-11 rounded-control border border-border-default bg-surface-card px-3 py-2 text-base text-text-strong"
          />
        </View>

        <View>
          <Text className="mb-1.5 text-sm font-semibold text-text-strong">{COPY.codeLabel}</Text>
          <TextInput
            accessibilityLabel={COPY.codeLabel}
            value={code}
            onChangeText={(value) => {
              setCodeTouched(true)
              setCode(value.toUpperCase().replace(/[^A-Za-z]/g, '').slice(0, 3))
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={3}
            placeholder="SHK"
            placeholderTextColor={theme.mutedForeground}
            editable={!saving}
            className="min-h-11 w-24 rounded-control border border-border-default bg-surface-card px-3 py-2 text-base font-semibold text-text-strong"
          />
          <Text className="mt-1 text-xs text-text-muted">{COPY.codeHint}</Text>
        </View>

        <View>
          <Text className="mb-1.5 text-sm font-semibold text-text-strong">{COPY.macrosLabel}</Text>
          <View className="flex-row gap-2">
            {(
              [
                [COPY.proteinLabel, protein, setProtein],
                [COPY.carbsLabel, carbs, setCarbs],
                [COPY.fatsLabel, fats, setFats],
              ] as const
            ).map(([label, value, setter]) => (
              <View className="flex-1" key={label}>
                <Text className="mb-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</Text>
                <TextInput
                  accessibilityLabel={label}
                  value={value}
                  onChangeText={setter}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={theme.mutedForeground}
                  editable={!saving}
                  className="min-h-11 rounded-control border border-border-default bg-surface-card px-2 py-1.5 text-sm text-text-strong"
                  style={{ fontVariant: ['tabular-nums'] }}
                />
              </View>
            ))}
          </View>
        </View>

        <View>
          <Text className="mb-1.5 text-sm font-semibold text-text-strong">{COPY.kcalLabel}</Text>
          <TextInput
            accessibilityLabel={COPY.kcalLabel}
            value={kcalValue}
            onChangeText={(value) => {
              setKcalTouched(true)
              setKcal(value)
            }}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={theme.mutedForeground}
            editable={!saving}
            className="min-h-11 w-28 rounded-control border border-border-default bg-surface-card px-3 py-2 text-base text-text-strong"
            style={{ fontVariant: ['tabular-nums'] }}
          />
          <Text className="mt-1 text-xs text-text-muted">{COPY.kcalHint}</Text>
        </View>

        <View>
          <Text className="mb-1.5 text-sm font-semibold text-text-strong">{COPY.colorLabel}</Text>
          <View className="flex-row flex-wrap gap-2">
            {EXCHANGE_GROUP_PALETTE.map((swatch, index) => {
              const selected = color === swatch
              return (
                <Pressable
                  key={swatch}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={COPY.colorOption(index + 1)}
                  disabled={saving}
                  onPress={() => setColor(swatch)}
                  className={`h-11 w-11 items-center justify-center rounded-full border-2 ${
                    selected ? 'border-primary' : 'border-transparent'
                  }`}
                >
                  <View className="h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: swatch }}>
                    {selected ? <Check color="#FFFFFF" size={14} /> : null}
                  </View>
                </Pressable>
              )
            })}
          </View>
        </View>

        <View className="rounded-control border border-warning-500/30 bg-warning-500/10 px-3 py-2">
          <Text className="text-xs leading-5 text-warning-700">{COPY.referentialNotice}</Text>
        </View>

        {error ? (
          <View className="rounded-control border border-danger-500/30 bg-danger-500/10 px-3 py-2">
            <Text className="text-sm font-medium text-danger-600">{error}</Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={saving ? COPY.saving : COPY.save}
          accessibilityState={{ disabled: saving }}
          disabled={saving}
          onPress={() => void handleSave()}
          className={`min-h-12 flex-row items-center justify-center gap-2 rounded-control px-4 ${saving ? 'opacity-60' : ''}`}
          style={{ backgroundColor: theme.primary }}
        >
          {saving ? <ActivityIndicator color={theme.primaryForeground} size="small" /> : null}
          <Text className="text-sm font-bold" style={{ color: theme.primaryForeground }}>
            {saving ? COPY.saving : COPY.save}
          </Text>
        </Pressable>

        {editing && onDeleted ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.delete}
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            onPress={handleDelete}
            className="min-h-12 flex-row items-center justify-center gap-2 rounded-control border border-danger-500/30 bg-danger-500/10 px-4"
          >
            <Trash2 color={theme.destructive} size={16} />
            <Text className="text-sm font-semibold text-danger-600">{COPY.delete}</Text>
          </Pressable>
        ) : null}
      </View>
    </Sheet>
  )
}
