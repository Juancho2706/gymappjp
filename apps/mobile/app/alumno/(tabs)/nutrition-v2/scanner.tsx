import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Flashlight,
  FlashlightOff,
  ScanBarcode,
} from 'lucide-react-native'
import {
  FoodThumbnail,
  MacroChipRow,
  NutritionCard,
  NutritionHeader,
  NutritionMotionButton,
  NutritionStatePanel,
  CelebrationOverlay,
  type CelebrationInstance,
} from '../../../../components/nutrition-v2'
import { Sheet } from '../../../../components/Sheet'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ALUMNO_TABBAR_CLEARANCE } from '../../../../components/alumno/AlumnoMobileChrome'
import { useAlumnoScrollHandler } from '../../../../lib/alumno-chrome-scroll'
import {
  NutritionTodayReadModelSchema,
  type FoodBarcodeLookupReadModel,
  type FoodCatalogItem,
} from '@eva/nutrition-v2'
import { isEnabled } from '../../../../lib/flags'
import { useEntitlements } from '../../../../lib/entitlements'
import { supabase } from '../../../../lib/supabase'
import {
  foodMediaPublicUrl,
  lookupFoodByGtinV2,
  reportMissingFoodGtinV2,
} from '../../../../lib/nutrition-v2-catalog.api'
import {
  foodCategoryEmoji,
  foodOdblAttributionLine,
} from '../../../../lib/nutrition-v2-food-media'
import * as Haptics from 'expo-haptics'
import { getNutritionTodayV2 } from '../../../../lib/nutrition-v2.api'
import { readNutritionV2Cache } from '../../../../lib/nutrition-v2-cache'
import { humanizeStudentWriteError } from '../../../../lib/student-access-copy'
import {
  buildScannedFoodIntakeMutation,
  missingFoodReportKey,
  registrationContextFromToday,
  scannedFoodUnitOptions,
  type ScannerRegistrationContext,
} from '../../../../lib/nutrition-v2-scanner.logic'
import {
  getStableDeviceId,
  newNutritionV2OperationId,
  submitRecordIntake,
} from '../../../../lib/nutrition-v2-intake-runner'
import { decideScannerHitCelebration, type CelebrationDecision } from '../../../../lib/nutrition-v2-celebrations'
import { claimScannerHitCelebration } from '../../../../lib/nutrition-v2-celebrations.storage'
import { useTheme } from '../../../../context/ThemeContext'

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const

