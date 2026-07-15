import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera'
import { Flashlight, FlashlightOff, ScanBarcode } from 'lucide-react-native'
import {
  FoodThumbnail,
  NutritionCard,
  NutritionHeader,
  NutritionMotionButton,
  NutritionStatePanel,
} from '../../../components/nutrition-v2'
import type { FoodBarcodeLookupReadModel } from '@eva/nutrition-v2'
import { isEnabled } from '../../../lib/flags'
import { useEntitlements } from '../../../lib/entitlements'
import { supabase } from '../../../lib/supabase'
import {
  foodMediaPublicUrl,
  lookupFoodByGtinV2,
  reportMissingFoodGtinV2,
} from '../../../lib/nutrition-v2-catalog.api'
import * as Haptics from 'expo-haptics'
import { buildRecordIntakeMutation } from '../../../lib/nutrition-v2-intake'
import {
  getStableDeviceId,
  newNutritionV2OperationId,
  submitRecordIntake,
} from '../../../lib/nutrition-v2-intake-runner'

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const

export default function NutritionV2ScannerScreen() {
  const entitlements = useEntitlements()
  const [permission, requestPermission] = useCameraPermissions()
  const [userId, setUserId] = useState<string | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [result, setResult] = useState<FoodBarcodeLookupReadModel | null>(null)
  const [loading, setLoading] = useState(false)
  const [reported, setReported] = useState(false)
  const [torch, setTorch] = useState(false)
  const [scannerPaused, setScannerPaused] = useState(false)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [addedId, setAddedId] = useState<string | null>(null)
  const lastScanRef = useRef<{ code: string; at: number } | null>(null)
  const enabled = entitlements.ready && isEnabled('nutritionV2Student')
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id ?? null)
    })
    void getStableDeviceId().then((id) => {
      if (active) setDeviceId(id)
    })
    return () => {
      active = false
    }
  }, [])

  const lookup = useCallback(async (rawCode: string) => {
    const code = rawCode.replace(/\D/g, '')
    if (!code || loading) return
    setLoading(true)
    setReported(false)
    setScannerPaused(true)
    try {
      const next = await lookupFoodByGtinV2({ gtin: code, countryCode: 'CL' })
      setResult(next)
      setManualCode(code)
    } catch {
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [loading])

  const onBarcodeScanned = useCallback((event: BarcodeScanningResult) => {
    if (scannerPaused || loading) return
    const code = event.data.replace(/\D/g, '')
    const previous = lastScanRef.current
    const now = Date.now()
    if (previous?.code === code && now - previous.at < 2_000) return
    lastScanRef.current = { code, at: now }
    void lookup(code)
  }, [loading, lookup, scannerPaused])

  const mediaUrl = useMemo(() => {
    if (
      !supabaseUrl ||
      !result ||
      (result.status !== 'found' && result.status !== 'pending_verification') ||
      !result.food.media
    ) return null
    return foodMediaPublicUrl({
      supabaseUrl,
      bucket: result.food.media.bucket,
      objectPath: result.food.media.objectPath,
      version: result.food.media.version,
    })
  }, [result, supabaseUrl])

  const addToDay = useCallback(async () => {
    if (!userId || !deviceId || adding) return
    if (!result || (result.status !== 'found' && result.status !== 'pending_verification')) return
    const food = result.food
    setAdding(true)
    try {
      const localDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date())
      const payload = buildRecordIntakeMutation({
        clientId: userId,
        deviceId,
        operationId: newNutritionV2OperationId(),
        localDate,
        occurredAt: new Date().toISOString(),
        timezone: 'America/Santiago',
        foodId: food.id,
        quantity: food.servingSize > 0 ? food.servingSize : 100,
        unit: food.servingUnit === 'ml' ? 'ml' : 'g',
        mealSlot: null,
        source: 'offplan',
        captureMethod: 'barcode',
        snapshot: {
          name: food.name,
          brand: food.brand,
          calories: food.calories,
          proteinG: food.proteinG,
          carbsG: food.carbsG,
          fatsG: food.fatsG,
          fiberG: food.fiberG,
          servingSize: food.servingSize,
          servingUnit: food.servingUnit,
        },
      })
      const outcome = await submitRecordIntake(userId, payload)
      void Haptics.notificationAsync(
        outcome.status === 'recorded'
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      )
      if (outcome.status === 'recorded' || outcome.status === 'queued') {
        setAddedId(food.id)
      } else {
        Alert.alert('No se pudo registrar', outcome.error.message)
      }
    } catch {
      Alert.alert('No se pudo registrar', 'Intenta nuevamente.')
    } finally {
      setAdding(false)
    }
  }, [adding, deviceId, result, userId])

  if (!entitlements.ready) {
    return <View className="flex-1 bg-surface-app" />
  }

  if (!enabled) {
    return (
      <View className="flex-1 bg-surface-app px-4 pt-6">
        <NutritionStatePanel
          icon="permission"
          title="Scanner V2 no habilitado"
          description="El lector solo está disponible para alumnos incluidos en el canary de Nutrición V2."
        />
      </View>
    )
  }

  if (!permission?.granted) {
    return (
      <View className="flex-1 bg-surface-app px-4 pt-6">
        <NutritionStatePanel
          icon="permission"
          title="Permite el uso de la cámara"
          description="EVA utiliza la cámara solo para leer el código del producto. También puedes ingresarlo manualmente."
          action={
            <NutritionMotionButton
              accessibilityLabel="Permitir cámara"
              onPress={() => void requestPermission()}
            >
              Permitir cámara
            </NutritionMotionButton>
          }
        />
        <ManualLookup code={manualCode} loading={loading} onChange={setManualCode} onLookup={lookup} />
      </View>
    )
  }

  return (
    <ScrollView
      className="flex-1 bg-surface-app"
      contentContainerClassName="gap-5 px-4 pb-12 pt-5"
      keyboardShouldPersistTaps="handled"
    >
      <NutritionHeader
        eyebrow="Catálogo local Chile"
        title="Escanear producto"
        description="EAN/UPC consultado únicamente en la base de datos de EVA."
      />

      <View className="relative h-72 overflow-hidden rounded-sheet border border-border-subtle bg-ink-950">
        {!scannerPaused ? (
          <CameraView
            className="flex-1"
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
            onBarcodeScanned={onBarcodeScanned}
          />
        ) : (
          <View className="flex-1 items-center justify-center bg-ink-950 px-6">
            <ScanBarcode color="#FFFFFF" size={52} />
            <Text className="mt-3 text-center text-sm font-semibold text-white">
              Scanner pausado mientras revisas el resultado
            </Text>
          </View>
        )}
        <Pressable
          accessibilityLabel={torch ? 'Apagar linterna' : 'Encender linterna'}
          accessibilityRole="button"
          className="absolute right-3 top-3 h-11 w-11 items-center justify-center rounded-full bg-black/60"
          onPress={() => setTorch((value) => !value)}
        >
          {torch ? <FlashlightOff color="#FFFFFF" size={20} /> : <Flashlight color="#FFFFFF" size={20} />}
        </Pressable>
      </View>

      <ManualLookup code={manualCode} loading={loading} onChange={setManualCode} onLookup={lookup} />

      {result ? (
        <ResultCard
          mediaUrl={mediaUrl}
          result={result}
          reported={reported}
          adding={adding}
          added={
            addedId != null &&
            (result.status === 'found' || result.status === 'pending_verification') &&
            addedId === result.food.id
          }
          onAdd={() => void addToDay()}
          onReport={async () => {
            if (!userId || result.status !== 'not_found') return
            setLoading(true)
            try {
              await reportMissingFoodGtinV2({
                clientId: userId,
                gtin: result.gtin,
                countryCode: 'CL',
                capturedName: null,
                capturedBrand: null,
                packagePhotoPath: null,
                source: 'rn_scanner',
                idempotencyKey: `missing:${userId}:${result.gtin}:${Date.now()}`,
              })
              setReported(true)
            } finally {
              setLoading(false)
            }
          }}
          onScanAgain={() => {
            setResult(null)
            setReported(false)
            setScannerPaused(false)
            lastScanRef.current = null
          }}
        />
      ) : null}
    </ScrollView>
  )
}

