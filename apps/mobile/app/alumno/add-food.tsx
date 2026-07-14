import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { CameraView, type BarcodeScanningResult, useCameraPermissions } from 'expo-camera'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Barcode,
  ChevronLeft,
  Clock3,
  Plus,
  Search,
  ScanLine,
} from 'lucide-react-native'
import {
  NUTRITION_INTAKE_ACTIONS,
  type NutritionIntakeActionId,
} from '@eva/nutrition-engine'
import { AppBackground } from '../../components/AppBackground'
import { useTheme } from '../../context/ThemeContext'
import { getClientProfile } from '../../lib/client'
import { getTodayInSantiago } from '../../lib/date-utils'
import { FONT } from '../../lib/typography'
import {
  findIntakeFoodByBarcode,
  insertIntakeEntry,
  intakeEntryMacros,
  listRecentIntakeFoods,
  recordMissingFoodBarcode,
  searchIntakeFoods,
  type IntakeFood,
  type IntakeSource,
  type IntakeUnit,
} from '../../lib/nutrition-intake.queries'

const EMBER = '#FF6A3D'
const UNITS: IntakeUnit[] = ['g', 'ml', 'un']
const SEARCH_DEBOUNCE_MS = 300

export default function AddFoodScreen() {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [clientId, setClientId] = useState<string | null>(null)
  const [mode, setMode] = useState<NutritionIntakeActionId>('search')
  const [term, setTerm] = useState('')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [results, setResults] = useState<IntakeFood[]>([])
  const [recents, setRecents] = useState<IntakeFood[]>([])
  const [selected, setSelected] = useState<{ food: IntakeFood; source: IntakeSource } | null>(null)
  const [quantity, setQuantity] = useState('100')
  const [unit, setUnit] = useState<IntakeUnit>('g')
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [lookingUpBarcode, setLookingUpBarcode] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerLocked, setScannerLocked] = useState(false)
  const [saving, setSaving] = useState(false)

  const today = getTodayInSantiago().iso

  useEffect(() => {
    let alive = true
    Promise.all([getClientProfile(), listRecentIntakeFoodsFromSession()])
      .then(([client, recentFoods]) => {
        if (!alive) return
        setClientId(client?.id ?? null)
        setRecents(recentFoods)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  async function listRecentIntakeFoodsFromSession(): Promise<IntakeFood[]> {
    const client = await getClientProfile()
    if (!client) return []
    return listRecentIntakeFoods(client.id, 12)
  }

  useEffect(() => {
    if (mode !== 'search' || selected) return
    const normalized = term.trim()
    if (normalized.length < 2) {
      setResults([])
      setSearching(false)
      return
    }

    let cancelled = false
    setSearching(true)
    const timer = setTimeout(() => {
      searchIntakeFoods(normalized, 40)
        .then((rows) => {
          if (!cancelled) setResults(rows)
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [mode, selected, term])

  function pickFood(food: IntakeFood, source: IntakeSource) {
    setSelected({ food, source })
    setQuantity(String(Math.round(food.serving_size) || 100))
    setUnit(food.is_liquid ? 'ml' : 'g')
    setScannerOpen(false)
    setScannerLocked(false)
  }

  async function lookupBarcode(rawCode: string) {
    if (!clientId || lookingUpBarcode) return
    setLookingUpBarcode(true)
    const result = await findIntakeFoodByBarcode(rawCode)
    setLookingUpBarcode(false)

    if (result.status === 'found') {
      setBarcodeInput(result.barcode)
      pickFood(result.food, 'quickadd')
      return
    }

    if (result.status === 'invalid') {
      Alert.alert('Código inválido', 'EVA acepta GTIN/EAN/UPC de 8, 12, 13 o 14 dígitos con checksum válido.')
      return
    }

    if (result.status === 'not_found') {
      await recordMissingFoodBarcode(clientId, result.barcode)
      Alert.alert(
        'Producto no encontrado',
        'El código quedó registrado para ampliar el catálogo chileno. Puedes buscar el alimento por nombre y registrarlo igualmente.',
      )
      setMode('search')
      setTerm('')
      return
    }

    Alert.alert(
      'Catálogo por código aún no disponible',
      'La búsqueda normal sigue funcionando. El soporte de códigos se activará después de aprobar la migración aditiva del catálogo.',
    )
  }

  async function openScanner() {
    if (!cameraPermission?.granted) {
      const response = await requestCameraPermission()
      if (!response.granted) {
        Alert.alert('Permiso de cámara', 'Autoriza la cámara para escanear códigos o escríbelo manualmente.')
        return
      }
    }
    setScannerLocked(false)
    setScannerOpen(true)
  }

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (scannerLocked) return
    setScannerLocked(true)
    setBarcodeInput(result.data)
    void lookupBarcode(result.data).finally(() => setScannerLocked(false))
  }

  async function save() {
    if (!clientId || !selected || saving) return
    const parsedQuantity = Number(quantity.replace(',', '.'))
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      Alert.alert('Cantidad inválida', 'Indica una cantidad mayor a cero.')
      return
    }

    setSaving(true)
    const row = await insertIntakeEntry({
      clientId,
      logDate: today,
      foodId: selected.food.id,
      quantity: parsedQuantity,
      unit,
      source: selected.source,
    })
    setSaving(false)

    if (!row) {
      Alert.alert('No se pudo registrar', 'Revisa tu conexión e intenta nuevamente.')
      return
    }

    Alert.alert('Alimento registrado', `${selected.food.name} fue agregado al consumo de hoy.`, [
      { text: 'Listo', onPress: () => router.back() },
    ])
  }

  const preview = useMemo(() => {
    if (!selected) return null
    const parsedQuantity = Number(quantity.replace(',', '.'))
    return intakeEntryMacros({
      id: 'preview',
      log_date: today,
      food_id: selected.food.id,
      custom_name: null,
      quantity: Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 0,
      unit,
      source: selected.source,
      created_at: '',
      food: selected.food,
    })
  }, [quantity, selected, today, unit])

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' }}>
        <AppBackground />
        <ActivityIndicator color={EMBER} />
      </View>
    )
  }

  if (!clientId) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top + 24, paddingHorizontal: 20 }}>
        <AppBackground />
        <Text style={{ color: theme.foreground, fontFamily: FONT.displayBold, fontSize: 22 }}>No encontramos tu perfil</Text>
        <Text style={{ color: theme.mutedForeground, fontFamily: FONT.ui, fontSize: 14, marginTop: 8 }}>
          Vuelve a iniciar sesión e intenta nuevamente.
        </Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <AppBackground />
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Volver"
          style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: theme.muted, alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronLeft size={21} color={theme.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.foreground, fontFamily: FONT.displayBold, fontSize: 20, letterSpacing: -0.4 }}>
            Registrar alimento
          </Text>
          <Text style={{ color: theme.mutedForeground, fontFamily: FONT.uiMedium, fontSize: 11, marginTop: 2 }}>
            Consumo real · Hoy
          </Text>
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 36, gap: 16 }}
      >
        {!selected ? (
          <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {NUTRITION_INTAKE_ACTIONS.map((action) => {
                const active = mode === action.id
                const Icon = action.id === 'search' ? Search : action.id === 'barcode' ? Barcode : Clock3
                return (
                  <Pressable
                    key={action.id}
                    onPress={() => setMode(action.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={{
                      flex: 1,
                      minHeight: 72,
                      borderRadius: 18,
                      borderWidth: 1.5,
                      borderColor: active ? EMBER : theme.border,
                      backgroundColor: active ? `${EMBER}18` : theme.card,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingHorizontal: 6,
                    }}
                  >
                    <Icon size={19} color={active ? EMBER : theme.mutedForeground} strokeWidth={2.2} />
                    <Text
                      numberOfLines={1}
                      style={{ color: active ? EMBER : theme.foreground, fontFamily: FONT.uiBold, fontSize: 11.5 }}
                    >
                      {action.shortLabel}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            {mode === 'search' && (
              <View style={{ gap: 12 }}>
                <SearchField value={term} onChangeText={setTerm} searching={searching} />
                {term.trim().length < 2 ? (
                  <Hint text="Escribe al menos dos letras. EVA consulta el catálogo local guardado en Supabase." />
                ) : results.length === 0 && !searching ? (
                  <Hint text={`No encontramos “${term.trim()}”. Prueba con otra palabra o una marca.`} />
                ) : (
                  <FoodList foods={results} onPick={(food) => pickFood(food, 'offplan')} />
                )}
              </View>
            )}

            {mode === 'barcode' && (
              <View style={{ gap: 14 }}>
                <View style={{ padding: 16, borderRadius: 22, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, gap: 12 }}>
                  <View style={{ width: 46, height: 46, borderRadius: 16, backgroundColor: `${EMBER}18`, alignItems: 'center', justifyContent: 'center' }}>
                    <ScanLine size={23} color={EMBER} />
                  </View>
                  <Text style={{ color: theme.foreground, fontFamily: FONT.displayBold, fontSize: 18 }}>Escanea sin llamadas externas</Text>
                  <Text style={{ color: theme.mutedForeground, fontFamily: FONT.ui, fontSize: 13, lineHeight: 18 }}>
                    La cámara solo lee el GTIN. EVA busca el producto en su catálogo local chileno.
                  </Text>
                  <Pressable
                    onPress={openScanner}
                    style={{ height: 50, borderRadius: 16, backgroundColor: EMBER, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
                  >
                    <ScanLine size={18} color="#FFFFFF" />
                    <Text style={{ color: '#FFFFFF', fontFamily: FONT.uiBold, fontSize: 14 }}>Abrir cámara</Text>
                  </Pressable>
                </View>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    value={barcodeInput}
                    onChangeText={setBarcodeInput}
                    keyboardType="number-pad"
                    placeholder="Escribe EAN / GTIN"
                    placeholderTextColor={theme.mutedForeground}
                    style={{
                      flex: 1,
                      height: 50,
                      borderRadius: 16,
                      borderWidth: 1.5,
                      borderColor: theme.border,
                      backgroundColor: theme.card,
                      paddingHorizontal: 14,
                      color: theme.foreground,
                      fontFamily: FONT.monoMedium,
                      fontSize: 14,
                    }}
                  />
                  <Pressable
                    disabled={lookingUpBarcode}
                    onPress={() => lookupBarcode(barcodeInput)}
                    style={{ width: 54, height: 50, borderRadius: 16, backgroundColor: theme.foreground, alignItems: 'center', justifyContent: 'center', opacity: lookingUpBarcode ? 0.55 : 1 }}
                  >
                    {lookingUpBarcode ? (
                      <ActivityIndicator color={theme.background} />
                    ) : (
                      <Search size={19} color={theme.background} />
                    )}
                  </Pressable>
                </View>
              </View>
            )}

            {mode === 'recent' && (
              recents.length > 0 ? (
                <FoodList foods={recents} onPick={(food) => pickFood(food, 'recent')} />
              ) : (
                <Hint text="Tus alimentos recientes aparecerán aquí después del primer registro." />
              )
            )}
          </>
        ) : (
          <View style={{ gap: 16 }}>
            <View style={{ padding: 18, borderRadius: 24, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, gap: 14 }}>
              <View>
                <Text style={{ color: theme.foreground, fontFamily: FONT.displayBold, fontSize: 20 }} numberOfLines={2}>
                  {selected.food.name}
                </Text>
                {selected.food.brand ? (
                  <Text style={{ color: theme.mutedForeground, fontFamily: FONT.uiMedium, fontSize: 12, marginTop: 3 }}>
                    {selected.food.brand}
                  </Text>
                ) : null}
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  style={{
                    width: 112,
                    height: 52,
                    borderRadius: 16,
                    borderWidth: 1.5,
                    borderColor: theme.border,
                    backgroundColor: theme.muted,
                    paddingHorizontal: 14,
                    color: theme.foreground,
                    fontFamily: FONT.monoMedium,
                    fontSize: 17,
                  }}
                />
                <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
                  {UNITS.map((value) => {
                    const active = unit === value
                    return (
                      <Pressable
                        key={value}
                        onPress={() => setUnit(value)}
                        style={{
                          flex: 1,
                          height: 52,
                          borderRadius: 16,
                          borderWidth: 1.5,
                          borderColor: active ? EMBER : theme.border,
                          backgroundColor: active ? `${EMBER}18` : theme.muted,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ color: active ? EMBER : theme.mutedForeground, fontFamily: FONT.uiBold, fontSize: 13 }}>
                          {value}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>

              {preview ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <Metric label="kcal" value={preview.calories} color={EMBER} />
                  <Metric label="P" value={preview.protein} color="#2680FF" />
                  <Metric label="C" value={preview.carbs} color="#18ABD4" />
                  <Metric label="G" value={preview.fats} color="#F5A524" />
                </View>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => setSelected(null)}
                style={{ flex: 1, height: 52, borderRadius: 17, borderWidth: 1.5, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: theme.foreground, fontFamily: FONT.uiBold, fontSize: 14 }}>Volver</Text>
              </Pressable>
              <Pressable
                disabled={saving}
                onPress={save}
                style={{ flex: 1.4, height: 52, borderRadius: 17, backgroundColor: EMBER, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: saving ? 0.6 : 1 }}
              >
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Plus size={18} color="#FFFFFF" />}
                <Text style={{ color: '#FFFFFF', fontFamily: FONT.uiBold, fontSize: 14 }}>Agregar al día</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      {scannerOpen ? (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: '#000000', zIndex: 100 }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            onBarcodeScanned={scannerLocked ? undefined : handleBarcodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'itf14'] }}
          />
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
            <View style={{ width: '78%', height: 180, borderRadius: 24, borderWidth: 3, borderColor: '#FFFFFF' }} />
            <Text style={{ color: '#FFFFFF', fontFamily: FONT.uiBold, fontSize: 14, marginTop: 18 }}>
              Centra el código dentro del marco
            </Text>
          </View>
          <Pressable
            onPress={() => setScannerOpen(false)}
            style={{ position: 'absolute', top: insets.top + 12, left: 16, height: 46, paddingHorizontal: 16, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontFamily: FONT.uiBold, fontSize: 14 }}>Cerrar</Text>
          </Pressable>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  )
}

function SearchField({
  value,
  onChangeText,
  searching,
}: {
  value: string
  onChangeText: (value: string) => void
  searching: boolean
}) {
  const { theme } = useTheme()
  return (
    <View style={{ height: 52, borderRadius: 17, borderWidth: 1.5, borderColor: theme.border, backgroundColor: theme.card, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }}>
      <Search size={19} color={theme.mutedForeground} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        autoCorrect={false}
        placeholder="Buscar pollo, marraqueta, yogur…"
        placeholderTextColor={theme.mutedForeground}
        style={{ flex: 1, color: theme.foreground, fontFamily: FONT.uiMedium, fontSize: 15, paddingVertical: 0 }}
      />
      {searching ? <ActivityIndicator color={theme.mutedForeground} /> : null}
    </View>
  )
}

function FoodList({ foods, onPick }: { foods: IntakeFood[]; onPick: (food: IntakeFood) => void }) {
  const { theme } = useTheme()
  return (
    <View style={{ borderRadius: 22, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, overflow: 'hidden' }}>
      {foods.map((food, index) => (
        <Pressable
          key={food.id}
          onPress={() => onPick(food)}
          style={{
            minHeight: 64,
            paddingHorizontal: 16,
            paddingVertical: 11,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            borderTopWidth: index === 0 ? 0 : 1,
            borderTopColor: theme.border,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.foreground, fontFamily: FONT.uiSemibold, fontSize: 14 }} numberOfLines={1}>
              {food.name}
            </Text>
            <Text style={{ color: theme.mutedForeground, fontFamily: FONT.uiMedium, fontSize: 11.5, marginTop: 2 }} numberOfLines={1}>
              {food.brand ? `${food.brand} · ` : ''}{food.serving_size} {food.serving_unit ?? 'g'} · {food.calories} kcal
            </Text>
          </View>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: `${EMBER}18`, alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={17} color={EMBER} />
          </View>
        </Pressable>
      ))}
    </View>
  )
}

function Hint({ text }: { text: string }) {
  const { theme } = useTheme()
  return (
    <View style={{ padding: 22, borderRadius: 20, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card }}>
      <Text style={{ color: theme.mutedForeground, fontFamily: FONT.ui, fontSize: 13, lineHeight: 19, textAlign: 'center' }}>
        {text}
      </Text>
    </View>
  )
}

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: `${color}18`, flexDirection: 'row', gap: 5 }}>
      <Text style={{ color, fontFamily: FONT.monoBold, fontSize: 12 }}>{Math.round(value)}</Text>
      <Text style={{ color, fontFamily: FONT.uiBold, fontSize: 11 }}>{label}</Text>
    </View>
  )
}