function todayInSantiago(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export default function NutritionV2ScannerScreen() {
  // 4A-01: la pantalla vive bajo (tabs) con la cápsula visible (espejo web:
  // scanner/page.tsx:49-66 bajo el layout con ClientNav montado) — el scroll
  // reserva el clearance de la cápsula y alimenta su minimizado.
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const onScrollChrome = useAlumnoScrollHandler()
  const entitlements = useEntitlements()
  const { theme } = useTheme()
  const [permission, requestPermission] = useCameraPermissions()
  const [userId, setUserId] = useState<string | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [result, setResult] = useState<FoodBarcodeLookupReadModel | null>(null)
  const [loading, setLoading] = useState(false)
  const [reported, setReported] = useState(false)
  const [torch, setTorch] = useState(false)
  const [scannerPaused, setScannerPaused] = useState(false)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  // Registro del alimento escaneado (P0 QA web: la card del scan no dejaba registrar):
  // sheet de cantidad/franja + estado "Registrado en tu día" (FoodScannerClient.tsx:66-68).
  const [registration, setRegistration] = useState<ScannerRegistrationContext | null>(null)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [registered, setRegistered] = useState(false)
  // Aviso de fallo del lookup/reporte (espejo `cameraError` web: FoodScannerClient.tsx:103,221).
  const [notice, setNotice] = useState<string | null>(null)
  const [celebration, setCelebration] = useState<CelebrationInstance | null>(null)
  const celebrationNonce = useRef(0)
  const fireCelebration = useCallback((decision: CelebrationDecision) => {
    celebrationNonce.current += 1
    setCelebration({ ...decision, nonce: celebrationNonce.current })
  }, [])
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

  // Contexto de registro: mismo read model del Hoy que usa la web en el server de la page
  // (scanner/page.tsx:38-47), reducido a lo mínimo que el sheet de cantidad/franja necesita.
  // Adaptación RN: sin server component, se consulta el endpoint del Hoy al montar; si la red
  // falla se cae a la caché existente del Hoy (camino offline ya establecido). Sin contexto,
  // el scanner queda solo-consulta (sin CTA "Registrar"), igual que la web sin `registration`.
  useEffect(() => {
    if (!userId || !enabled) return
    let active = true
    const date = todayInSantiago()
    void getNutritionTodayV2({ date })
      .then((today) => {
        if (active) setRegistration(registrationContextFromToday(today))
      })
      .catch(async () => {
        const cached = await readNutritionV2Cache({
          userId,
          clientId: userId,
          kind: 'today',
          scopeKey: date,
          schema: NutritionTodayReadModelSchema,
          allowStale: true,
        })
        if (active && cached) setRegistration(registrationContextFromToday(cached.payload))
      })
    return () => {
      active = false
    }
  }, [enabled, userId])

  const lookup = useCallback(async (rawCode: string) => {
    const code = rawCode.replace(/\D/g, '')
    if (!code || loading) return
    setLoading(true)
    setReported(false)
    setRegistered(false)
    setNotice(null)
    setScannerPaused(true)
    try {
      const next = await lookupFoodByGtinV2({ gtin: code, countryCode: 'CL' })
      setResult(next)
      setManualCode(code)
      if ((next.status === 'found' || next.status === 'pending_verification') && userId) {
        const claimed = await claimScannerHitCelebration(userId)
        const decision = decideScannerHitCelebration(!claimed)
        if (decision) fireCelebration(decision)
      }
    } catch {
      // Espejo web FoodScannerClient.tsx:103: fallo del lookup visible, no silencioso.
      setNotice('No se pudo consultar el catálogo local. Revisa tu conexión.')
    } finally {
      setLoading(false)
    }
  }, [fireCelebration, loading, userId])

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

  const onReset = useCallback(() => {
    setResult(null)
    setReported(false)
    setRegistered(false)
    setNotice(null)
    setScannerPaused(false)
    lastScanRef.current = null
  }, [])

  const goToToday = useCallback(() => {
    router.navigate('/alumno/nutrition-v2')
  }, [router])

  if (!entitlements.ready) {
    return <View className="flex-1 bg-surface-app" />
  }

  if (!enabled) {
    return (
      <View className="flex-1 bg-surface-app px-4 pt-6">
        <NutritionStatePanel
          icon="permission"
          title="El lector todavía no está disponible"
          description="Tu coach todavía no activó esta vista para ti."
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
        <CelebrationOverlay celebration={celebration} onDone={() => setCelebration(null)} />
      </View>
    )
  }

  return (
    <View className="flex-1 bg-surface-app">
    <ScrollView
      className="flex-1 bg-surface-app"
      contentContainerClassName="gap-5 px-4 pt-5"
      contentContainerStyle={{ paddingBottom: insets.bottom + ALUMNO_TABBAR_CLEARANCE }}
      onScroll={onScrollChrome}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
    >
      <NutritionHeader
        eyebrow="Catálogo local Chile"
        title="Escanear producto"
        description="Consulta códigos EAN y UPC almacenados en EVA. La cámara nunca llama a un proveedor externo."
        actions={
          // Espejo de la acción "Nutrición" con flecha de vuelta (scanner/page.tsx:54-61).
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver a Nutrición"
            onPress={goToToday}
            className="min-h-11 flex-row items-center gap-2 rounded-control border border-border-default bg-surface-card px-3"
          >
            <ArrowLeft color={theme.foreground} size={16} />
            <Text className="text-sm font-semibold text-text-strong">Nutrición</Text>
          </Pressable>
        }
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

      {notice ? (
        // Espejo del panel `cameraError` web (FoodScannerClient.tsx:308-315).
        <NutritionStatePanel
          icon="info"
          tone="warning"
          title="Scanner disponible con alternativa manual"
          description={notice}
        />
      ) : null}

      {result ? (
        <ResultCard
          mediaUrl={mediaUrl}
          result={result}
          reported={reported}
          loading={loading}
          registered={registered}
          canRegister={registration != null && userId != null && deviceId != null}
          onRegister={() => setRegisterOpen(true)}
          onSeeDay={goToToday}
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
                // Clave ESTABLE por contenido (alumno + gtin + día local): un reintento NO
                // crea un reporte duplicado (antes usaba Date.now(), que rompía la
                // deduplicación del RPC) — espejo web missing-food-report-key.ts.
                idempotencyKey: missingFoodReportKey({ clientId: userId, gtin: result.gtin }),
              })
              setReported(true)
            } catch {
              // Espejo web FoodScannerClient.tsx:221.
              setNotice('No se pudo guardar el reporte del producto.')
            } finally {
              setLoading(false)
            }
          }}
          onReset={onReset}
        />
      ) : null}
    </ScrollView>

      {/* Sheet de registro del alimento escaneado: mismo camino que el registro por búsqueda
          (FoodScannerClient.tsx:337-354). `key` por food.id reinicia cantidad/unidad/franja
          al cambiar de producto. */}
      {result &&
      (result.status === 'found' || result.status === 'pending_verification') &&
      registration &&
      userId &&
      deviceId ? (
        <RegisterScannedFoodSheet
          key={result.food.id}
          open={registerOpen}
          food={result.food}
          mediaUrl={mediaUrl}
          pendingVerification={result.status === 'pending_verification'}
          registration={registration}
          userId={userId}
          deviceId={deviceId}
          onClose={() => setRegisterOpen(false)}
          onRegistered={() => {
            setRegisterOpen(false)
            setRegistered(true)
          }}
        />
      ) : null}
      <CelebrationOverlay celebration={celebration} onDone={() => setCelebration(null)} />
    </View>
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
  loading,
  registered,
  canRegister,
  onRegister,
  onSeeDay,
  onReport,
  onReset,
}: {
  result: FoodBarcodeLookupReadModel
  mediaUrl: string | null
  reported: boolean
  loading: boolean
  /** True cuando el alimento ya quedó registrado en el día del alumno. */
  registered: boolean
  /** Hay contexto de registro (día/franjas): sin él, el scanner es solo-consulta. */
  canRegister: boolean
  onRegister: () => void
  onSeeDay: () => void
  onReport: () => Promise<void>
  onReset: () => void
}) {
  const { theme } = useTheme()

  if (result.status === 'invalid') {
    return (
      <NutritionStatePanel
        icon="error"
        tone="danger"
        illustration="error-amable"
        title="Código inválido"
        description="El número no corresponde a un GTIN-8, UPC o EAN válido."
        action={<NutritionMotionButton accessibilityLabel="Probar otro código" onPress={onReset}>Probar otro</NutritionMotionButton>}
      />
    )
  }

  if (result.status === 'not_found') {
    return (
      <NutritionStatePanel
        icon="info"
        tone="warning"
        illustration="catalogo-vacio"
        title="Producto todavía no disponible"
        description="Puedes reportarlo para revisión antes de incorporarlo al catálogo chileno."
        action={
          <View className="flex-row flex-wrap justify-center gap-2">
            <NutritionMotionButton
              accessibilityLabel="Reportar producto faltante"
              disabled={reported}
              pending={loading}
              success={reported}
              onPress={() => void onReport()}
            >
              {reported ? 'Producto reportado' : 'Reportar producto'}
            </NutritionMotionButton>
            <NutritionMotionButton accessibilityLabel="Probar otro código" tone="neutral" onPress={onReset}>
              Probar otro
            </NutritionMotionButton>
          </View>
        }
      />
    )
  }

  const attribution = foodOdblAttributionLine(result.food.source)
  return (
    <NutritionCard tone={result.status === 'found' ? 'success' : 'warning'}>
      <View className="flex-row items-center gap-3">
        <FoodThumbnail
          alt={result.food.name}
          src={mediaUrl}
          size="lg"
          fallbackEmoji={foodCategoryEmoji(result.food.category)}
        />
        <View className="min-w-0 flex-1">
          <Text className="font-display text-lg font-semibold text-text-strong" numberOfLines={2}>
            {result.food.name}
          </Text>
          <Text className="mt-1 text-sm text-text-muted">{result.food.brand ?? 'Sin marca'}</Text>
          <View className="mt-2">
            <MacroChipRow
              calories={result.food.calories}
              proteinG={result.food.proteinG}
              carbsG={result.food.carbsG}
              fatsG={result.food.fatsG}
              size="sm"
            />
          </View>
          <Text className="mt-1 text-xs font-semibold text-text-muted">
            {result.status === 'found' ? 'Verificado' : 'Pendiente de verificación'}
          </Text>
        </View>
      </View>
      {attribution ? (
        <Text className="mt-3 text-[10px] text-text-subtle">{attribution}</Text>
      ) : null}
      {/* CTA primario "Registrar" (P0 QA web: la card moría en "Probar otro"). "Pendiente de
          verificación" NO bloquea el registro: es curación del catálogo, no un permiso
          (FoodScannerClient.tsx:612-634). */}
      <View className="mt-4 flex-row flex-wrap items-center gap-2">
        {registered ? (
          <View className="min-h-11 flex-row items-center gap-1.5">
            <CheckCircle2 color={theme.success} size={16} />
            <Text className="text-sm font-semibold text-success-700">Registrado en tu día</Text>
          </View>
        ) : canRegister ? (
          <NutritionMotionButton accessibilityLabel="Registrar alimento escaneado" onPress={onRegister}>
            Registrar
          </NutritionMotionButton>
        ) : null}
        <NutritionMotionButton accessibilityLabel="Probar otro código" tone="neutral" onPress={onReset}>
          Probar otro
        </NutritionMotionButton>
        {registered ? (
          <NutritionMotionButton accessibilityLabel="Ver mi día" tone="neutral" onPress={onSeeDay}>
            Ver mi día
          </NutritionMotionButton>
        ) : null}
      </View>
    </NutritionCard>
  )
}

