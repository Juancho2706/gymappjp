import { Component, useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { MotiView } from 'moti'
import { useReducedMotion } from 'react-native-reanimated'
import { useTheme } from '../../context/ThemeContext'
import { EASE } from '../../lib/motion'
import { AppBackground } from '../AppBackground'
import { EvaLegacyLoader, type EvaLoaderSize } from './EvaLegacyLoader'
import { CompositeLoaderView, LoaderVariantView, type LoaderVariantSize } from './variants'
import { parseLoaderConfig, resolveLoaderVariant, type LoaderComposite, type LoaderVariant } from '../../lib/brand-loaders'
import { resolveLoaderIdentity, type LoaderIdentityKind } from '../../lib/loader-identity'

/**
 * ORQUESTADOR de la pantalla de carga de marca — espejo de `EvaRouteLoader` en web
 * (apps/web/src/components/ui/EvaRouteLoader.tsx:127-153).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * FLUJO COMPLETO DEL ARRANQUE (lo que el usuario ve, en orden)
 *
 *   1. **Splash NATIVO** (`expo-splash-screen`, `app.json`): figura EVA a 180 pt sobre
 *      `#07080C`. No hay JS todavia, asi que aca la marca del coach es imposible.
 *   2. **`components/entry/SplashGate`** ("Quietud"): replica JS del mismo frame — misma
 *      figura, mismo pixel — y a la vez gate de sesion. Lee la marca de la **cache local**
 *      (`loadStoredBranding`, AsyncStorage, CERO red) y, si la cuenta tiene marca permitida,
 *      cruza en 260 ms a la marca del coach (logo o tile de iniciales + nombre) ANTES de
 *      navegar. Sin cache o sin sesion se queda en EVA y monta la firma.
 *   3. **`DashboardSplashOverlay`**: continua ese mismo frame por encima del dashboard hasta
 *      que la home resuelve su primer load — la marca no se desmonta en la navegacion.
 *   4. **Este componente**: las ~68 pantallas de carga posteriores (`BrandedLoaderScreen`,
 *      exportado como `EvaLoaderScreen`).
 *
 *   La cache de marca la escriben `bootstrapOwnCoachBranding` (coach, al entrar a su panel),
 *   `refreshClientCoachBranding` (alumno) y el Guardar de Mi Marca. CONSECUENCIA CONOCIDA: en
 *   el PRIMER arranque despues de instalar o de cambiar de cuenta todavia no hay nada
 *   guardado, asi que el paso 2 es EVA puro; desde el segundo cold start ya entra la marca.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * QUE PINTA ESTE COMPONENTE
 *
 * IDENTIDAD (`lib/loader-identity.ts`, decision pura y testeada): hay marca cuando la cuenta
 * muestra algo propio — color distinto del azul de sistema, logo cargado o loader
 * personalizado. Con marca: logo si hay, y si no la figura EVA **teñida con `theme.primary`**;
 * el wordmark pasa a ser el texto del loader o, en su defecto, el NOMBRE DE LA MARCA (antes
 * decia "EVA" salvo que el coach hubiera escrito un texto en Avanzado — el bug que reportaba
 * el owner: "tengo Mi marca activada y sigo viendo EVA"). Sin marca: figura EVA + "EVA".
 *
 * FORMA (precedencia identica a web):
 *   1. `loader_config` (compositor "Crear el mio")
 *   2. `loader_variant` distinto de 'eva' (las 6 animaciones)
 *   3. figura/logo + wordmark → `EvaLegacyLoader`
 *
 * TRANSICION: el branding llega del `ThemeContext`, que lo lee de AsyncStorage en un efecto —
 * o sea que los primeros frames de un cold start no lo tienen. En vez de POPEAR de EVA a la
 * marca cuando aterriza, `LoaderIdentityFade` cruza con un fade de 240 ms, y solo cuando la
 * identidad cambia de verdad (montar ya brandeado no anima nada). Con reduce-motion el cambio
 * es instantaneo, sin fade.
 *
 * Fail-closed en dos capas: `parseLoaderConfig`/`resolveLoaderVariant` ya caen a 'eva' ante
 * cualquier dato raro, y `LoaderFailSafe` atrapa un error de render de una variante para que
 * NUNCA se caigan las ~68 pantallas de carga que cuelgan de `BrandedLoaderScreen`.
 *
 * El tier ya viene resuelto: `ThemeContext` entrega `branding` pasado por
 * `resolveEffectiveCoachBrandPresentation` (tier bloqueado ⇒ todo en null/azul ⇒ rama EVA, y
 * el preset materializado en `primaryColor`, que es lo que hace que una marca rosa se lea
 * rosa y no azul).
 */

/** Cruce EVA → marca cuando la cache de branding aterriza (§ transicion del docblock). */
const IDENTITY_FADE_MS = 240

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

  // Identidad (EVA vs marca) — una sola resolucion por render del arbol de carga.
  const identity = useMemo(
    () => resolveLoaderIdentity(branding, resolvedScheme),
    [branding, resolvedScheme],
  )

  const variantSize: LoaderVariantSize = size === 'lg' ? 'lg' : 'md'

  const body =
    !config && variant === 'eva' ? (
      // Rama 3: figura/logo + wordmark. La identidad ya viene resuelta desde aca.
      <EvaLegacyLoader size={size} subtitle={subtitle} identity={identity} />
    ) : (
      <LoaderFailSafe fallback={<EvaLegacyLoader size={size} subtitle={subtitle} identity={identity} />}>
        {config ? (
          <CompositeLoaderView
            config={config}
            brandName={identity.word}
            logoUri={identity.logoUri}
            showIcon={identity.showIcon}
            tintFigure={identity.tintFigure}
            subtitle={subtitle}
            size={variantSize}
            reduceMotion={reduceMotion}
          />
        ) : (
          <LoaderVariantView
            variant={variant as Exclude<LoaderVariant, 'eva'>}
            brandName={identity.word}
            logoUri={identity.logoUri}
            showIcon={identity.showIcon}
            tintFigure={identity.tintFigure}
            subtitle={subtitle}
            size={variantSize}
            reduceMotion={reduceMotion}
          />
        )}
      </LoaderFailSafe>
    )

  return (
    <LoaderIdentityFade kind={identity.kind} reduceMotion={reduceMotion}>
      {body}
    </LoaderIdentityFade>
  )
}

/**
 * Cruce suave EVA ↔ marca. Anima SOLO cuando la identidad cambia respecto del primer frame
 * (la cache de branding aterrizo tarde); montar ya brandeado no anima nada, asi que las
 * pantallas de carga posteriores no parpadean. Reduce-motion ⇒ cambio seco.
 */
export function LoaderIdentityFade({
  kind,
  reduceMotion,
  children,
}: {
  kind: LoaderIdentityKind
  reduceMotion: boolean
  children: ReactNode
}) {
  // Identidad del PRIMER frame (estado inicial, no ref: leer un ref en render esta vetado).
  const [mountedKind] = useState(kind)
  const animate = mountedKind !== kind && !reduceMotion

  return (
    // La `key` remonta el bloque en el cambio de identidad: es lo que dispara el `from`.
    <MotiView
      key={kind}
      from={{ opacity: animate ? 0 : 1 }}
      animate={{ opacity: 1 }}
      transition={{ type: 'timing', duration: animate ? IDENTITY_FADE_MS : 0, easing: EASE.standard }}
    >
      {children}
    </MotiView>
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
