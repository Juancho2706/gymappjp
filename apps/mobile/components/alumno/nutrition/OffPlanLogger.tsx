import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { History, Plus, Search, Trash2, X } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { shadow } from '../../../lib/shadows'
import { MACRO_COLORS } from '../../MacroRingSummary'
import { EMBER_500, EMBER_700 } from './types'
import {
  deleteIntakeEntry,
  insertIntakeEntry,
  intakeEntryMacros,
  listIntakeEntriesForDate,
  listRecentIntakeFoods,
  searchIntakeFoods,
  sumIntakeMacros,
  type IntakeEntry,
  type IntakeFood,
  type IntakeMacros,
  type IntakeSource,
  type IntakeUnit,
} from '../../../lib/nutrition-intake.queries'

/**
 * OffPlanLogger (E4-11, seam // E4-SEAM-offplan) — registro de ingesta FUERA de
 * plan del alumno. Espejo funcional del web `OffPlanLogger`:
 *  - trigger "Registrar algo más" → hoja inferior con búsqueda debounced sobre el
 *    catálogo (RLS: global + coach) + fila de "Recientes" para quick-add,
 *  - al elegir un alimento se pide CANTIDAD (+ unidad g/ml/un) y se inserta,
 *  - lista de lo registrado hoy (con borrar) y su subtotal de macros.
 *
 * Base tier — NO gated. La seguridad la da la RLS client-scoped de
 * `nutrition_intake_entries` (ver `lib/nutrition-intake.queries.ts`); acá no hay
 * gate de módulo porque no hay cobro asociado.
 *
 * Solo se puede AGREGAR/BORRAR en el día de hoy (`isToday`). En días históricos la
 * sección es de solo lectura pero igual reporta su subtotal para que los anillos
 * del día reflejen lo que se comió fuera de plan (paridad con la web).
 *
 * Suma al total del día vía `onTotalsChange(extra)`: el shell la agrega al
 * `consumed` que alimenta `MacroRingSummary` (los anillos NO se editan aquí).
 */

const DENOM_MACRO_COLOR: Record<'protein' | 'carbs' | 'fats', string> = {
  protein: MACRO_COLORS.protein,
  carbs: MACRO_COLORS.carbs,
  fats: MACRO_COLORS.fats,
}

const UNITS: IntakeUnit[] = ['g', 'ml', 'un']
const SEARCH_DEBOUNCE_MS = 300
const SEARCH_MIN_CHARS = 2

export interface OffPlanLoggerProps {
  clientId: string
  /** Fecha del día activo (YYYY-MM-DD) a la que se imputa el registro. */
  logDate: string
  /** Solo el día de hoy permite agregar/borrar (histórico = lectura). */
  isToday: boolean
  /** Reporta el subtotal de macros fuera de plan al shell para sumarlo al día. */
  onTotalsChange?: (extra: IntakeMacros) => void
}