/**
 * Cantidad + unidad + franja para el alimento escaneado, precargado con la porción del
 * catálogo. Espejo del `RegisterScannedFoodDialog` web (FoodScannerClient.tsx:365-525):
 * mismo camino que el registro por búsqueda — payload de catálogo con captureMethod
 * 'barcode' → `submitRecordIntake` (online idempotente o cola offline existente).
 * "Pendiente de verificación" NO bloquea (self-report con snapshot); el badge se mantiene.
 *
 * Adaptaciones nativas escritas:
 *  - `TodayModal` web → `Sheet nativeModal` (gorhom 5.2.14 incompatible con reanimated 4,
 *    gotcha de clase del plan §4A).
 *  - Los `<select>` de unidad y franja no existen en RN: se adaptan como pills
 *    seleccionables (mismo patrón del selector de unidad del registro por búsqueda,
 *    add-food-v2.tsx) con las MISMAS opciones y defaults de la web.
 */
function RegisterScannedFoodSheet({
  open,
  food,
  mediaUrl,
  pendingVerification,
  registration,
  userId,
  deviceId,
  onClose,
  onRegistered,
}: {
  open: boolean
  food: FoodCatalogItem
  mediaUrl: string | null
  pendingVerification: boolean
  registration: ScannerRegistrationContext
  userId: string
  deviceId: string
  onClose: () => void
  onRegistered: () => void
}) {
  const { theme } = useTheme()
  const [quantity, setQuantity] = useState(String(food.servingSize))
  const [unit, setUnit] = useState(food.servingUnit)
  const [mealSlot, setMealSlot] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Mismas opciones de unidad que el diálogo web (FoodScannerClient.tsx:389-391).
  const unitOptions = useMemo(() => scannedFoodUnitOptions(food), [food])
  const slotOptions = useMemo(
    () => [{ code: '', label: 'Sin franja' }, ...registration.slotOptions],
    [registration.slotOptions],
  )
  const quantityNumber = Number(quantity)
  const canSubmit =
    Number.isFinite(quantityNumber) && quantityNumber > 0 && unit.trim().length > 0 && !submitting

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const payload = buildScannedFoodIntakeMutation({
        clientId: userId,
        deviceId,
        operationId: newNutritionV2OperationId(),
        occurredAt: new Date().toISOString(),
        registration,
        food,
        quantity: quantityNumber,
        unit: unit.trim(),
        mealSlotCode: mealSlot === '' ? null : mealSlot,
      })
      const outcome = await submitRecordIntake(userId, payload)
      if (outcome.status === 'recorded' || outcome.status === 'queued') {
        void Haptics.notificationAsync(
          outcome.status === 'recorded'
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning,
        )
        onRegistered()
        return
      }
      // Copy humano (COACH_ACCOUNT_PAUSED etc.), mismo patrón que el Hoy del alumno.
      setError(humanizeStudentWriteError(outcome.error.message, 'No se pudo registrar el alimento.'))
    } catch {
      setError('No pudimos guardar tu registro. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      nativeModal
      title="Registrar alimento"
      description="Elige cuánto comiste y en qué franja."
      accessibilityLabel="Registrar alimento escaneado"
      snapPoints={['85%']}
      footer={
        <View className="flex-row justify-end gap-2">
          <NutritionMotionButton accessibilityLabel="Cancelar registro" tone="neutral" onPress={onClose}>
            Cancelar
          </NutritionMotionButton>
          <NutritionMotionButton
            accessibilityLabel="Registrar alimento"
            disabled={!canSubmit}
            pending={submitting}
            onPress={() => void submit()}
          >
            Registrar
          </NutritionMotionButton>
        </View>
      }
    >
      <View className="gap-4">
        {error ? (
          <View
            accessibilityLiveRegion="assertive"
            className="flex-row items-start gap-2 rounded-card border border-danger-500/30 bg-danger-500/10 p-3"
          >
            <AlertTriangle color={theme.destructive} size={16} style={{ marginTop: 2 }} />
            <Text className="min-w-0 flex-1 text-sm text-danger-700">{error}</Text>
          </View>
        ) : null}

        <View className="flex-row items-start gap-3 rounded-card border border-border-subtle bg-surface-sunken p-3">
          <FoodThumbnail
            alt={food.name}
            src={mediaUrl}
            size="md"
            fallbackEmoji={foodCategoryEmoji(food.category)}
          />
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-text-strong" numberOfLines={1}>
              {food.name}
            </Text>
            <Text className="mt-0.5 text-xs text-text-muted" numberOfLines={1}>
              {food.brand ?? 'Sin marca'}
            </Text>
            <View className="mt-1.5">
              <MacroChipRow
                calories={food.calories}
                proteinG={food.proteinG}
                carbsG={food.carbsG}
                fatsG={food.fatsG}
                per={`por ${food.servingSize} ${food.servingUnit}`}
                size="sm"
              />
            </View>
            {pendingVerification ? (
              <View className="mt-1.5 self-start rounded-pill border border-warning-500/60 bg-warning-500/10 px-2 py-0.5">
                <Text className="text-[11px] font-semibold text-warning-700">Pendiente de verificación</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View>
          <Text className="mb-1 text-xs font-semibold text-text-muted">Cantidad</Text>
          <TextInput
            accessibilityLabel="Cantidad"
            className="min-h-12 rounded-control border border-border-default bg-surface-app px-3 text-base text-text-strong"
            inputMode="decimal"
            keyboardType="decimal-pad"
            onChangeText={(value) => setQuantity(value.replace(/[^0-9.]/g, ''))}
            selectTextOnFocus
            value={quantity}
          />
        </View>

        <View>
          <Text className="mb-1 text-xs font-semibold text-text-muted">Unidad</Text>
          <View className="flex-row flex-wrap gap-2">
            {unitOptions.map((option) => {
              const active = unit === option
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Unidad ${option}`}
                  onPress={() => {
                    void Haptics.selectionAsync()
                    setUnit(option)
                  }}
                  className={`min-h-11 items-center justify-center rounded-control border px-3 ${active ? 'border-primary bg-primary/10' : 'border-border-default bg-surface-app'}`}
                >
                  <Text className={`text-sm font-semibold ${active ? 'text-primary' : 'text-text-muted'}`}>{option}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        <View>
          <Text className="mb-1 text-xs font-semibold text-text-muted">Franja (opcional)</Text>
          <View className="flex-row flex-wrap gap-2">
            {slotOptions.map((option) => {
              const active = mealSlot === option.code
              return (
                <Pressable
                  key={option.code || 'none'}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Franja ${option.label}`}
                  onPress={() => {
                    void Haptics.selectionAsync()
                    setMealSlot(option.code)
                  }}
                  className={`min-h-11 items-center justify-center rounded-control border px-3 ${active ? 'border-primary bg-primary/10' : 'border-border-default bg-surface-app'}`}
                >
                  <Text className={`text-sm font-semibold ${active ? 'text-primary' : 'text-text-muted'}`}>{option.label}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      </View>
    </Sheet>
  )
}
