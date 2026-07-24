import { useEffect, useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MotiView } from 'moti'
import { Easing } from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { SPRING_SPATIAL } from '@eva/workout-engine'
import { FONT } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import type { ExecTheme } from './exec-theme'

/** Mezcla un acento hacia blanco: `accentRatio` de acento + resto blanco. Espeja el
 *  `color-mix(in srgb, marca 34%, #ffffff)` del mockup (.a3a-prep) para el casi-blanco tibio. */
function mixAccentWhite(hex: string, accentRatio: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16) || 0
  const g = parseInt(full.slice(2, 4), 16) || 0
  const b = parseInt(full.slice(4, 6), 16) || 0
  const mix = (c: number) => Math.round(c * accentRatio + 255 * (1 - accentRatio))
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

/** Geometría del anillo cónico giratorio (arco de acento que gira 6s alrededor del avatar). */
const RING_SIZE = 122
const RING_R = 59
const RING_C = 2 * Math.PI * RING_R

/**
 * Entrada / splash del ejecutor V3 (E2.2) — traducción RN del `.a3a-splash` del mockup
 * concepto-a-v3-core. Overlay a pantalla completa que corre UNA vez por apertura (<1,5s) y se salta con
 * un tap:
 *  · gradiente del acento del coach (radial fake por capas + LinearGradient, RN no tiene radial-gradient);
 *  · avatar/inicial del coach que entra con un spring espacial y un halo que late;
 *  · título del día que sube con overshoot;
 *  · "Preparando tu sesión" con tres puntos que rebotan + hint "Toca para saltar".
 *
 * reduced-motion ⇒ fade simple, sin springs/halo/latido (sigue auto-avanzando). El auto-avance y el tap
 * comparten un guard (`doneRef`) para no llamar `onDone` dos veces.
 */

// Duración del splash antes del auto-avance. Contrato: <1,5s → 1400ms (en device se salta con un tap).
const SPLASH_MS = 1400

export function SessionIntro({
  exec,
  coachInitial,
  coachLogoUrl,
  dayTitle,
  reducedMotion = false,
  onDone,
}: {
  exec: ExecTheme
  /** Inicial del coach (fallback del avatar si no hay logo). */
  coachInitial: string
  /** Logo del coach (si existe, reemplaza la inicial). */
  coachLogoUrl?: string | null
  /** Título del día (nombre del plan / "Día N · Empuje"). */
  dayTitle: string
  reducedMotion?: boolean
  onDone: () => void
}) {
  const doneRef = useRef(false)
  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    onDone()
  }

  useEffect(() => {
    const t = setTimeout(finish, SPLASH_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const s = exec.surface
  const springIn = { type: 'spring' as const, ...SPRING_SPATIAL }

  return (
    <Pressable onPress={finish} accessibilityRole="button" accessibilityLabel="Toca para saltar la introducción" style={{ flex: 1 }}>
      <MotiView
        from={{ opacity: reducedMotion ? 1 : 0 }}
        animate={{ opacity: 1 }}
        transition={{ type: 'timing', duration: reducedMotion ? 0 : 200 }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, backgroundColor: s.appBgSplash }}
      >
        {/* Gradiente del acento (radial fake): núcleo de acento arriba (~0.52) + degradado al piso casi-negro. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <LinearGradient
            colors={[hexToRgba(exec.accent, 0.52), hexToRgba(exec.accent, 0.12), s.appBgSplash]}
            locations={[0, 0.44, 1]}
            start={{ x: 0.5, y: -0.05 }}
            end={{ x: 0.5, y: 0.9 }}
            style={StyleSheet.absoluteFill}
          />
        </View>

        {/* Avatar del coach + anillo cónico giratorio + halo que late + entrada con spring. */}
        <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
          {/* Anillo cónico giratorio (arco de acento rotando 6s) — mockup .a3a-splashring. */}
          {!reducedMotion && (
            <MotiView
              pointerEvents="none"
              from={{ rotate: '0deg' }}
              animate={{ rotate: '360deg' }}
              transition={{ type: 'timing', duration: 6000, loop: true, repeatReverse: false, easing: Easing.linear }}
              style={{ position: 'absolute', width: RING_SIZE, height: RING_SIZE }}
            >
              <Svg width={RING_SIZE} height={RING_SIZE}>
                <Circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RING_R}
                  stroke={exec.accent}
                  strokeWidth={3}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${RING_C * 0.68} ${RING_C * 0.32}`}
                  opacity={0.9}
                />
              </Svg>
            </MotiView>
          )}
          {!reducedMotion && (
            <MotiView
              pointerEvents="none"
              from={{ scale: 1, opacity: 0.45 }}
              animate={{ scale: 1.45, opacity: 0 }}
              transition={{ type: 'timing', duration: 2200, loop: true, repeatReverse: false }}
              style={{ position: 'absolute', width: 116, height: 116, borderRadius: 58, backgroundColor: hexToRgba(exec.accent, 0.4) }}
            />
          )}
          <MotiView
            from={{ scale: reducedMotion ? 1 : 0.3, opacity: reducedMotion ? 1 : 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reducedMotion ? { type: 'timing', duration: 0 } : springIn}
            style={{ width: 116, height: 116, borderRadius: 58, overflow: 'hidden' }}
          >
            {coachLogoUrl ? (
              <Image source={{ uri: coachLogoUrl }} alt="Logo del coach" style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              <LinearGradient
                colors={[exec.accent, hexToRgba(exec.accent, 0.5)]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: FONT.displayBlack, fontSize: 42, letterSpacing: -1, color: exec.accentText }}>
                  {coachInitial}
                </Text>
              </LinearGradient>
            )}
          </MotiView>
        </View>

        {/* Título del día — sube con overshoot. */}
        <MotiView
          from={{ translateY: reducedMotion ? 0 : 24, opacity: reducedMotion ? 1 : 0 }}
          animate={{ translateY: 0, opacity: 1 }}
          transition={reducedMotion ? { type: 'timing', duration: 0 } : { ...springIn, delay: 120 }}
          style={{ paddingHorizontal: 28 }}
        >
          <Text
            style={{ fontFamily: FONT.displayBlack, fontSize: 30, letterSpacing: -0.9, color: '#ffffff', textAlign: 'center' }}
            numberOfLines={2}
          >
            {dayTitle}
          </Text>
        </MotiView>

        {/* "Preparando tu sesión" + tres puntos que rebotan. */}
        <MotiView
          from={{ opacity: reducedMotion ? 1 : 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: 'timing', duration: reducedMotion ? 0 : 300, delay: reducedMotion ? 0 : 260 }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}
        >
          <Text
            style={{ fontFamily: FONT.uiExtra, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', color: mixAccentWhite(exec.accent, 0.34) }}
          >
            Preparando tu sesión
          </Text>
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {[0, 1, 2].map((i) => (
              <MotiView
                key={i}
                from={{ translateY: 0, opacity: 0.55 }}
                animate={reducedMotion ? { translateY: 0, opacity: 0.55 } : { translateY: -5, opacity: 1 }}
                transition={reducedMotion ? { type: 'timing', duration: 0 } : { type: 'timing', duration: 600, loop: true, repeatReverse: true, delay: i * 160 }}
                style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: mixAccentWhite(exec.accent, 0.34) }}
              />
            ))}
          </View>
        </MotiView>

        {/* Hint de salto (abajo). */}
        <Text
          style={{ position: 'absolute', bottom: 30, fontFamily: FONT.uiExtra, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: hexToRgba(s.text, 0.55) }}
        >
          Toca para saltar
        </Text>
      </MotiView>
    </Pressable>
  )
}
