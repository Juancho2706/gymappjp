import { useEffect, useState } from 'react'
import { Dimensions, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { MotiView } from 'moti'
import { Easing } from 'react-native-reanimated'
import { FONT } from '../../lib/typography'
import { loadStoredBranding, type CoachBranding } from '../../lib/branding'

/**
 * Principios de splash premium (research 2025/2026 — Nike Training Club, Whoop,
 * Strava, apps white-label). Guían este rework:
 *  1. MENOS ES MÁS: un solo foco visual (el logo centrado). Sin taglines,
 *     spinners, líneas ni letras animadas — el ruido mata la percepción premium.
 *  2. MICRO-ANIMACIÓN SUTIL: fade + scale 0.96→1 con ease-out (~600ms), sin
 *     rebote/spring. El movimiento debe leerse como "respiración", no como show.
 *  3. FONDO LIMPIO: color sólido o gradiente MUY suave (marca del coach) — el
 *     logo manda, el fondo solo lo sostiene.
 *  4. CORTO (<1.5s percibido): logo entra rápido, se sostiene, transición
 *     fade-out limpia al contenido. Cada segundo extra = ~8% de abandono.
 *  5. HANDOFF SIN FLASH: mismo fondo que el splash nativo (sin blanco entre
 *     nativo→JS→app). Failsafe de 2s para no atascar el arranque.
 */

const { width, height } = Dimensions.get('window')
// Igual que el splash nativo (app.json → expo.splash.backgroundColor) para que el
// handoff nativo→JS no muestre ningún flash blanco mientras resolvemos la marca.
const NATIVE_BG = '#07080C'
// Marca EVA (BRAND_PRIMARY_COLOR web). El wordmark viejo de 3 hex queda retirado.
const BRAND_PRIMARY = '#10B981'
const MARK = Math.round(Math.min(width, height) * 0.28)
// Failsafe: si AsyncStorage no responde rápido, no bloqueamos el arranque más de ~2s.
const RESOLVE_TIMEOUT_MS = 2000
// Ease-out suave compartido por ambas variantes (entrada del logo). Sin rebote.
const EASE_OUT = Easing.out(Easing.cubic)

// eslint-disable-next-line @typescript-eslint/no-var-requires
const EVA_MARK = require('../../assets/eva-mark-filled.png')

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

/** Oscurece un hex hacia negro por un factor 0..1 (gradiente suave del fondo de marca). */
function darken(hex: string, factor: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const f = 1 - factor
  return `rgb(${Math.round(rgb.r * f)}, ${Math.round(rgb.g * f)}, ${Math.round(rgb.b * f)})`
}

/** rgba a partir de un hex + alpha (para glows suaves). */
function rgba(hex: string, a: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return `rgba(255,255,255,${a})`
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`
}

interface Props {
  onFinish: () => void
}

/**
 * Splash brandeado del alumno (SPEC Goal 6). Cadena de arranque:
 *   splash nativo EVA (dark) → ESTE splash → app, sin flash blanco entre medio.
 *
 * Resuelve la marca del último coach conocido (AsyncStorage). Si hay coach
 * recordado → variante brandeada (logo del coach sobre su color). Si no (o si
 * AsyncStorage tarda >2s) → variante EVA (marca emerald sobre fondo dark).
 */
export function BrandedSplash({ onFinish }: Props) {
  const [phase, setPhase] = useState<Phase>('resolving')
  const [branding, setBranding] = useState<CoachBranding | null>(null)

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

  if (phase === 'eva') return <EvaStage onFinish={onFinish} />
  if (phase === 'brand' && branding) return <BrandedStage branding={branding} onFinish={onFinish} />

  // Resolviendo: placeholder oscuro idéntico al splash nativo (cero flash).
  return <View testID="branded-splash" style={[styles.root, { backgroundColor: NATIVE_BG }]} />
}

/** Micro-fade+scale compartido del logo (principio 2). */
function LogoReveal({ children }: { children: React.ReactNode }) {
  return (
    <MotiView
      from={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'timing', duration: 620, delay: 80, easing: EASE_OUT }}
      style={styles.center}
    >
      {children}
    </MotiView>
  )
}

/** Contenedor con fade-out limpio al contenido + failsafe (principios 4 y 5). */
function SplashShell({
  onFinish,
  accessibilityLabel,
  children,
}: {
  onFinish: () => void
  accessibilityLabel: string
  children: React.ReactNode
}) {
  const [exiting, setExiting] = useState(false)
  useEffect(() => {
    const t1 = setTimeout(() => setExiting(true), 1300)
    const t2 = setTimeout(() => onFinish(), 1720)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])
  return (
    <MotiView
      testID="branded-splash"
      accessibilityLabel={accessibilityLabel}
      from={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ type: 'timing', duration: 400, easing: EASE_OUT }}
      style={styles.root}
    >
      {children}
    </MotiView>
  )
}

/** Variante EVA: marca emerald centrada sobre fondo dark con un glow muy suave. */
function EvaStage({ onFinish }: { onFinish: () => void }) {
  return (
    <SplashShell onFinish={onFinish} accessibilityLabel="Cargando EVA">
      <View style={[StyleSheet.absoluteFill, styles.evaBg]} />
      <View style={styles.glowWrap} pointerEvents="none">
        <LinearGradient
          colors={[rgba(BRAND_PRIMARY, 0.16), rgba(BRAND_PRIMARY, 0.04), 'transparent']}
          style={styles.glow}
        />
      </View>
      <LogoReveal>
        <Image source={EVA_MARK} style={styles.evaMark} contentFit="contain" tintColor={BRAND_PRIMARY} />
        <Text style={styles.evaWord}>EVA</Text>
      </LogoReveal>
    </SplashShell>
  )
}

/** Variante brandeada: logo del coach centrado sobre su color de marca (gradiente suave). */
function BrandedStage({ branding, onFinish }: { branding: CoachBranding; onFinish: () => void }) {
  const bg = branding.primaryColor
  const hasLogo = Boolean(branding.logoUrl)

  return (
    <SplashShell onFinish={onFinish} accessibilityLabel={`Cargando ${branding.displayName}`}>
      {/* Fondo de marca: gradiente MUY suave (principio 3), sin corte duro. */}
      <LinearGradient
        colors={[darken(bg, 0.08), bg, darken(bg, 0.22)]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Halo blanco tenue detrás del logo para dar profundidad sin ruido. */}
      <View style={styles.glowWrap} pointerEvents="none">
        <LinearGradient
          colors={['rgba(255,255,255,0.10)', 'transparent']}
          style={styles.glow}
        />
      </View>
      <LogoReveal>
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
      </LogoReveal>
    </SplashShell>
  )
}

const GLOW = Math.round(Math.min(width, height) * 0.9)

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  evaBg: { backgroundColor: NATIVE_BG },
  center: { alignItems: 'center', justifyContent: 'center', gap: 18 },
  glowWrap: { position: 'absolute', width: GLOW, height: GLOW, alignItems: 'center', justifyContent: 'center' },
  glow: { width: '100%', height: '100%', borderRadius: GLOW / 2 },
  // EVA
  evaMark: { width: MARK, height: MARK },
  evaWord: {
    fontSize: 34,
    lineHeight: 38,
    color: '#FFFFFF',
    fontFamily: FONT.displayBlack,
    letterSpacing: 4,
    textAlign: 'center',
  },
  // Coach
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
