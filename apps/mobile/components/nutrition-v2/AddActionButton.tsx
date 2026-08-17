import { Pressable, Text, View } from 'react-native'
import type { ImageStyle, StyleProp, ViewStyle } from 'react-native'
import { Image } from 'expo-image'

import {
  DEFAULT_BRAND_HEX,
  normalizeBrandHex,
  readableInkOn,
} from '../../lib/color-contrast'

/**
 * AddActionButton RN (T3.v Cabina — «Familia N») — espejo nativo de
 * `apps/web/src/components/nutrition-v2/AddActionButton.tsx`.
 *
 * La pastilla única con la que se agrega CUALQUIER cosa en el editor de nutrición V2: franja,
 * porciones, día, plantilla, versión, comida libre y alimento. Forma fija —
 * [ícono 24 px] + [«+» en el acento] + [label]— para que el coach reconozca «esto agrega algo» por
 * silueta, sin leer, y para que la web y el móvil no tengan dos idiomas distintos para lo mismo.
 *
 * Esta tanda SOLO crea la fundación; el swap de las superficies (quick-edit, sheets) va aparte.
 *
 * Diferencias legítimas con la web, ninguna estética:
 * - No hay hover, así que no hay tilt del ícono ni abanico del stack. El feedback es el `active:` de
 *   NativeWind, que es el idiom del quick-edit (ver los botones «Agregar alimento»/«Libre» de
 *   `EditableSlotCard`). Sin Moti ni Reanimated: no hace falta estado para opacidad.
 * - Alto SIEMPRE 44 px (`min-h-11`): en el móvil el puntero es siempre grueso. La web baja a 34 px
 *   solo en puntero fino.
 * - Los íconos van bundleados (`assets/action-icons/*.webp`, copiados de `apps/web/public/`) con
 *   `require` estático — Metro exige literales, y bajarlos por red sería red y latencia para un
 *   adorno (misma política que los íconos de categoría, ver `nutrition-v2-food-media.ts`).
 *
 * Gotcha RN del repo respetado: JAMÁS `className` + `style` como FUNCIÓN en el mismo elemento —
 * css-interop descarta el prop y el elemento pierde TODO el estilo. Acá los `style` son objetos
 * estáticos (constantes de módulo) u objetos armados en render, nunca funciones, y el estado
 * `pressed` vive en la variante `active:` de la className.
 */

/* ------------------------------------------------------------------------------------------------
 * Íconos de acción
 * ---------------------------------------------------------------------------------------------- */

export const ADD_ACTION_ICONS = [
  'franja',
  'porciones',
  'dia',
  'plantilla',
  'version',
  'libre',
] as const

export type AddActionIcon = (typeof ADD_ACTION_ICONS)[number]

/** `require` estático por asset: Metro no resuelve rutas armadas en runtime. */
const ACTION_ICON_SOURCES: Record<AddActionIcon, ReturnType<typeof require>> = {
  franja: require('../../assets/action-icons/franja.webp'),
  porciones: require('../../assets/action-icons/porciones.webp'),
  dia: require('../../assets/action-icons/dia.webp'),
  plantilla: require('../../assets/action-icons/plantilla.webp'),
  version: require('../../assets/action-icons/version.webp'),
  libre: require('../../assets/action-icons/libre.webp'),
}

export function addActionIconSource(icon: AddActionIcon): ReturnType<typeof require> {
  return ACTION_ICON_SOURCES[icon]
}

/* ------------------------------------------------------------------------------------------------
 * Tinta con contraste real
 * ---------------------------------------------------------------------------------------------- */

export type AddActionVariant = 'neutral' | 'primary' | 'dashed'

export type AddActionInk = {
  /** Color del label — `null` cuando lo pone un token del DS por className. */
  text: string | null
  /** Color del «+». */
  plus: string
}

/**
 * Misma regla que la web (`addActionInk`), calculada con `readableInkOn`, que es el espejo exacto
 * de `getContrastInfo`:
 *
 * - `primary`: el fondo ES el color de marca ⇒ texto y «+» comparten la tinta que gana en
 *   contraste. El «+» no puede ir en el acento acá: acento y fondo serían el mismo color.
 * - `neutral` / `dashed`: el fondo es una superficie del DS ⇒ el texto va por token (`text-strong`,
 *   que ya flipea solo en dark) y el «+» en el acento de marca, que es el punto de color que hace
 *   reconocible a la familia.
 */
export function addActionInk(
  brandHex?: string | null,
  variant: AddActionVariant = 'primary',
): AddActionInk {
  const brand = normalizeBrandHex(brandHex)
  if (variant !== 'primary') return { text: null, plus: brand }
  const ink = readableInkOn(brand)
  return { text: ink, plus: ink }
}

/* ------------------------------------------------------------------------------------------------
 * Estilos
 * ---------------------------------------------------------------------------------------------- */

const BASE_CLASSES =
  'min-h-11 shrink-0 flex-row items-center gap-2 rounded-pill px-3 active:opacity-70'

const VARIANT_CLASSES: Record<AddActionVariant, string> = {
  neutral: 'border border-subtle bg-surface-card',
  // Fondo de marca ⇒ sin borde (el color ya separa del fondo).
  primary: '',
  // Punteado = «hueco por llenar» (agregar día, comida libre). El borde sube a `border-default`
  // porque un dashed sobre `border-subtle` se pierde: la línea discontinua tiene la mitad de tinta.
  // Gotcha Android: con `borderRadius` alto el dashed puede dibujarse sólido — es degradación
  // aceptada (la forma y el ícono siguen comunicando), no un bug a perseguir con una lib nueva.
  dashed: 'border border-dashed border-default bg-surface-card',
}

