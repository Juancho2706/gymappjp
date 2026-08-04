import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { Check } from 'lucide-react-native'
import {
  EXCHANGE_GROUP_NAME_MAX,
  EXCHANGE_GROUP_PALETTE,
  exchangeGroupKcalFromMacros,
  suggestFreeExchangeGroupCode,
  toExchangeGroupSlug,
} from '@eva/schemas'
import type { ExchangeGroup } from '@eva/nutrition-engine'
import { Sheet } from '../Sheet'
import { Switch } from '../Switch'
import { toast } from '../Toast'
import { useTheme } from '../../context/ThemeContext'
import { PORTIONS_COPY } from '../../lib/nutrition-portions-copy'
import { duplicateNutritionV2ExchangeGroup } from '../../lib/nutrition-v2-exchange-groups.api'

/**
 * "Duplicar y ajustar" un grupo de porciones COPIANDO su lista de equivalencias (paridad T4.3
 * de la web `DuplicateGroupSheet`).
 *
 * Por qué existe: los grupos del sistema no se editan (la RLS `xg_update` los niega), así que la
 * salida al caso real —"el cereal aporta 15 g de carbos y yo trabajo con 20"— es duplicarlos. Pero
 * F1 duplicaba SOLO los macros: el grupo nuevo nacía vacío y el alumno abría "1 porción equivale
 * a" sin un solo ejemplo. Acá la lista viaja completa y REESCALADA por regla de tres, así que
 * ajustar los carbos recalcula los 715 alimentos de Cereales en dos toques.
 *
 * El reescalado es SIEMPRE server-side (`duplicateExchangeGroupWithList`): el teléfono no lleva
 * una copia de la fórmula y por eso jamás puede producir gramos distintos del navegador. La
 * escritura va por `/api/mobile/nutrition/exchanges/groups` (PUT) — cero Supabase directo (NUT-005).
 *
 * Falla PARCIAL contemplada: si el grupo se creó pero la copia falló, el grupo se CONSERVA y se
 * avisa con `copyFailed`; deshacerlo dejaría al coach sin lo que sí pidió.
 */

const COPY = PORTIONS_COPY.groupEditor
const LIST_COPY = PORTIONS_COPY.exchangeList

