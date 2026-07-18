import { useEffect, useState } from 'react'
import { Dimensions, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { MotiView } from 'moti'

const { width } = Dimensions.get('window')
const DARK_BG = '#07080C'
const CYAN = '#22D3EE'
const MARK = 148
const LETTERS = ['E', 'V', 'A']

// eslint-disable-next-line @typescript-eslint/no-var-requires
const OUTLINE = require('../assets/eva-icon.png')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const FILLED = require('../assets/eva-mark-filled.png')

interface Props {
  onFinish: () => void
}

/**
 * Splash premium (2026): reveal logo outline→fill + wordmark con barrido de luz.
 * Alta-contraste, corto (<2.5s), GPU (Moti/Reanimated). Handoff suave a la app.
 *  - El atleta se dibuja en blanco, luego se "carga" de cyan de abajo→arriba (wipe).
 *  - EVA entra letra a letra y un destello diagonal barre el wordmark.
 *  - Glow de marca respira detrás. Salida con scale + fade.
 */
export function EvaSplash({ onFinish }: Props) {
  const [exiting, setExiting] = useState(false)
  const [rowW, setRowW] = useState(width * 0.55)

  useEffect(() => {
    const t1 = setTimeout(() => setExiting(true), 2050)
    const t2 = setTimeout(() => onFinish(), 2450)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  return (
    <MotiView
      from={{ opacity: 1, scale: 1 }}
      animate={{ opacity: exiting ? 0 : 1, scale: exiting ? 1.06 : 1 }}
      transition={{ type: 'timing', duration: 420 }}
      style={styles.root}
    >
      {/* Glow de marca respirando */}
      <MotiView
        from={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 0.9, scale: 1.08 }}
        transition={{ type: 'timing', duration: 1500, loop: true }}
        style={styles.glowWrap}
        pointerEvents="none"
      >
        <LinearGradient
          colors={['rgba(34,211,238,0.22)', 'rgba(59,130,246,0.10)', 'transparent']}
          start={{ x: 0.3, y: 0.2 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.glow}
        />
      </MotiView>

      {/* Marca: outline blanco + relleno cyan que sube (wipe) */}
      <MotiView
        from={{ opacity: 0, scale: 0.72, translateY: 14 }}
        animate={{ opacity: 1, scale: 1, translateY: 0 }}
        transition={{ type: 'spring', damping: 13, stiffness: 130, delay: 100 }}
        style={styles.markWrap}
      >
        <Image source={OUTLINE} style={styles.markImg} contentFit="contain" />
        <MotiView
          from={{ height: 0 }}
          animate={{ height: MARK }}
          transition={{ type: 'timing', duration: 680, delay: 560 }}
          style={styles.fillClip}
        >
          <Image source={FILLED} style={styles.markImg} contentFit="contain" tintColor={CYAN} />
        </MotiView>
      </MotiView>

      {/* Wordmark EVA + barrido de luz */}
      <View style={styles.wordWrap} onLayout={(e) => setRowW(e.nativeEvent.layout.width)}>
        <View style={styles.row}>
          {LETTERS.map((c, i) => (
            <MotiView
              key={c}
              from={{ opacity: 0, translateY: 22, scale: 0.7 }}
              animate={{ opacity: 1, translateY: 0, scale: 1 }}
              transition={{ type: 'spring', damping: 13, stiffness: 150, delay: 820 + i * 100 }}
            >
              <Text style={styles.letter}>{c}</Text>
            </MotiView>
          ))}
        </View>
        {/* Shimmer (clip al wordmark) */}
        <View style={styles.shimmerClip} pointerEvents="none">
          <MotiView
            from={{ translateX: -rowW * 0.8 }}
            animate={{ translateX: rowW * 1.1 }}
            transition={{ type: 'timing', duration: 900, delay: 1250 }}
            style={styles.shimmerBar}
          >
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.55)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </MotiView>
        </View>
      </View>

      {/* Línea acento que se dibuja */}
      <MotiView
        from={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ type: 'timing', duration: 520, delay: 1180 }}
      >
        <LinearGradient
          colors={['transparent', CYAN, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.accent}
        />
      </MotiView>

      {/* Tagline */}
      <MotiView
        from={{ opacity: 0, translateY: 8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 460, delay: 1450 }}
      >
        <Text style={styles.tagline}>ENTRENAMIENTO PERSONALIZADO</Text>
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
  },
  glowWrap: { position: 'absolute', width: width * 1.25, height: width * 1.25, alignItems: 'center', justifyContent: 'center' },
  glow: { width: '100%', height: '100%', borderRadius: width },
  markWrap: { width: MARK, height: MARK, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  markImg: { width: MARK, height: MARK, position: 'absolute', bottom: 0, left: 0 },
  fillClip: { position: 'absolute', bottom: 0, left: 0, width: MARK, overflow: 'hidden' },
  wordWrap: { marginTop: 10, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  letter: { fontSize: 76, lineHeight: 80, fontFamily: 'Archivo_800ExtraBold', letterSpacing: -2, color: '#FFFFFF' },
  shimmerClip: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  shimmerBar: { position: 'absolute', top: -10, bottom: -10, width: 70, transform: [{ rotate: '18deg' }] },
  accent: { width: width * 0.32, height: 2, borderRadius: 2, marginTop: 16, marginBottom: 18 },
  tagline: { fontSize: 12, fontFamily: 'HankenGrotesk_400Regular', color: 'rgba(255,255,255,0.5)', letterSpacing: 2.5, textAlign: 'center' },
})
