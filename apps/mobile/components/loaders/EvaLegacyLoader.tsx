import { View, Text, StyleSheet } from 'react-native'
import { MotiView } from 'moti'
import { useReducedMotion } from 'react-native-reanimated'
import { Image } from 'expo-image'
import { useTheme } from '../../context/ThemeContext'
import { EvaFigure, evaFigureHeight } from '../entry/EvaFigure'

// EVA brand loader — la FIGURA blanca de EVA con respiración sutil (QA2 2026-07-29:
// muere el wordmark tricolor "EVA" viejo; el sistema actual es la figura — misma marca
// que el splash nativo y la familia de entrada). En tema claro la figura se tiñe con la
// tinta del tema (el PNG es blanco puro; sin tinte sería invisible sobre claro).
//
// Esta es la RAMA 'eva' del sistema de loaders de marca (la última de la precedencia
// loader_config > loader_variant > legacy > EVA). El orquestador vive en ./BrandedLoader.
// Vive en components/loaders/ para que `BrandedLoader` la importe sin ciclo de módulos
// (components/EvaLoader.tsx la re-exporta como `EvaLoader` para los call sites viejos).
export type EvaLoaderSize = 'sm' | 'md' | 'lg'
const FIGURE: Record<EvaLoaderSize, number> = { sm: 44, md: 66, lg: 96 }
const FONT: Record<EvaLoaderSize, number> = { sm: 30, md: 44, lg: 60 }
const LOGO: Record<EvaLoaderSize, number> = { sm: 40, md: 60, lg: 84 }

export function EvaLegacyLoader({ size = 'lg', subtitle }: { size?: EvaLoaderSize; subtitle?: string }) {
  const { theme, branding, resolvedScheme } = useTheme()
  // Mismo hook que el resto del repo (Walkthrough, selector): Reanimated ya sigue
  // el ajuste del SO vía `<ReducedMotionConfig>` (auditoría a1 §5.2).
  const reduceMotion = useReducedMotion()
  const fontSize = FONT[size]

  // M-F1: loader personalizado del coach. Si está activo, honra texto/color/icon-mode/logo.
  const custom = branding?.useCustomLoader
  const iconMode = branding?.loaderIconMode ?? 'eva'
  const customText = (branding?.loaderText ?? '').trim()
  const textColor = branding?.loaderTextColor || theme.primary
  // QA4 b2: en oscuro gana `logo_url_dark` (cae al claro si no existe) — misma regla que
  // `resolveThemedLogoSrcs` en web. Antes el loader ignoraba la variante oscura.
  const coachLogo =
    (resolvedScheme === 'dark' ? branding?.logoUrlDark || branding?.logoUrl : branding?.logoUrl) || null
  // QA4 b1: `coach` SIN logo cargado ya no renderiza vacío; cae a la figura EVA
  // (paridad con web, EvaRouteLoader.tsx:120-121 exige Boolean(coachLogoUrl)).
  const showCoachLogo = iconMode === 'coach' && Boolean(coachLogo)

  const pulse = reduceMotion
    ? { type: 'timing' as const, duration: 1 }
    : { type: 'timing' as const, duration: 900, loop: true, repeatReverse: true }

  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel="Cargando">
      {custom ? (
        <View style={styles.customWrap}>
          {showCoachLogo ? (
            <MotiView from={{ opacity: 0.5, scale: 0.92 }} animate={{ opacity: 1, scale: reduceMotion ? 0.92 : 1.04 }} transition={pulse}>
              <Image source={{ uri: coachLogo as string }} style={{ width: LOGO[size], height: LOGO[size] }} contentFit="contain" transition={150} />
            </MotiView>
          ) : iconMode === 'none' ? null : (
            <DefaultEvaFigure size={size} reduceMotion={reduceMotion} />
          )}
          {customText ? (
            <MotiView from={{ opacity: 0.5 }} animate={{ opacity: 1 }} transition={pulse}>
              <Text style={{ fontSize: fontSize * 0.62, lineHeight: fontSize * 0.72, color: textColor, fontFamily: 'Archivo_800ExtraBold', letterSpacing: -0.5 }}>
                {customText}
              </Text>
            </MotiView>
          ) : null}
        </View>
      ) : (
        <DefaultEvaFigure size={size} reduceMotion={reduceMotion} />
      )}
      {subtitle ? (
        <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{subtitle}</Text>
      ) : null}
    </View>
  )
}

function DefaultEvaFigure({ size, reduceMotion }: { size: EvaLoaderSize; reduceMotion: boolean }) {
  const { resolvedScheme, theme } = useTheme()
  const width = FIGURE[size]
  return (
    <MotiView
      from={{ opacity: 0.55, scale: 0.96 }}
      animate={{ opacity: 1, scale: reduceMotion ? 0.96 : 1.02 }}
      transition={reduceMotion
        ? { type: 'timing', duration: 1 }
        : { type: 'timing', duration: 820, loop: true, repeatReverse: true }}
      style={{ height: evaFigureHeight(width) }}
    >
      <EvaFigure
        size={width}
        // El asset es blanco puro: sobre tema claro se tiñe con la tinta del tema.
        style={resolvedScheme === 'dark' ? null : { tintColor: theme.foreground }}
      />
    </MotiView>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  customWrap: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  subtitle: { fontSize: 13, letterSpacing: 0.3 },
})
