import { Component, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { useTheme } from '../../context/ThemeContext'
import { AppBackground } from '../AppBackground'
import { EvaLegacyLoader, type EvaLoaderSize } from './EvaLegacyLoader'
import { CompositeLoaderView, LoaderVariantView, type LoaderVariantSize } from './variants'
import { parseLoaderConfig, resolveLoaderVariant, type LoaderComposite, type LoaderVariant } from '../../lib/brand-loaders'

/**
 * ORQUESTADOR de la pantalla de carga de marca — espejo de `EvaRouteLoader` en web
 * (apps/web/src/components/ui/EvaRouteLoader.tsx:127-153).
 *
 * PRECEDENCIA (identica a web):
 *   1. `loader_config` (compositor "Crear el mio")
 *   2. `loader_variant` distinto de 'eva' (las 6 animaciones)
 *   3. loader legacy del coach (texto/icono/color) → `EvaLegacyLoader`
 *   4. figura EVA
 *
 * Fail-closed en dos capas: `parseLoaderConfig`/`resolveLoaderVariant` ya caen a 'eva' ante
 * cualquier dato raro, y `LoaderFailSafe` atrapa un error de render de una variante para que
 * NUNCA se caigan las ~68 pantallas de carga que cuelgan de `BrandedLoaderScreen`.
 *
 * El tier ya viene resuelto: `ThemeContext` entrega `branding` pasado por
 * `resolveEffectiveCoachBrandPresentation` (por debajo de Pro llega todo en null ⇒ rama EVA).
 */

export type BrandedLoaderProps = {
  size?: EvaLoaderSize
  subtitle?: string
  /** Fuerza una variante (preview del editor). Sin esto se lee del branding del contexto. */
  variantOverride?: LoaderVariant | null
  /** Fuerza una config compuesta (preview del editor). `null` explicito la ignora. */
  configOverride?: LoaderComposite | null
  /** El preview del editor pasa `true` para que un override `null` gane sobre el branding real. */
  useOverrides?: boolean
}

export function BrandedLoader({
  size = 'lg',
  subtitle,
  variantOverride,
  configOverride,
  useOverrides = false,
}: BrandedLoaderProps) {
  const { branding, resolvedScheme } = useTheme()
  const reduceMotion = useReducedMotion()

  const config = useOverrides ? (configOverride ?? null) : parseLoaderConfig(branding?.loaderConfig ?? null)
  const variant = useOverrides
    ? resolveLoaderVariant(variantOverride)
    : resolveLoaderVariant(branding?.loaderVariant)

  if (!config && variant === 'eva') {
    // Rama 3+4: el loader legacy ya distingue "custom con texto" de la figura EVA pura.
    return <EvaLegacyLoader size={size} subtitle={subtitle} />
  }

  // Wordmark: paridad EXACTA con web (EvaRouteLoader.tsx:84) — es el texto del loader, no el
  // brand_name. Sin loader custom activo, 'EVA'.
  const customText = (branding?.loaderText ?? '').trim()
  const word = branding?.useCustomLoader && customText ? customText.toUpperCase() : 'EVA'

  const iconMode = branding?.loaderIconMode ?? 'eva'
  const showIcon = iconMode !== 'none'
  // Logo del coach por modo (logo_url_dark cae al claro). Solo cuenta si el modo es 'coach';
  // en cualquier otro caso el icono es la figura EVA (fallback de web, EvaRouteLoader.tsx:120-121).
  const logoUri =
    iconMode === 'coach'
      ? (resolvedScheme === 'dark' ? branding?.logoUrlDark || branding?.logoUrl : branding?.logoUrl) || null
      : null

  const variantSize: LoaderVariantSize = size === 'lg' ? 'lg' : 'md'

  return (
    <LoaderFailSafe fallback={<EvaLegacyLoader size={size} subtitle={subtitle} />}>
      {config ? (
        <CompositeLoaderView
          config={config}
          brandName={word}
          logoUri={logoUri}
          showIcon={showIcon}
          subtitle={subtitle}
          size={variantSize}
          reduceMotion={reduceMotion}
        />
      ) : (
        <LoaderVariantView
          variant={variant as Exclude<LoaderVariant, 'eva'>}
          brandName={word}
          logoUri={logoUri}
          showIcon={showIcon}
          subtitle={subtitle}
          size={variantSize}
          reduceMotion={reduceMotion}
        />
      )}
    </LoaderFailSafe>
  )
}

/**
 * Loader a sección completa. Usa `absoluteFill` + fondo opaco + AppBackground propio,
 * así CUBRE toda la pantalla aunque se monte como hermano tras un header (antes
 * quedaba chico debajo del título). Sirve para arranque y para estados loading.
 *
 * `components/EvaLoader.tsx` lo re-exporta como `EvaLoaderScreen`: con eso las ~68 pantallas
 * de carga honran la eleccion del coach sin tocar un solo call site.
 */
export function BrandedLoaderScreen({ subtitle }: { subtitle?: string }) {
  const { theme } = useTheme()
  return (
    <View style={[StyleSheet.absoluteFill, styles.screen, { backgroundColor: theme.background }]}>
      <AppBackground />
      <BrandedLoader subtitle={subtitle} />
    </View>
  )
}

/** Boundary minimo: una variante rota jamas debe tumbar una pantalla de carga. */
class LoaderFailSafe extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
