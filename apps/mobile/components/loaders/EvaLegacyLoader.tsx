import { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { MotiView } from 'moti'
import { useReducedMotion } from 'react-native-reanimated'
import { useTheme } from '../../context/ThemeContext'
import { EvaFigure, evaFigureHeight } from '../entry/EvaFigure'
import { CircularBrandLogo } from '../CircularBrandLogo'
import { resolveLoaderIdentity, type LoaderIdentity } from '../../lib/loader-identity'

// Rama SIN animacion elegida del sistema de loaders de marca (la ultima de la precedencia
// loader_config > loader_variant > figura/logo). El orquestador vive en ./BrandedLoader, que
// es tambien quien documenta el flujo completo del arranque.
//
// Dos identidades, una sola pieza (`lib/loader-identity.ts` decide cual):
//   · EVA   → la figura blanca con respiracion sutil, sin wordmark. Es la marca del splash
//             nativo y de toda la familia de entrada. En tema claro la figura se tiñe con la
//             tinta del tema (el PNG es blanco puro; sin tinte seria invisible sobre claro).
//   · MARCA → el logo del coach si lo tiene y, si no, la MISMA figura teñida con
//             `theme.primary`; debajo, el nombre de la marca (o el texto del loader). El
//             wordmark solo aparece en md/lg: en `sm` esto es un spinner dentro de una card
//             y un nombre ahi seria ruido.
//
// Vive en components/loaders/ para que `BrandedLoader` la importe sin ciclo de modulos
// (components/EvaLoader.tsx la re-exporta como `EvaLoader` para los call sites viejos).
export type EvaLoaderSize = 'sm' | 'md' | 'lg'
const FIGURE: Record<EvaLoaderSize, number> = { sm: 44, md: 66, lg: 96 }
const FONT: Record<EvaLoaderSize, number> = { sm: 30, md: 44, lg: 60 }
const LOGO: Record<EvaLoaderSize, number> = { sm: 40, md: 60, lg: 84 }

export function EvaLegacyLoader({
  size = 'lg',
  subtitle,
  identity: identityProp,
}: {
  size?: EvaLoaderSize
  subtitle?: string
  /**
   * Identidad ya resuelta por el orquestador. Los call sites historicos (`<EvaLoader/>`
   * suelto) no la pasan y se resuelve aca con el branding del contexto.
   */
  identity?: LoaderIdentity
}) {
  const { theme, branding, resolvedScheme } = useTheme()
  // Mismo hook que el resto del repo (Walkthrough, selector): Reanimated ya sigue
  // el ajuste del SO vía `<ReducedMotionConfig>` (auditoría a1 §5.2).
  const reduceMotion = useReducedMotion()
  const fallbackIdentity = useMemo(
    () => resolveLoaderIdentity(branding, resolvedScheme),
    [branding, resolvedScheme],
  )
  const identity = identityProp ?? fallbackIdentity
  const fontSize = FONT[size]

  // W-brand B4: `loader_text_color` murió (UI y lectura) — el color del texto lo decide el motor
  // de contraste del tema: `theme.primary` ES el acento de marca clampeado WCAG por scheme.
  const textColor = theme.primary
  const showWordmark = identity.kind === 'brand' && size !== 'sm' && Boolean(identity.word)

  const pulse = reduceMotion
    ? { type: 'timing' as const, duration: 1 }
    : { type: 'timing' as const, duration: 900, loop: true, repeatReverse: true }

  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel="Cargando">
      <View style={styles.markWrap}>
        {identity.showIcon ? (
          identity.logoUri ? (
            <MotiView
              from={{ opacity: 0.5, scale: 0.92 }}
              animate={{ opacity: 1, scale: reduceMotion ? 0.92 : 1.04 }}
              transition={pulse}
            >
              <CircularBrandLogo
                uri={identity.logoUri}
                size={LOGO[size]}
                backgroundColor={theme.card}
                padding={Math.round(LOGO[size] * 0.08)}
              />
            </MotiView>
          ) : (
            <LoaderFigure size={size} reduceMotion={reduceMotion} tinted={identity.tintFigure} />
          )
        ) : null}
        {showWordmark ? (
          <MotiView from={{ opacity: 0.5 }} animate={{ opacity: 1 }} transition={pulse}>
            <Text
              numberOfLines={1}
              style={{
                fontSize: fontSize * 0.62,
                lineHeight: fontSize * 0.72,
                color: textColor,
                fontFamily: 'Archivo_800ExtraBold',
                letterSpacing: -0.5,
                maxWidth: 280,
              }}
            >
              {identity.word}
            </Text>
          </MotiView>
        ) : null}
      </View>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{subtitle}</Text>
      ) : null}
    </View>
  )
}

/**
 * La figura EVA con su respiracion. `tinted` = la cuenta tiene marca pero no logo: la misma
 * silueta se tiñe con el acento de marca (`theme.primary`, ya clampeado WCAG por esquema).
 * Sin marca, el PNG blanco va tal cual en oscuro y con la tinta del tema en claro.
 */
function LoaderFigure({
  size,
  reduceMotion,
  tinted,
}: {
  size: EvaLoaderSize
  reduceMotion: boolean
  tinted: boolean
}) {
  const { resolvedScheme, theme } = useTheme()
  const width = FIGURE[size]
  const tintColor = tinted ? theme.primary : resolvedScheme === 'dark' ? null : theme.foreground
  return (
    <MotiView
      from={{ opacity: 0.55, scale: 0.96 }}
      animate={{ opacity: 1, scale: reduceMotion ? 0.96 : 1.02 }}
      transition={reduceMotion
        ? { type: 'timing', duration: 1 }
        : { type: 'timing', duration: 820, loop: true, repeatReverse: true }}
      style={{ height: evaFigureHeight(width) }}
    >
      <EvaFigure size={width} style={tintColor ? { tintColor } : null} />
    </MotiView>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  markWrap: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  subtitle: { fontSize: 13, letterSpacing: 0.3 },
})
