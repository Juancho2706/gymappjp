import { useEffect, useState } from 'react'
import { Dimensions, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { MotiView } from 'moti'
import { Easing } from 'react-native-reanimated'
import { loadStoredBranding, type CoachBranding } from '../../lib/branding'
import { FONT } from '../../lib/typography'

const INK = '#07080C'
const EVA_BLUE = '#007AFF'
const WHITE = '#FFFFFF'
const { width, height } = Dimensions.get('window')
const MARK_SIZE = Math.round(Math.min(width, height) * 0.3)
const PULSE_SIZE = Math.round(Math.min(width, height) * 0.52)
const EASE_OUT = Easing.out(Easing.cubic)

// eslint-disable-next-line @typescript-eslint/no-var-requires
const EVA_MARK = require('../../assets/eva-mark-filled.png')

type Props = { onFinish: () => void }

export function LaunchSplash({ onFinish }: Props) {
  const [branding, setBranding] = useState<CoachBranding | null>(null)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    let active = true
    const timeout = setTimeout(() => {
      if (active) setResolved(true)
    }, 180)
    loadStoredBranding()
      .then((value) => {
        if (!active) return
        clearTimeout(timeout)
        setBranding(value)
        setResolved(true)
      })
      .catch(() => {
        if (!active) return
        clearTimeout(timeout)
        setResolved(true)
      })
    return () => {
      active = false
      clearTimeout(timeout)
    }
  }, [])

  if (!resolved) {
    return (
      <View testID="launch-splash" style={styles.root}>
        <Image source={EVA_MARK} style={styles.mark} contentFit="contain" />
      </View>
    )
  }

  return <AnimatedStage branding={branding} onFinish={onFinish} />
}

function AnimatedStage({ branding, onFinish }: { branding: CoachBranding | null; onFinish: () => void }) {
  const [launching, setLaunching] = useState(false)
  const [exiting, setExiting] = useState(false)
  const accent = branding?.primaryColor || EVA_BLUE
  const hasCoachLogo = Boolean(branding?.logoUrl)

  useEffect(() => {
    const launchTimer = setTimeout(() => setLaunching(true), 540)
    const exitTimer = setTimeout(() => setExiting(true), 1040)
    const finishTimer = setTimeout(onFinish, 1420)
    return () => {
      clearTimeout(launchTimer)
      clearTimeout(exitTimer)
      clearTimeout(finishTimer)
    }
  }, [onFinish])

  return (
    <MotiView
      testID="launch-splash"
      accessibilityLabel={branding ? `Cargando ${branding.displayName}` : 'Cargando EVA'}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ type: 'timing', duration: 360, easing: EASE_OUT }}
      style={styles.root}
    >
      <LinearGradient colors={[INK, '#09111F', INK]} style={StyleSheet.absoluteFill} />

      <MotiView
        from={{ opacity: 0, scale: 0.35 }}
        animate={{ opacity: 0.32, scale: 1.22 }}
        transition={{ type: 'timing', duration: 760, easing: EASE_OUT }}
        style={[styles.aura, { backgroundColor: accent }]}
      />
      <PulseRing color={accent} delay={40} />
      <PulseRing color={accent} delay={210} />

      <MotiView
        from={{ opacity: 0, translateX: -width * 0.75 }}
        animate={{ opacity: 0.7, translateX: width * 0.8 }}
        transition={{ type: 'timing', duration: 820, delay: 160, easing: EASE_OUT }}
        style={styles.energyTrail}
      >
        <LinearGradient
          colors={['transparent', accent, WHITE, accent, 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </MotiView>

      <MotiView
        from={{ opacity: 0, scale: 0.9, translateY: 12 }}
        animate={{ opacity: 1, scale: launching ? 1.08 : 1, translateY: launching ? -12 : 0 }}
        transition={{ type: 'timing', duration: launching ? 460 : 420, easing: EASE_OUT }}
        style={styles.identity}
      >
        {hasCoachLogo ? (
          <Image source={{ uri: branding!.logoUrl! }} style={styles.coachLogo} contentFit="cover" />
        ) : (
          <Image source={EVA_MARK} style={styles.mark} contentFit="contain" />
        )}

        {branding ? (
          <MotiView from={{ opacity: 0, translateY: 6 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 320, delay: 360 }}>
            <Text numberOfLines={1} style={styles.coachName}>{branding.displayName}</Text>
          </MotiView>
        ) : (
          <View style={styles.wordmark} accessibilityLabel="EVA">
            {['E', 'V', 'A'].map((letter, index) => (
              <MotiView
                key={letter}
                from={{ opacity: 0, translateY: 8 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 280, delay: 300 + index * 70, easing: EASE_OUT }}
              >
                <Text style={styles.letter}>{letter}</Text>
              </MotiView>
            ))}
          </View>
        )}
      </MotiView>
    </MotiView>
  )
}

function PulseRing({ color, delay }: { color: string; delay: number }) {
  return (
    <MotiView
      from={{ opacity: 0.55, scale: 0.5 }}
      animate={{ opacity: 0, scale: 1.65 }}
      transition={{ type: 'timing', duration: 920, delay, easing: EASE_OUT }}
      style={[styles.ring, { borderColor: color }]}
    />
  )
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: INK,
  },
  aura: {
    position: 'absolute',
    width: PULSE_SIZE,
    height: PULSE_SIZE,
    borderRadius: PULSE_SIZE / 2,
    shadowColor: EVA_BLUE,
    shadowOpacity: 0.7,
    shadowRadius: 46,
  },
  ring: {
    position: 'absolute',
    width: PULSE_SIZE,
    height: PULSE_SIZE,
    borderRadius: PULSE_SIZE / 2,
    borderWidth: 1.5,
  },
  energyTrail: {
    position: 'absolute',
    width: width * 0.82,
    height: 2,
    transform: [{ rotate: '-22deg' }],
  },
  identity: { alignItems: 'center', justifyContent: 'center', gap: 17 },
  mark: { width: MARK_SIZE, height: MARK_SIZE },
  coachLogo: { width: MARK_SIZE, height: MARK_SIZE, borderRadius: Math.round(MARK_SIZE * 0.22) },
  wordmark: { flexDirection: 'row', gap: 8 },
  letter: { color: WHITE, fontFamily: FONT.displayBlack, fontSize: 31, lineHeight: 36, letterSpacing: 2 },
  coachName: {
    maxWidth: width * 0.78,
    color: WHITE,
    fontFamily: FONT.displayBold,
    fontSize: 19,
    lineHeight: 24,
    textAlign: 'center',
  },
})
