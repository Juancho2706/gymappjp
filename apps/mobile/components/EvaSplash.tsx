import { useEffect, useRef, useState } from 'react'
import { Animated, Dimensions, Easing, Image, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MotiView } from 'moti'

const { width } = Dimensions.get('window')

const LOGO = require('../assets/eva-icon.png')
const DARK_BG = '#07080C'
const BLUE = '#007AFF'

interface Props {
  onFinish: () => void
}

export function EvaSplash({ onFinish }: Props) {
  const [exiting, setExiting] = useState(false)

  // Pulse animation for glow rings
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    // Pulse loop: starts subtle, repeats
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start()

    // Snappier brand moment (was 2.0/2.42s) — fonts already gate this overlay.
    const t1 = setTimeout(() => setExiting(true), 1300)
    const t2 = setTimeout(() => onFinish(), 1700)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] })
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] })

  return (
    <MotiView
      from={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ type: 'timing', duration: 400 }}
      style={styles.root}
    >
      {/* Ambient background glow — large soft orb */}
      <Animated.View
        style={[
          styles.glowOuter,
          { transform: [{ scale: glowScale }], opacity: glowOpacity },
        ]}
      />
      <Animated.View
        style={[
          styles.glowMid,
          { transform: [{ scale: glowScale }], opacity: glowOpacity },
        ]}
      />

      {/* Logo */}
      <MotiView
        from={{ opacity: 0, scale: 0.42, translateY: 16 }}
        animate={{ opacity: 1, scale: 1, translateY: 0 }}
        transition={{ type: 'spring', damping: 11, stiffness: 80, delay: 60 }}
        style={styles.logoWrap}
      >
        {/* Inner sharp glow ring directly behind logo */}
        <View style={styles.glowInner} />
        <Image
          source={LOGO}
          style={styles.logo}
          resizeMode="contain"
          tintColor="#FFFFFF"
        />
      </MotiView>

      {/* Separator line */}
      <MotiView
        from={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ type: 'timing', duration: 500, delay: 540 }}
      >
        <LinearGradient
          colors={['transparent', BLUE + 'AA', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.separator}
        />
      </MotiView>

      {/* Brand name */}
      <MotiView
        from={{ opacity: 0, translateY: 18 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'spring', damping: 16, delay: 600 }}
      >
        <Text style={styles.brand}>EVA</Text>
      </MotiView>

      {/* Tagline */}
      <MotiView
        from={{ opacity: 0, translateY: 10 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 420, delay: 820 }}
      >
        <Text style={styles.tagline}>Entrenamiento personalizado</Text>
      </MotiView>

      {/* Bottom domain badge */}
      <MotiView
        from={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ type: 'timing', duration: 380, delay: 1050 }}
        style={styles.bottomRow}
      >
        <View style={styles.domainPill}>
          <View style={styles.dotAlive} />
          <Text style={styles.domainText}>eva-app.cl</Text>
        </View>
      </MotiView>

      {/* Corner accent lines — top-left */}
      <MotiView
        from={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ type: 'timing', duration: 600, delay: 200 }}
        style={styles.cornerTL}
      >
        <View style={[styles.cornerLineH, { backgroundColor: BLUE + '60' }]} />
        <View style={[styles.cornerLineV, { backgroundColor: BLUE + '60' }]} />
      </MotiView>

      {/* Corner accent lines — bottom-right */}
      <MotiView
        from={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ type: 'timing', duration: 600, delay: 200 }}
        style={styles.cornerBR}
      >
        <View style={[styles.cornerLineH, { backgroundColor: BLUE + '60' }]} />
        <View style={[styles.cornerLineV, { backgroundColor: BLUE + '60', alignSelf: 'flex-end' }]} />
      </MotiView>
    </MotiView>
  )
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: DARK_BG,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },

  // Glow rings — absolutely centered
  glowOuter: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: BLUE + '0C',
    alignSelf: 'center',
    top: '50%',
    marginTop: -200,  // offset up toward logo center
  },
  glowMid: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: BLUE + '18',
    alignSelf: 'center',
    top: '50%',
    marginTop: -160,
  },

  // Logo container
  logoWrap: {
    width: 130,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  glowInner: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: BLUE + '22',
  },
  logo: {
    width: 110,
    height: 110,
  },

  // Separator
  separator: {
    width: width * 0.38,
    height: 1,
    marginBottom: 22,
    borderRadius: 1,
  },

  // Text
  brand: {
    fontSize: 72,
    fontFamily: 'Montserrat_800ExtraBold',
    color: '#FFFFFF',
    letterSpacing: -2,
    lineHeight: 72,
    marginBottom: 10,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 0,
  },

  // Bottom domain badge
  bottomRow: {
    position: 'absolute',
    bottom: 52,
    alignItems: 'center',
  },
  domainPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  dotAlive: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  domainText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.5,
  },

  // Corner decorative lines
  cornerTL: {
    position: 'absolute',
    top: 52,
    left: 28,
    width: 28,
    height: 28,
  },
  cornerBR: {
    position: 'absolute',
    bottom: 88,
    right: 28,
    width: 28,
    height: 28,
  },
  cornerLineH: {
    width: 28,
    height: 1,
    borderRadius: 1,
  },
  cornerLineV: {
    width: 1,
    height: 28,
    borderRadius: 1,
    marginTop: -1,
  },
})
