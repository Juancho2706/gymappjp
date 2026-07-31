import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { MotiView } from 'moti'
import { BrandLogoCircle } from '../../BrandLogoCircle'
import { Skeleton } from '../../Skeleton'
import { useTheme } from '../../../context/ThemeContext'
import { hexToRgba } from '../../../lib/theme'
import { useEvaMotion } from '../../../lib/motion'
import { FONT, textStyle } from '../../../lib/typography'

// Spring "snappy" del web (`animation-presets.ts:4` stiffness 400 / damping 30) —
// mismo resorte para el fade del eyebrow y el stagger palabra-por-palabra.
const SPRING_SNAPPY = { type: 'spring', stiffness: 400, damping: 30 } as const

/** Estilo eyebrow compartido por marca y fecha (10px uppercase, tracking 1). */
const EYEBROW = { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 } as const

/**
 * §2 DashboardHeader (web `DashboardHeader.tsx`) — rediseño "Mock C" (CEO 2026-07-30):
 * header CONTEXTUAL, sin borde duro. La superficie ahora es un degradado vertical muy
 * sutil (una elevación `surface-card` que se desvanece hacia `surface-app`), así el
 * header se funde con el scroll en vez de cortarse con una línea.
 *
 * Composición:
 *   1. Fila eyebrow: `brandName` (izq) ↔ `dateLabel` (der), mismo estilo 10px uppercase.
 *   2. Saludo `{timeGreeting}, {firstName}` (display) con stagger palabra-por-palabra.
 *   3. `welcomeMessage` con el LOGO del coach en un círculo de 22px y el mensaje entre
 *      comillas tipográficas.
 *
 * Se monta como PRIMER hijo del ScrollView (full-bleed) para que SCROLLEE con el
 * contenido — paridad con el header web md (el CEO marcó el header fijo como
 * divergencia). `pt-safe` vía insets y `zIndex` conservados.
 */
export function DashboardHeader({
  greeting,
  dateLabel,
  brandName,
  welcomeMessage,
}: {
  greeting: string
  dateLabel: string
  brandName?: string | null
  welcomeMessage?: string | null
}) {
  const insets = useSafeAreaInsets()
  const motion = useEvaMotion()
  const { theme } = useTheme()
  const greetingStyle = textStyle('2xl', FONT.displayBlack, { lh: 'snug', ls: 'tighter' })

  // Wash de elevación: `surface-card` (blanco en light, #161B22 en dark) desvaneciéndose
  // a transparente sobre la base `surface-app`. Se derivan del tema, NUNCA de la marca, y
  // el delta es el mismo escalón del DS en ambos esquemas ⇒ igual de sutil en light (no
  // hay "mancha gris": en claro el wash es MÁS claro que el papel, no más oscuro).
  const washTop = hexToRgba(theme.card, 0.9)
  const washBottom = hexToRgba(theme.card, 0)

  const eyebrowRow = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: brandName ? 'space-between' : 'flex-end',
        gap: 8,
      }}
    >
      {brandName ? (
        <Text
          className="text-subtle"
          numberOfLines={1}
          style={{ ...EYEBROW, fontFamily: FONT.uiBold, flexShrink: 1 }}
        >
          {brandName}
        </Text>
      ) : null}
      <Text className="text-muted" numberOfLines={1} style={{ ...EYEBROW, fontFamily: FONT.uiSemibold }}>
        {dateLabel}
      </Text>
    </View>
  )

  const welcomeRow = welcomeMessage ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
      <BrandLogoCircle size={22} brandName={brandName} />
      <Text className="text-muted" numberOfLines={1} style={{ flex: 1, fontSize: 12, fontFamily: FONT.ui }}>
        {`“${welcomeMessage}”`}
      </Text>
    </View>
  ) : null

  return (
    <View
      className="bg-surface-app"
      style={{ paddingTop: insets.top, paddingHorizontal: 16, zIndex: 40 }}
    >
      <LinearGradient
        colors={[washTop, washBottom]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={{ minHeight: 56, justifyContent: 'center', paddingTop: 8, paddingBottom: 12, gap: 2 }}>
        {motion.reduced ? (
          // Rama estatica = web ClientGreeting.tsx:14-21 (reduced motion sin animacion).
          <>
            {eyebrowRow}
            <Text className="text-strong" numberOfLines={1} style={greetingStyle}>
              {greeting}
            </Text>
            {welcomeRow}
          </>
        ) : (
          // Entrada animada del saludo (web ClientGreeting.tsx:24-43): eyebrow fade-in
          // spring snappy + saludo con stagger palabra-por-palabra (staggerContainer(0.04)
          // → delay 40ms/palabra; fadeSlideUp opacity 0/y16 → 1/0). Re-dispara al cambiar
          // el dia via `key={dateLabel}` (espejo del `key={iso}` web DashboardHeader.tsx:27).
          // Adaptacion RN: las palabras van en un row con overflow hidden (no hay ellipsis
          // por-palabra como el `truncate` web).
          <View key={dateLabel} style={{ gap: 2 }}>
            <MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={SPRING_SNAPPY}>
              {eyebrowRow}
            </MotiView>
            <View style={{ flexDirection: 'row', flexWrap: 'nowrap', overflow: 'hidden' }}>
              {greeting.split(' ').map((w, i) => (
                <MotiView
                  key={`${w}-${i}`}
                  from={{ opacity: 0, translateY: 16 }}
                  animate={{ opacity: 1, translateY: 0 }}
                  transition={{ ...SPRING_SNAPPY, delay: i * 40 }}
                >
                  <Text className="text-strong" numberOfLines={1} style={[greetingStyle, { marginRight: 4 }]}>
                    {w}
                  </Text>
                </MotiView>
              ))}
            </View>
            {welcomeRow ? (
              <MotiView
                from={{ opacity: 0, translateY: 6 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ ...SPRING_SNAPPY, delay: 120 }}
              >
                {welcomeRow}
              </MotiView>
            ) : null}
          </View>
        )}
      </View>
    </View>
  )
}

/**
 * Skeleton del header para el estado loading (paridad con `DashboardHeaderSkeleton`
 * web, `dashboard-skeletons.tsx:19-28`): MISMA superficie/wash/insets que el header
 * real pero con barras `Skeleton` en vez de TEXTO de saludo, y reflejando la nueva
 * estructura de tres filas (eyebrow marca↔fecha, saludo, mensaje con logo). Critico
 * para el P0-3: durante la carga NO se pinta ningun saludo placeholder ("Hola"/"Buenas
 * tardes") → el saludo textual aparece UNA sola vez, ya con el nombre final, al terminar
 * la carga (elimina el swap que se leia como duplicado/marquee).
 */
export function DashboardHeaderSkeleton() {
  const insets = useSafeAreaInsets()
  const { theme } = useTheme()
  return (
    <View
      className="bg-surface-app"
      style={{ paddingTop: insets.top, paddingHorizontal: 16, zIndex: 40 }}
    >
      <LinearGradient
        colors={[hexToRgba(theme.card, 0.9), hexToRgba(theme.card, 0)]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={{ minHeight: 56, justifyContent: 'center', paddingTop: 8, paddingBottom: 12, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Skeleton width={92} height={10} radius={4} />
          <Skeleton width={110} height={10} radius={4} />
        </View>
        <Skeleton width={200} height={24} radius={6} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Skeleton width={22} height={22} radius={11} />
          <Skeleton width={150} height={10} radius={4} />
        </View>
      </View>
    </View>
  )
}