/** Texto libre -> número no negativo. Acepta coma decimal es-CL. `null` = inválido. */
function parseNonNegative(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.')
  if (normalized === '') return 0
  const n = Number(normalized)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function numberText(value: number): string {
  return Number.isFinite(value) ? String(value) : '0'
}

/**
 * El color viaja como enum cerrado (`EXCHANGE_GROUP_PALETTE`) al servidor: un grupo del sistema
 * con un color fuera de la paleta haría fallar la duplicación con un 400 opaco. Se cae al primer
 * swatch en vez de arrastrar un valor que el schema va a rechazar.
 */
function paletteColorOf(color: string | null): string {
  return color != null && (EXCHANGE_GROUP_PALETTE as readonly string[]).includes(color)
    ? color
    : EXCHANGE_GROUP_PALETTE[0]
}

export function DuplicateGroupSheet({
  open,
  source,
  takenCodes,
  onClose,
  onDuplicated,
}: {
  open: boolean
  /** Grupo ORIGEN: da los macros de partida y es la referencia del reescalado (server-side). */
  source: ExchangeGroup
  /** Códigos ya ocupados del catálogo en memoria: evita el viaje que iba a chocar con la unicidad. */
  takenCodes: readonly string[]
  onClose: () => void
  /** `copied` = equivalencias que efectivamente entraron (0 si no se copió o si la copia falló). */
  onDuplicated: (group: ExchangeGroup, copied: number) => void
}) {
  const { theme } = useTheme()

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [protein, setProtein] = useState('0')
  const [carbs, setCarbs] = useState('0')
  const [fats, setFats] = useState('0')
  const [kcal, setKcal] = useState('0')
  const [kcalTouched, setKcalTouched] = useState(false)
  const [color, setColor] = useState<string>(EXCHANGE_GROUP_PALETTE[0])
  const [copyList, setCopyList] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // `takenCodes` cambia de identidad en cada render del padre: el prefill solo corre al ABRIR.
  useEffect(() => {
    if (!open) return
    setName(COPY.duplicateSuffix(source.name).slice(0, EXCHANGE_GROUP_NAME_MAX))
    setCode(suggestFreeExchangeGroupCode(source.code, takenCodes))
    setProtein(numberText(source.refProteinG))
    setCarbs(numberText(source.refCarbsG))
    setFats(numberText(source.refFatsG))
    setKcal(numberText(source.refCalories))
    setKcalTouched(true)
    setColor(paletteColorOf(source.color))
    setCopyList(true)
    setSaving(false)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source])

  // kcal se autocalculan con Atwater (4/4/9) en cuanto el coach toca una macro, y dejan de
  // seguirlas si las escribe a mano — misma regla que la web y que `ExchangeGroupFormSheet`.
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

  function updateMacro(setter: (value: string) => void) {
    return (value: string) => {
      setKcalTouched(false)
      setter(value)
    }
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

    setSaving(true)
    const res = await duplicateNutritionV2ExchangeGroup({
      sourceGroupId: source.id,
      name: trimmedName,
      code: upperCode,
      refCalories,
      refProteinG,
      refCarbsG,
      refFatsG,
      color,
      copyList,
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error || COPY.writeFailed)
      return
    }

    if (res.copyError) {
      toast.error(LIST_COPY.copyFailed)
    } else if (copyList) {
      toast.success(
        res.copied === res.attempted
          ? LIST_COPY.copied(res.copied)
          : LIST_COPY.copyPartial(res.copied, res.attempted),
      )
    } else {
      toast.success(LIST_COPY.saved)
    }
    onDuplicated(res.group, res.copyError ? 0 : res.copied)
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      nativeModal
      snapPoints={['85%']}
      title={COPY.duplicateTitle}
      accessibilityLabel={COPY.duplicateTitle}
    >
      <View className="gap-3 pb-2">
        <Text className="text-xs leading-5 text-muted">{COPY.duplicateHint}</Text>

        <View>
          <Text className="mb-1.5 text-sm font-semibold text-strong">{COPY.nameLabel}</Text>
          <TextInput
            accessibilityLabel={COPY.nameLabel}
            value={name}
            onChangeText={setName}
            maxLength={EXCHANGE_GROUP_NAME_MAX}
            placeholder={COPY.namePlaceholder}
            placeholderTextColor={theme.mutedForeground}
            editable={!saving}
            className="min-h-11 rounded-control border border-default bg-surface-card px-3 py-2 text-base text-strong"
          />
        </View>

        <View>
          <Text className="mb-1.5 text-sm font-semibold text-strong">{COPY.codeLabel}</Text>
          <TextInput
            accessibilityLabel={COPY.codeLabel}
            value={code}
            onChangeText={(value) => setCode(value.toUpperCase().replace(/[^A-Za-z]/g, '').slice(0, 3))}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={3}
            placeholder="CA"
            placeholderTextColor={theme.mutedForeground}
            editable={!saving}
            className="min-h-11 w-24 rounded-control border border-default bg-surface-card px-3 py-2 text-base font-semibold text-strong"
          />
          <Text className="mt-1 text-xs text-muted">{COPY.codeHint}</Text>
        </View>

        <View>
          <Text className="mb-1.5 text-sm font-semibold text-strong">{COPY.macrosLabel}</Text>
          <View className="flex-row gap-2">
            {(
              [
                [COPY.proteinLabel, protein, setProtein],
                [COPY.carbsLabel, carbs, setCarbs],
                [COPY.fatsLabel, fats, setFats],
              ] as const
            ).map(([label, value, setter]) => (
              <View className="flex-1" key={label}>
                <Text className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted">{label}</Text>
                <TextInput
                  accessibilityLabel={label}
                  value={value}
                  onChangeText={updateMacro(setter)}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={theme.mutedForeground}
                  editable={!saving}
                  className="min-h-11 rounded-control border border-default bg-surface-card px-2 py-1.5 text-sm text-strong"
                  style={{ fontVariant: ['tabular-nums'] }}
                />
              </View>
            ))}
          </View>
        </View>

        <View>
          <Text className="mb-1.5 text-sm font-semibold text-strong">{COPY.kcalLabel}</Text>
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
            className="min-h-11 w-28 rounded-control border border-default bg-surface-card px-3 py-2 text-base text-strong"
            style={{ fontVariant: ['tabular-nums'] }}
          />
          <Text className="mt-1 text-xs text-muted">{COPY.kcalHint}</Text>
        </View>

        <View>
          <Text className="mb-1.5 text-sm font-semibold text-strong">{COPY.colorLabel}</Text>
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

        {/* Copiar la lista: ON por defecto. Es lo que convierte el duplicado en útil — sin esto el
            grupo nuevo nace vacío y el alumno no ve un solo ejemplo. */}
        <View className="min-h-hit-min flex-row items-center gap-3 rounded-control border border-default bg-surface-card px-3 py-2.5">
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-strong">{LIST_COPY.copyListLabel}</Text>
            <Text className="mt-0.5 text-xs text-muted">{LIST_COPY.copyListHint}</Text>
          </View>
          <Switch value={copyList} onValueChange={setCopyList} disabled={saving} />
        </View>

        <View className="rounded-control border border-warning-500/30 bg-warning-500/10 px-3 py-2">
          <Text className="text-xs leading-5 text-warning-700">{COPY.referentialNotice}</Text>
        </View>

        {error ? (
          <View className="rounded-control border border-danger-500/30 bg-danger-500/10 px-3 py-2">
            <Text className="text-sm font-medium text-danger-600">{error}</Text>
          </View>
        ) : null}

        <View className="flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.cancel}
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            onPress={onClose}
            className="min-h-12 flex-1 flex-row items-center justify-center rounded-control border border-default bg-surface-card px-4"
          >
            <Text className="text-sm font-semibold text-strong">{COPY.cancel}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={saving ? COPY.saving : COPY.duplicate}
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            onPress={() => void handleSave()}
            className={`min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-control px-4 ${saving ? 'opacity-60' : ''}`}
            style={{ backgroundColor: theme.primary }}
          >
            {saving ? <ActivityIndicator color={theme.primaryForeground} size="small" /> : null}
            <Text className="text-sm font-bold" style={{ color: theme.primaryForeground }}>
              {saving ? COPY.saving : COPY.duplicate}
            </Text>
          </Pressable>
        </View>
      </View>
    </Sheet>
  )
}
