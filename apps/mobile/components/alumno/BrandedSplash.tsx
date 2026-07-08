import { useEffect, useState } from 'react'
import { Dimensions, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { MotiView } from 'moti'
import { FONT } from '../../lib/typography'
import { loadStoredBranding, type CoachBranding } from '../../lib/branding'
import { EvaSplash } from '../EvaSplash'

const { width, height } = Dimensions.get('window')
// Igual que el splash nativo (app.json → expo.splash.backgroundColor) para que el
// handoff nativo→JS no muestre ningún flash blanco mientras resolvemos la marca.
const NATIVE_BG = '#07080C'
const MARK = Math.round(Math.min(width, height) * 0.28)
// Failsafe: si AsyncStorage no responde rápido, no bloqueamos el arranque más de ~2s.
const RESOLVE_TIMEOUT_MS = 2000

type Phase = 'resolving' | 'eva' | 'brand'

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return null
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  if ([r, g, b].some(Number.isNaN)) return null
  return { r, g, b }
}

/** Oscurece un hex hacia negro por un factor 0..1 (para el gradiente 160°, igual que web `${bg}cc`). */
function darken(hex: string, factor: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const f = 1 - factor
  return `rgb(${Math.round(rgb.r * f)}, ${Math.round(rgb.g * f)}, ${Math.round(rgb.b * f)})`
}

interface Props {
  onFinish: () => void
}

/**
 * Splash brandeado del coach (SPEC Goal 6). Cadena de arranque:
 *   splash nativo EVA (dark) → ESTE splash brandeado (logo + color del último coach
 *   conocido) → app, sin flash blanco ni pantalla genérica entre medio.
 *
 * Paridad con el splash de la PWA per-coach (`/api/splash/[coach_slug]`): fondo con
 * gradiente 160° del color de marca + logo centrado con esquinas redondeadas
 * (o inicial del nombre de marca como fallback). Si no hay coach recordado
 * (o AsyncStorage tarda >2s), cae al splash EVA genérico.
 */
export function BrandedSplash({ onFinish }: Props) {
  const [phase, setPhase] = useState<Phase>('resolving')
  const [branding, setBranding] = useState<CoachBranding | null>(null)

  // Resolver la marca del último coach conocido (persistida en AsyncStorage hoy por
  // `lib/branding`). Con failsafe de tiempo para no atascar el arranque.
  useEffect(() => {
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      setPhase('eva')
    }, RESOLVE_TIMEOUT_MS)

    loadStoredBranding()
      .then((b) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (b && hexToRgb(b.primaryColor)) {
          setBranding(b)
          setPhase('brand')
        } else {
          setPhase('eva')
        }
      })
      .catch(() => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        setPhase('eva')
      })

    return () => clearTimeout(timeout)
  }, [])

  if (phase === 'eva') return <EvaSplash onFinish={onFinish} />
  if (phase === 'brand' && branding) return <BrandedStage branding={branding} onFinish={onFinish} />

  // Resolviendo: placeholder oscuro idéntico al splash nativo (cero flash).
  return <View testID="branded-splash" style={[styles.root, { backgroundColor: NATIVE_BG }]} />
}

function BrandedStage({ branding, onFinish }: { branding: CoachBranding; onFinish: () => void }) {
  const [exiting, setExiting] = useState(false)
  const bg = branding.primaryColor
  const hasLogo = Boolean(branding.logoUrl)

  useEffect(() => {
    const t1 = setTimeout(() => setExiting(true), 1300)
    const t2 = setTimeout(() => onFinish(), 1720)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  return (
    <MotiView
      testID="branded-splash"
      accessibilityLabel={`Cargando ${branding.displayName}`}
      from={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ type: 'timing', duration: 400 }}
      style={styles.root}
    >
      {/* Gradiente 160° del color de marca (paridad con el splash PWA). */}
      <LinearGradient
        colors={[bg, darken(bg, 0.4)]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <MotiView
        from={{ opacity: 0, scale: 0.82 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', damping: 14, stiffness: 140, delay: 60 }}
        style={styles.center}
      >
        {hasLogo ? (
          <Image
            source={{ uri: branding.logoUrl as string }}
            style={styles.logo}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={styles.fallbackMark}>
            <Text style={styles.fallbackInitial}>
              {branding.displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={styles.name} numberOfLines={1}>
          {branding.displayName}
        </Text>
      </MotiView>
    </MotiView>
  )
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { alignItems: 'center', justifyContent: 'center', gap: 20 },
  logo: { width: MARK, height: MARK, borderRadius: Math.round(MARK * 0.22) },
  fallbackMark: {
    width: MARK,
    height: MARK,
    borderRadius: Math.round(MARK * 0.22),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  fallbackInitial: {
    fontSize: Math.round(MARK * 0.5),
    color: '#FFFFFF',
    fontFamily: FONT.displayBlack,
  },
  name: {
    fontSize: 18,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.92)',
    fontFamily: FONT.displayBold,
    letterSpacing: 0.2,
    maxWidth: width * 0.8,
    textAlign: 'center',
  },
})