const TEXT_CLASSES: Record<AddActionVariant, string> = {
  neutral: 'text-[13px] font-semibold text-strong',
  primary: 'text-[13px] font-semibold',
  dashed: 'text-[13px] font-semibold text-strong',
}

/** 24 px igual que la web; medidas fijas para que la fila no salte al cargar el webp. */
const ICON_SIZE = 24
const ICON_STYLE: ImageStyle = { width: ICON_SIZE, height: ICON_SIZE }

/**
 * Moneda del stack: disco OPACO de 28 px con el ícono de 24 px centrado. El disco es del color del
 * propio fondo del botón, así que al solaparse −7 px cada moneda tapa el borde de la anterior y se
 * leen separadas sin inventar un color nuevo (equivalente al anillo `box-shadow` de la web).
 */
const STACK_COIN = 28
const STACK_OVERLAP = -7
const STACK_MAX = 3

const STACK_COIN_STYLE: ViewStyle = {
  width: STACK_COIN,
  height: STACK_COIN,
  borderRadius: STACK_COIN / 2,
  alignItems: 'center',
  justifyContent: 'center',
}

const PLUS_STYLE = { fontSize: 15, lineHeight: 18, fontWeight: '700' } as const

/* ------------------------------------------------------------------------------------------------
 * Componente
 * ---------------------------------------------------------------------------------------------- */

/** `expo-image` acepta URI (string) o el número que devuelve `require`. */
export type AddActionStackSource = string | number

type AddActionButtonBaseProps = {
  /** Texto del botón (ej. «Agregar franja»). Es también el nombre accesible por defecto. */
  label: string
  variant?: AddActionVariant
  /**
   * Color de marca del coach en hex (`branding.primaryColor`). Pinta el fondo en `primary` y el
   * «+» en `neutral`/`dashed`. Sin prop se usa el primary de EVA — igual que la web: el componente
   * NO lee `ThemeContext` por su cuenta para no atarse al provider de cada superficie.
   */
  brandColor?: string | null
  onPress?: () => void
  disabled?: boolean
  /** Clases NativeWind extra (estáticas: nunca `style` como función). */
  className?: string
  accessibilityLabel?: string
  testID?: string
}

/** `icon` y `stack` son MUTUAMENTE EXCLUYENTES por tipo: pasar los dos rompe en `tsc`. */
export type AddActionButtonProps = AddActionButtonBaseProps &
  (
    | { icon: AddActionIcon; stack?: never }
    /** 2-3 íconos de categoría solapados (para «Agregar alimento»). */
    | { stack: readonly AddActionStackSource[]; icon?: never }
  )

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export function AddActionButton({
  label,
  variant = 'neutral',
  brandColor,
  icon,
  stack,
  onPress,
  disabled = false,
  className,
  accessibilityLabel,
  testID,
}: AddActionButtonProps) {
  const brand = normalizeBrandHex(brandColor)
  const ink = addActionInk(brandColor, variant)
  const isPrimary = variant === 'primary'

  // Objetos armados en render, NO funciones: css-interop los acepta junto a `className`.
  const containerStyle: StyleProp<ViewStyle> = isPrimary
    ? { backgroundColor: brand, opacity: disabled ? 0.5 : 1 }
    : { opacity: disabled ? 0.5 : 1 }

  // El halo/moneda del stack es el propio fondo del botón. En `neutral`/`dashed` el fondo es un
  // token, así que la moneda lo toma por className y no por color literal.
  const coinClassName = isPrimary ? '' : 'bg-surface-card'
  const coinStyle: StyleProp<ViewStyle> = isPrimary
    ? [STACK_COIN_STYLE, { backgroundColor: brand }]
    : STACK_COIN_STYLE

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      className={cx(BASE_CLASSES, VARIANT_CLASSES[variant], className)}
      style={containerStyle}
    >
      {icon ? (
        <Image
          contentFit="contain"
          source={addActionIconSource(icon)}
          style={ICON_STYLE}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}

      {stack ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="flex-row items-center"
        >
          {stack.slice(0, STACK_MAX).map((source, index) => (
            <View
              key={`${String(source)}-${index}`}
              className={coinClassName}
              style={[
                coinStyle,
                // La primera moneda arriba: el grupo se lee de izquierda a derecha.
                { zIndex: STACK_MAX - index, marginLeft: index > 0 ? STACK_OVERLAP : 0 },
              ]}
            >
              <Image contentFit="contain" source={source} style={ICON_STYLE} />
            </View>
          ))}
        </View>
      ) : null}

      {/* El «+» va pegado al label (gap 4) y no al ícono (gap 8), igual que en la web: se lee
          «+ Agregar franja», no tres piezas sueltas. */}
      <View className="flex-row items-baseline gap-1">
        {/* Decorativo: el nombre accesible ya es el label («Agregar franja»), así que un lector de
            pantalla que además dijera «más» leería la acción dos veces. */}
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[PLUS_STYLE, { color: ink.plus }]}
        >
          +
        </Text>

        <Text
          className={TEXT_CLASSES[variant]}
          style={ink.text ? { color: ink.text } : undefined}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  )
}

export { DEFAULT_BRAND_HEX as ADD_ACTION_DEFAULT_BRAND }