export function OffPlanLogger({ clientId, logDate, isToday, onTotalsChange }: OffPlanLoggerProps) {
  const { theme } = useTheme()

  const [entries, setEntries] = useState<IntakeEntry[]>([])
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<IntakeFood[]>([])
  const [searching, setSearching] = useState(false)
  const [recents, setRecents] = useState<IntakeFood[]>([])
  const [selected, setSelected] = useState<{ food: IntakeFood; source: IntakeSource } | null>(null)
  const [qty, setQty] = useState('100')
  const [unit, setUnit] = useState<IntakeUnit>('g')
  const [pending, setPending] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const reloadEntries = useCallback(async () => {
    const rows = await listIntakeEntriesForDate(clientId, logDate)
    setEntries(rows)
  }, [clientId, logDate])

  useEffect(() => {
    reloadEntries()
  }, [reloadEntries])

  // Subtotal → shell (se agrega al `consumed` del día). Estable por valor.
  const totals = useMemo(() => sumIntakeMacros(entries), [entries])
  const onTotalsRef = useRef(onTotalsChange)
  onTotalsRef.current = onTotalsChange
  useEffect(() => {
    onTotalsRef.current?.(totals)
  }, [totals])

  // Recientes al abrir (una vez por apertura); reset de estado transitorio.
  useEffect(() => {
    if (!open) return
    setTerm('')
    setResults([])
    setSelected(null)
    listRecentIntakeFoods(clientId).then(setRecents).catch(() => setRecents([]))
  }, [open, clientId])

  // Búsqueda debounced sobre el catálogo (solo con la hoja abierta y sin food elegido).
  useEffect(() => {
    if (!open || selected) return
    const trimmed = term.trim()
    if (trimmed.length < SEARCH_MIN_CHARS) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    let cancelled = false
    const timer = setTimeout(async () => {
      const hits = await searchIntakeFoods(trimmed)
      if (cancelled) return
      setResults(hits)
      setSearching(false)
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [term, open, selected])

  function pickFood(food: IntakeFood, source: IntakeSource) {
    setSelected({ food, source })
    setUnit(food.is_liquid ? 'ml' : 'g')
    setQty(String(Math.round(food.serving_size) || 100))
  }

  async function confirmAdd() {
    if (!selected || pending) return
    const quantity = Number(qty.replace(',', '.'))
    if (!Number.isFinite(quantity) || quantity <= 0) {
      Alert.alert('Cantidad inválida', 'Indica una cantidad mayor a 0.')
      return
    }
    setPending(true)
    const row = await insertIntakeEntry({
      clientId,
      logDate,
      foodId: selected.food.id,
      quantity,
      unit,
      source: selected.source,
    })
    setPending(false)
    if (!row) {
      Alert.alert('No se pudo registrar', 'Intenta de nuevo en un momento.')
      return
    }
    setEntries((prev) => [...prev, row])
    setSelected(null)
    setTerm('')
    setResults([])
  }

  async function removeEntry(id: string) {
    if (removingId) return
    setRemovingId(id)
    const ok = await deleteIntakeEntry(clientId, id)
    setRemovingId(null)
    if (ok) setEntries((prev) => prev.filter((e) => e.id !== id))
    else Alert.alert('No se pudo eliminar', 'Intenta de nuevo.')
  }

  const trimmed = term.trim()
  const showRecents = !selected && trimmed.length < SEARCH_MIN_CHARS && recents.length > 0
  const showEmpty = !selected && !searching && trimmed.length >= SEARCH_MIN_CHARS && results.length === 0
  const hasEntries = entries.length > 0

  // Nada que mostrar en días históricos sin registros → no ocupa espacio.
  if (!isToday && !hasEntries) return null

  return (
    <View
      testID="off-plan-logger"
      style={[
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          borderWidth: 1,
          borderRadius: theme.radius['2xl'],
          padding: 16,
          gap: 12,
        },
        shadow('sm', theme.scheme),
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text
          className="text-strong"
          style={{ flex: 1, fontFamily: FONT.displayBold, fontSize: 17, letterSpacing: -0.3 }}
        >
          Fuera de plan
        </Text>
        {hasEntries && (
          <View
            style={{
              backgroundColor: `${EMBER_500}1A`,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 3,
            }}
          >
            <Text
              style={{
                color: EMBER_700,
                fontFamily: FONT.monoBold,
                fontSize: 12,
                fontVariant: ['tabular-nums'],
              }}
            >
              +{Math.round(totals.calories)} kcal
            </Text>
          </View>
        )}
      </View>

      {hasEntries ? (
        <View style={{ gap: 8 }}>
          {entries.map((e) => {
            const m = intakeEntryMacros(e)
            const name = e.food?.name ?? e.custom_name ?? 'Alimento'
            return (
              <View
                key={e.id}
                testID={`off-plan-entry-${e.id}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <View style={{ flex: 1 }}>
                  <Text className="text-strong" style={{ fontFamily: FONT.uiSemibold, fontSize: 13.5 }} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text className="text-muted" style={{ fontFamily: FONT.uiMedium, fontSize: 11.5 }}>
                    {formatQty(e.quantity)} {e.unit} · {Math.round(m.calories)} kcal
                  </Text>
                </View>
                {isToday && (
                  <Pressable
                    testID={`off-plan-remove-${e.id}`}
                    onPress={() => removeEntry(e.id)}
                    hitSlop={10}
                    accessibilityLabel={`Eliminar ${name}`}
                    style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
                  >
                    {removingId === e.id ? (
                      <ActivityIndicator size="small" color={theme.mutedForeground} />
                    ) : (
                      <Trash2 size={16} color={theme.mutedForeground} strokeWidth={2} />
                    )}
                  </Pressable>
                )}
              </View>
            )
          })}
        </View>
      ) : (
        isToday && (
          <Text className="text-subtle" style={{ fontFamily: FONT.ui, fontSize: 11.5, lineHeight: 16 }}>
            ¿Comiste algo que no estaba en tu plan? Regístralo para que tus totales del día
            reflejen lo que comiste de verdad.
          </Text>
        )
      )}

      {isToday && (
        <Pressable
          testID="off-plan-open"
          onPress={() => setOpen(true)}
          style={{
            height: 48,
            borderRadius: theme.radius.lg,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: theme.border,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
          }}
        >
          <Plus size={16} color={theme.foreground} strokeWidth={2.25} />
          <Text className="text-strong" style={{ fontFamily: FONT.uiBold, fontSize: 14 }}>
            Registrar algo más
          </Text>
        </Pressable>
      )}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={() => setOpen(false)} />
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            maxHeight: '85%',
            backgroundColor: theme.card,
            borderTopLeftRadius: theme.radius['3xl'],
            borderTopRightRadius: theme.radius['3xl'],
            borderTopWidth: 1,
            borderColor: theme.border,
            paddingBottom: 28,
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: 8 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: theme.mutedForeground, opacity: 0.35 }} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8 }}>
            <Text className="text-strong" style={{ flex: 1, fontFamily: FONT.displayBold, fontSize: 18, letterSpacing: -0.3 }}>
              {selected ? '¿Cuánto comiste?' : 'Registrar algo más'}
            </Text>
            <Pressable
              testID="off-plan-close"
              onPress={() => setOpen(false)}
              hitSlop={10}
              accessibilityLabel="Cerrar"
              style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={20} color={theme.mutedForeground} strokeWidth={2} />
            </Pressable>
          </View>

          {selected ? (
            <View style={{ paddingHorizontal: 18, gap: 14 }}>
              <View style={{ backgroundColor: theme.muted, borderRadius: theme.radius.xl, padding: 14, gap: 10 }}>
                <Text className="text-strong" style={{ fontFamily: FONT.uiSemibold, fontSize: 15 }} numberOfLines={2}>
                  {selected.food.name}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TextInput
                    testID="off-plan-qty"
                    value={qty}
                    onChangeText={setQty}
                    keyboardType="numeric"
                    selectTextOnFocus
                    placeholder="0"
                    placeholderTextColor={theme.mutedForeground}
                    style={{
                      width: 96,
                      height: 48,
                      borderRadius: theme.radius.lg,
                      borderWidth: 1.5,
                      borderColor: theme.border,
                      backgroundColor: theme.card,
                      paddingHorizontal: 12,
                      color: theme.foreground,
                      fontFamily: FONT.monoMedium,
                      fontSize: 16,
                    }}
                  />
                  <View style={{ flexDirection: 'row', gap: 6, flex: 1 }}>
                    {UNITS.map((u) => {
                      const active = u === unit
                      return (
                        <Pressable
                          key={u}
                          testID={`off-plan-unit-${u}`}
                          onPress={() => setUnit(u)}
                          style={{
                            flex: 1,
                            height: 48,
                            borderRadius: theme.radius.lg,
                            borderWidth: 1.5,
                            borderColor: active ? EMBER_500 : theme.border,
                            backgroundColor: active ? `${EMBER_500}1A` : theme.card,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text
                            style={{
                              color: active ? EMBER_700 : theme.mutedForeground,
                              fontFamily: FONT.uiSemibold,
                              fontSize: 13,
                            }}
                          >
                            {u}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>
                <MacroPreview food={selected.food} qty={qty} unit={unit} />
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  testID="off-plan-cancel"
                  onPress={() => setSelected(null)}
                  style={{
                    flex: 1,
                    height: 50,
                    borderRadius: theme.radius.lg,
                    borderWidth: 1.5,
                    borderColor: theme.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text className="text-strong" style={{ fontFamily: FONT.uiSemibold, fontSize: 14 }}>
                    Volver
                  </Text>
                </Pressable>
                <Pressable
                  testID="off-plan-confirm"
                  onPress={confirmAdd}
                  disabled={pending}
                  style={{
                    flex: 1.4,
                    height: 50,
                    borderRadius: theme.radius.lg,
                    backgroundColor: EMBER_500,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pending ? 0.6 : 1,
                    flexDirection: 'row',
                    gap: 8,
                  }}
                >
                  {pending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Plus size={17} color="#FFFFFF" strokeWidth={2.5} />
                  )}
                  <Text style={{ color: '#FFFFFF', fontFamily: FONT.uiBold, fontSize: 14 }}>Agregar</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              <View style={{ paddingHorizontal: 18, paddingBottom: 8 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    height: 48,
                    borderRadius: theme.radius.lg,
                    borderWidth: 1.5,
                    borderColor: theme.border,
                    backgroundColor: theme.muted,
                    paddingHorizontal: 12,
                    gap: 8,
                  }}
                >
                  <Search size={18} color={theme.mutedForeground} strokeWidth={2} />
                  <TextInput
                    testID="off-plan-search"
                    value={term}
                    onChangeText={setTerm}
                    placeholder="Buscar alimento (ej: Pollo, Manzana…)"
                    placeholderTextColor={theme.mutedForeground}
                    autoCorrect={false}
                    style={{ flex: 1, color: theme.foreground, fontFamily: FONT.uiMedium, fontSize: 15, paddingVertical: 0 }}
                  />
                  {searching && <ActivityIndicator size="small" color={theme.mutedForeground} />}
                </View>
              </View>

              {showRecents && (
                <View style={{ paddingHorizontal: 18, paddingBottom: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <History size={13} color={theme.mutedForeground} strokeWidth={2} />
                    <Text className="text-muted" style={{ fontFamily: FONT.uiSemibold, fontSize: 11 }}>
                      Recientes
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {recents.map((f) => (
                      <Pressable
                        key={f.id}
                        testID={`off-plan-recent-${f.id}`}
                        onPress={() => pickFood(f, 'recent')}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          height: 40,
                          maxWidth: '100%',
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: theme.border,
                          backgroundColor: theme.muted,
                          paddingHorizontal: 12,
                        }}
                      >
                        <Plus size={13} color={theme.mutedForeground} strokeWidth={2} />
                        <Text className="text-strong" style={{ fontFamily: FONT.uiSemibold, fontSize: 12.5 }} numberOfLines={1}>
                          {f.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              <ScrollView
                style={{ maxHeight: 320 }}
                contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 8 }}
                keyboardShouldPersistTaps="handled"
              >
                {trimmed.length < SEARCH_MIN_CHARS && !showRecents && (
                  <Text className="text-subtle" style={{ paddingVertical: 34, textAlign: 'center', fontFamily: FONT.ui, fontSize: 12 }}>
                    Escribe al menos 2 letras para buscar un alimento del catálogo.
                  </Text>
                )}
                {showEmpty && (
                  <Text className="text-subtle" style={{ paddingVertical: 34, textAlign: 'center', fontFamily: FONT.ui, fontSize: 12 }}>
                    No se encontraron alimentos con “{trimmed}”.
                  </Text>
                )}
                {!selected &&
                  results.map((f) => (
                    <Pressable
                      key={f.id}
                      testID={`off-plan-result-${f.id}`}
                      onPress={() => pickFood(f, 'offplan')}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        minHeight: 52,
                        paddingVertical: 8,
                        borderBottomWidth: 1,
                        borderBottomColor: theme.border,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text className="text-strong" style={{ fontFamily: FONT.uiSemibold, fontSize: 14 }} numberOfLines={1}>
                          {f.name}
                        </Text>
                        {f.brand ? (
                          <Text className="text-muted" style={{ fontFamily: FONT.uiMedium, fontSize: 11.5 }} numberOfLines={1}>
                            {f.brand}
                          </Text>
                        ) : null}
                      </View>
                      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: theme.muted, alignItems: 'center', justifyContent: 'center' }}>
                        <Plus size={17} color={theme.foreground} strokeWidth={2.25} />
                      </View>
                    </Pressable>
                  ))}
              </ScrollView>
            </>
          )}
        </View>
      </Modal>
    </View>
  )
}

/** Vista previa de macros de la cantidad elegida (kcal + P/C/G). PURA. */
function MacroPreview({ food, qty, unit }: { food: IntakeFood; qty: string; unit: IntakeUnit }) {
  const quantity = Number(qty.replace(',', '.'))
  const preview = intakeEntryMacros({
    id: 'preview',
    log_date: '',
    food_id: food.id,
    custom_name: null,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 0,
    unit,
    source: 'offplan',
    created_at: '',
    food,
  })
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <Text style={{ color: MACRO_COLORS.kcal, fontFamily: FONT.monoBold, fontSize: 15, fontVariant: ['tabular-nums'] }}>
        {Math.round(preview.calories)} kcal
      </Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <MacroChip label="P" value={preview.protein} color={DENOM_MACRO_COLOR.protein} />
        <MacroChip label="C" value={preview.carbs} color={DENOM_MACRO_COLOR.carbs} />
        <MacroChip label="G" value={preview.fats} color={DENOM_MACRO_COLOR.fats} />
      </View>
    </View>
  )
}

function MacroChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ color, fontFamily: FONT.monoMedium, fontSize: 12, fontVariant: ['tabular-nums'] }}>
        {label} {Math.round(value)}
      </Text>
    </View>
  )
}

function formatQty(q: number): string {
  return Number.isInteger(q) ? String(q) : String(Math.round(q * 10) / 10)
}
