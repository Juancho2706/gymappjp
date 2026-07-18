'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Flashlight, FlashlightOff, ScanBarcode } from 'lucide-react'
import {
  FoodBarcodeLookupReadModelSchema,
  type FoodBarcodeLookupReadModel,
} from '@eva/nutrition-v2'
import { createClient } from '@/lib/supabase/client'
import {
  FoodThumbnail,
  MacroChipRow,
  NutritionCard,
  NutritionMotionButton,
  NutritionStatePanel,
} from '@/components/nutrition-v2'
import { missingFoodReportKey } from '@/components/nutrition-v2/missing-food-report-key'

type DetectedBarcode = { rawValue: string; format?: string }
type BarcodeDetectorInstance = {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>
}
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor
  }
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

export function FoodScannerClient({ clientId }: { clientId: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCodeRef = useRef<{ value: string; at: number } | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [result, setResult] = useState<FoodBarcodeLookupReadModel | null>(null)
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [nativeDetector, setNativeDetector] = useState<boolean | null>(null)
  const [torchSupported, setTorchSupported] = useState(false)
  const [torch, setTorch] = useState(false)
  const [reported, setReported] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  const stopCamera = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setScanning(false)
    setTorch(false)
    setTorchSupported(false)
  }, [])

  useEffect(() => stopCamera, [stopCamera])

  const lookup = useCallback(async (raw: string) => {
    const gtin = raw.replace(/\D/g, '')
    if (!gtin || loading) return
    setLoading(true)
    setReported(false)
    try {
      const { data, error } = await (supabase as unknown as {
        rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
      }).rpc('lookup_food_by_gtin_v2', {
        p_gtin: gtin,
        p_country_code: 'CL',
      })
      if (error) throw new Error(error.message)
      const parsed = FoodBarcodeLookupReadModelSchema.parse(data)
      setResult(parsed)
      setManualCode(parsed.gtin)
      stopCamera()
    } catch {
      setCameraError('No se pudo consultar el catálogo local. Revisa tu conexión.')
    } finally {
      setLoading(false)
    }
  }, [loading, stopCamera, supabase])

  const scheduleDetection = useCallback((detector: BarcodeDetectorInstance) => {
    const run = async () => {
      const video = videoRef.current
      if (!video || !streamRef.current) return
      try {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          const codes = await detector.detect(video)
          const value = codes[0]?.rawValue?.replace(/\D/g, '')
          if (value) {
            const previous = lastCodeRef.current
            const now = Date.now()
            if (!previous || previous.value !== value || now - previous.at >= 2_000) {
              lastCodeRef.current = { value, at: now }
              await lookup(value)
              return
            }
          }
        }
      } catch {
        // A single failed frame should not terminate the scanner loop.
      }
      timerRef.current = setTimeout(run, 250)
    }
    timerRef.current = setTimeout(run, 250)
  }, [lookup])

  const startCamera = useCallback(async () => {
    setCameraError(null)
    setResult(null)
    setReported(false)

    const Detector = window.BarcodeDetector
    setNativeDetector(Boolean(Detector))
    if (!Detector) {
      setCameraError('Este navegador no incluye lector nativo. Usa el código manual.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('La cámara no está disponible en este navegador. Usa el código manual.')
      return
    }

    stopCamera()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      video.srcObject = stream
      await video.play()
      const track = stream.getVideoTracks()[0]
      const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean }
      setTorchSupported(capabilities?.torch === true)
      setScanning(true)
      const detector = new Detector({ formats: FORMATS })
      scheduleDetection(detector)
    } catch (error) {
      setCameraError(
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'No se concedió permiso de cámara. Puedes usar el código manual.'
          : 'No se pudo iniciar la cámara. Puedes usar el código manual.',
      )
      stopCamera()
    }
  }, [scheduleDetection, stopCamera])

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track || !torchSupported) return
    const next = !torch
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as unknown as MediaTrackConstraintSet],
      })
      setTorch(next)
    } catch {
      setTorchSupported(false)
    }
  }, [torch, torchSupported])

  const reportMissing = useCallback(async () => {
    if (!result || result.status !== 'not_found') return
    setLoading(true)
    try {
      const { data, error } = await (supabase as unknown as {
        rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
      }).rpc('report_missing_food_gtin_v2', {
        p_client_id: clientId,
        p_gtin: result.gtin,
        p_country_code: 'CL',
        p_captured_name: null,
        p_captured_brand: null,
        p_package_photo_path: null,
        p_source: 'pwa_scanner',
        // Clave ESTABLE por contenido (alumno + gtin + dia local): un reintento NO crea un
        // reporte duplicado (antes usaba Date.now(), que rompia la deduplicacion del RPC).
        p_idempotency_key: missingFoodReportKey({ clientId, gtin: result.gtin }),
      })
      if (error || typeof data !== 'string') throw new Error(error?.message ?? 'Invalid response')
      setReported(true)
    } catch {
      setCameraError('No se pudo guardar el reporte del producto.')
    } finally {
      setLoading(false)
    }
  }, [clientId, result, supabase])

  const mediaUrl = useMemo(() => {
    if (
      !result ||
      (result.status !== 'found' && result.status !== 'pending_verification') ||
      !result.food.media
    ) return null
    const media = result.food.media
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
    if (!base) return null
    const path = media.objectPath.split('/').map(encodeURIComponent).join('/')
    return `${base}/storage/v1/object/public/${encodeURIComponent(media.bucket)}/${path}?v=${media.version}`
  }, [result])

  return (
    <div className="space-y-5">
      <div className="relative aspect-[4/3] overflow-hidden rounded-card border border-border-subtle bg-slate-950">
        <video
          ref={videoRef}
          aria-label="Vista de cámara para código de barras"
          className="h-full w-full object-cover"
          muted
          playsInline
        />
        {!scanning ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white">
            <ScanBarcode className="h-14 w-14" />
            <p className="mt-3 text-sm font-semibold">
              {nativeDetector === false ? 'Usa el código manual' : 'Activa la cámara para escanear'}
            </p>
          </div>
        ) : null}
        {torchSupported && scanning ? (
          <button
            type="button"
            aria-label={torch ? 'Apagar linterna' : 'Encender linterna'}
            onClick={() => void toggleTorch()}
            className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white"
          >
            {torch ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <NutritionMotionButton
          onClick={() => void startCamera()}
          pending={loading && scanning}
        >
          {scanning ? 'Reiniciar cámara' : 'Activar cámara'}
        </NutritionMotionButton>
        {scanning ? (
          <NutritionMotionButton tone="neutral" onClick={stopCamera}>
            Detener
          </NutritionMotionButton>
        ) : null}
      </div>

      <NutritionCard>
        <label htmlFor="manual-gtin" className="font-display text-base font-semibold text-strong">
          Código manual
        </label>
        <input
          id="manual-gtin"
          inputMode="numeric"
          maxLength={14}
          value={manualCode}
          onChange={(event) => setManualCode(event.target.value.replace(/\D/g, ''))}
          placeholder="7801234567894"
          className="mt-3 min-h-12 w-full rounded-control border border-border-default bg-surface-app px-3 font-mono text-base text-strong outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="mt-3">
          <NutritionMotionButton
            disabled={manualCode.length < 8}
            pending={loading}
            onClick={() => void lookup(manualCode)}
          >
            Buscar producto
          </NutritionMotionButton>
        </div>
      </NutritionCard>

      {cameraError ? (
        <NutritionStatePanel
          icon="info"
          tone="warning"
          title="Scanner disponible con alternativa manual"
          description={cameraError}
        />
      ) : null}

      {result ? (
        <ScannerResult
          result={result}
          mediaUrl={mediaUrl}
          reported={reported}
          loading={loading}
          onReport={reportMissing}
          onReset={() => {
            setResult(null)
            setReported(false)
            setCameraError(null)
            lastCodeRef.current = null
          }}
        />
      ) : null}
    </div>
  )
}

function ScannerResult({
  result,
  mediaUrl,
  reported,
  loading,
  onReport,
  onReset,
}: {
  result: FoodBarcodeLookupReadModel
  mediaUrl: string | null
  reported: boolean
  loading: boolean
  onReport: () => Promise<void>
  onReset: () => void
}) {
  if (result.status === 'invalid') {
    return (
      <NutritionStatePanel
        icon="error"
        tone="danger"
        illustration="error-amable"
        title="Código inválido"
        description="El número no corresponde a un GTIN-8, UPC o EAN válido."
        action={<NutritionMotionButton onClick={onReset}>Probar otro</NutritionMotionButton>}
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
          <div className="flex flex-wrap justify-center gap-2">
            <NutritionMotionButton
              pending={loading}
              success={reported}
              disabled={reported}
              onClick={() => void onReport()}
            >
              {reported ? 'Producto reportado' : 'Reportar producto'}
            </NutritionMotionButton>
            <NutritionMotionButton tone="neutral" onClick={onReset}>
              Probar otro
            </NutritionMotionButton>
          </div>
        }
      />
    )
  }

  return (
    <NutritionCard tone={result.status === 'found' ? 'success' : 'warning'}>
      <div className="flex items-center gap-4">
        <FoodThumbnail alt={result.food.name} src={mediaUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-semibold text-strong">{result.food.name}</h2>
          <p className="mt-1 text-sm text-muted">{result.food.brand ?? 'Sin marca'}</p>
          <div className="mt-2">
            <MacroChipRow
              calories={result.food.calories}
              proteinG={result.food.proteinG}
              carbsG={result.food.carbsG}
              fatsG={result.food.fatsG}
              size="sm"
            />
          </div>
          <p className="mt-2 text-xs font-semibold opacity-80">
            {result.status === 'found' ? 'Verificado' : 'Pendiente de verificación'}
          </p>
        </div>
      </div>
      <div className="mt-4">
        <NutritionMotionButton tone="neutral" onClick={onReset}>
          Probar otro
        </NutritionMotionButton>
      </div>
    </NutritionCard>
  )
}
