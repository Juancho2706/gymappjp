import { Platform } from 'react-native'
import { BlurView, type BlurViewProps } from 'expo-blur'

/**
 * EvaBlur — ÚNICO punto de la app que decide el método de blur de `expo-blur`.
 *
 * POR QUÉ existe: `experimentalBlurMethod="dimezisBlurView"` crashea en Android 15
 * (EVA-MOBILE-7, crash-loop real en producción, no teórico). La BlurView de Dimezis
 * captura su fondo dibujando el árbol de HERMANOS dentro de `onPreDraw`; cuando esa
 * lista incluye hermanos con `zIndex`/`elevation`, Android 15 reordena los hijos del
 * ViewGroup mientras ese draw re-entrante sigue iterando la lista anterior y revienta
 * con `IndexOutOfBoundsException`. El proceso muere, la app reabre en la MISMA pantalla
 * y vuelve a morir — de ahí el loop. Ninguna guarda JS lo evita: la única salida es no
 * habilitar ese método en Android.
 *
 * QUÉ hace: iOS conserva el prop (allí es inerte — `experimentalBlurMethod` está
 * marcado `@platform android` y el difuminado lo pone `UIVisualEffectView`); el gate
 * se escribe así, y no borrando el prop, para que quede explícito QUÉ plataforma jamás
 * debe recibirlo. Android lo OMITE y cae al default `'none'` de expo-blur.
 *
 * CONSECUENCIA VISUAL que todo call site debe asumir: en Android ya NO hay difuminado,
 * solo un velo plano `tint` @ `intensity`. Cualquier superficie que dependa del blur
 * para leerse como material (cápsulas de navegación) o para OCULTAR contenido (teasers
 * de módulos no contratados) necesita su propio backing sólido bajo `Platform.OS ===
 * 'android'`. Ver `alumno/AlumnoMobileChrome.tsx` y el teaser de
 * `coach/clientDetail/ProgresoTab.tsx`.
 *
 * Regla: nadie fuera de este archivo pasa `experimentalBlurMethod` (por eso el tipo lo
 * omite: intentarlo es error de compilación, no un descuido silencioso).
 */
export type EvaBlurProps = Omit<BlurViewProps, 'experimentalBlurMethod'>

export function EvaBlur(props: EvaBlurProps) {
  return (
    <BlurView
      {...props}
      experimentalBlurMethod={Platform.OS === 'ios' ? 'dimezisBlurView' : undefined}
    />
  )
}