function ManualLookup({
  code,
  loading,
  onChange,
  onLookup,
}: {
  code: string
  loading: boolean
  onChange: (value: string) => void
  onLookup: (value: string) => Promise<void>
}) {
  return (
    <NutritionCard>
      <Text className="font-display text-base font-semibold text-text-strong">Código manual</Text>
      <TextInput
        accessibilityLabel="Código de barras"
        className="mt-3 min-h-12 rounded-control border border-border-default bg-surface-app px-3 font-mono text-base text-text-strong"
        inputMode="numeric"
        keyboardType="number-pad"
        maxLength={14}
        onChangeText={(value) => onChange(value.replace(/\D/g, ''))}
        placeholder="7801234567894"
        placeholderTextColor="#818C9A"
        value={code}
      />
      <View className="mt-3">
        <NutritionMotionButton
          accessibilityLabel="Buscar código de barras"
          disabled={code.length < 8}
          pending={loading}
          onPress={() => void onLookup(code)}
        >
          Buscar producto
        </NutritionMotionButton>
      </View>
    </NutritionCard>
  )
}

function ResultCard({
  result,
  mediaUrl,
  reported,
  adding = false,
  added = false,
  onAdd,
  onReport,
  onScanAgain,
}: {
  result: FoodBarcodeLookupReadModel
  mediaUrl: string | null
  reported: boolean
  adding?: boolean
  added?: boolean
  onAdd?: () => void
  onReport: () => Promise<void>
  onScanAgain: () => void
}) {
  if (result.status === 'invalid') {
    return (
      <NutritionStatePanel
        icon="error"
        tone="danger"
        title="Código inválido"
        description="El número no corresponde a un GTIN-8, UPC o EAN válido."
        action={<NutritionMotionButton accessibilityLabel="Escanear otro código" onPress={onScanAgain}>Escanear otro</NutritionMotionButton>}
      />
    )
  }

  if (result.status === 'not_found') {
    return (
      <NutritionStatePanel
        icon="info"
        tone="warning"
        title="Producto todavía no disponible"
        description="Puedes reportarlo para incorporarlo al catálogo chileno después de la revisión nutricional."
        action={
          <View className="gap-2">
            <NutritionMotionButton
              accessibilityLabel="Reportar producto faltante"
              disabled={reported}
              success={reported}
              onPress={() => void onReport()}
            >
              {reported ? 'Producto reportado' : 'Reportar producto'}
            </NutritionMotionButton>
            <NutritionMotionButton accessibilityLabel="Escanear otro código" tone="neutral" onPress={onScanAgain}>
              Escanear otro
            </NutritionMotionButton>
          </View>
        }
      />
    )
  }

  return (
    <NutritionCard tone={result.status === 'found' ? 'success' : 'warning'}>
      <View className="flex-row items-center gap-3">
        <FoodThumbnail alt={result.food.name} src={mediaUrl} size="lg" />
        <View className="min-w-0 flex-1">
          <Text className="font-display text-lg font-semibold text-text-strong" numberOfLines={2}>
            {result.food.name}
          </Text>
          <Text className="mt-1 text-sm text-text-muted">{result.food.brand ?? 'Sin marca'}</Text>
          <Text className="mt-2 font-mono text-xs text-text-body">
            {result.food.calories} kcal · P {result.food.proteinG} · C {result.food.carbsG} · G {result.food.fatsG}
          </Text>
          <Text className="mt-1 text-xs font-semibold text-text-muted">
            {result.status === 'found' ? 'Verificado' : 'Pendiente de verificación'}
          </Text>
        </View>
      </View>
      <View className="mt-4 gap-2">
        <NutritionMotionButton
          accessibilityLabel="Agregar al día"
          disabled={added}
          success={added}
          pending={adding}
          onPress={() => onAdd?.()}
        >
          {added ? 'Agregado al día' : 'Agregar al día'}
        </NutritionMotionButton>
        <NutritionMotionButton accessibilityLabel="Escanear otro código" tone="neutral" onPress={onScanAgain}>
          Escanear otro
        </NutritionMotionButton>
      </View>
    </NutritionCard>
  )
}
