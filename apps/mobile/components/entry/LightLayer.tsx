import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import Animated from 'react-native-reanimated'
import { EntryBackground } from './EntryBackground'

/**
 * LightLayer — la CAPA DE LUZ white-label de la entrada dark v1.
 * Normativa: `docs/specs/entrada-dark-v1/DESIGN-SPEC.md` §2.
 *
 * El mecanismo (§2.1): una sola capa que NO se desmonta entre pantallas — solo sube o
 * baja de temperatura (`heat`) y de altura de horizonte (`lift`), y en los frames
 * branded cambia de canal RGB al acento del coach. **La luz ES el white-label**:
 * cambiar `rgb` re-brandea el retorno completo sin tocar un solo componente.
 *
 * Fusion normativa (§2.2 / §6 fila 20): se conserva la GEOMETRIA y los STOPS de r2-c
 * (los radiales de `EntryBackground` §1.2, que son el sello) y se adopta la
 * PARAMETRIZACION de r2-b (`--heat` / `--lift` / `--lux-rgb`). Por eso este modulo no
 * dibuja: resuelve la rampa y monta UNA instancia de la atmosfera, animable **solo por
 * `opacity`** (§4 fila R3: se cruzan opacidades, JAMAS se interpola el gradiente —
 * interpolar un gradiente cuesta un repaint por frame).
 *
 * El canvas (capa 0) y el crosshatch (capa 4) quedan FUERA a proposito: el canvas
 * `#07080C` no participa del crossfade (es identico en ambos estados) y la textura es
 * una sola compartida encima de las dos atmosferas (§2.3).
 */

/** Fila de la rampa §2.2, ya resuelta a la geometria r2-c. */
export interface EntryLightSpec {
  /** `--heat` en el espacio r2-b (documental: la app consume `heatTop`). */
  heat: number
  /** `--lift` en % (negativo), espacio r2-b (documental: la app consume `bottomCy`). */
  lift: number
  /** Alpha pico del lavado superior en la geometria r2-c. */
  heatTop: number
  /** Alpha pico del horizonte. Constante 0.05 en toda la familia. */
  heatBottom: number
  /** Ancla del horizonte, en % del alto. */
  bottomCy: number
  /** `sHeat` de la fuente puntual (§1.4). `0` = ese frame no la monta. */
  sourceHeat: number
}

/**
 * Factor de conversion r2-b → r2-c, anclado en el frame 02 que ambos mockups comparten
 * (`--heat .32` ↔ `.15`). Se expone para derivar filas NUEVAS; las 8 filas de §2.2 ya
 * vienen resueltas en `ENTRY_LIGHT` y la spec ordena **no recalcularlas**.
 */
export const R2C_HEAT_FACTOR = 0.469

/** `heatTop` a partir del `--heat` de r2-b. */
export function heatTopFromHeat(heat: number): number {
  return Math.round(heat * R2C_HEAT_FACTOR * 1000) / 1000
}

/** `bottomCy` a partir del `--lift` de r2-b: el default -26% corresponde al 104% de r2-c. */
export function bottomCyFromLift(lift: number): number {
  return 104 + (-26 - lift)
}

/**
 * Rampa normativa §2.2 — **usar estos valores, no recalcular**.
 *
 * La rampa cuenta una historia: nace detras de la figura (01), baja al horizonte bajo el
 * CTA (02), se enciende una unica vez en la eleccion de alumno (03, pico .206), se apaga
 * en el camino de codigo y de coach (04-05) y vuelve ya branded en el retorno (06-07).
 *
 * Excepcion documentada: `returnCoach.heatTop` es **0.170**, no el 0.159 que daria el
 * factor — coincide exactamente con el `rgba(18,169,113,.17)` de `.amb.wl` de r2-c, que
 * es lo que hace que la fusion cierre sin drift (§2.2, nota).
 */
export const ENTRY_LIGHT = Object.freeze({
  /** 01 · Splash cold start (EVA). */
  splash: { heat: 0.28, lift: -40, heatTop: 0.131, heatBottom: 0.05, bottomCy: 118, sourceHeat: 0.2 },
  /** 02 · Valor + rol (EVA). */
  valueRole: { heat: 0.32, lift: -22, heatTop: 0.15, heatBottom: 0.05, bottomCy: 100, sourceHeat: 0 },
  /** 03 · Morph alumno (EVA) — el unico pico de la familia. */
  morphStudent: { heat: 0.44, lift: -16, heatTop: 0.206, heatBottom: 0.05, bottomCy: 94, sourceHeat: 0 },
  /** 04 · /alumno/codigo (EVA). */
  code: { heat: 0.16, lift: -32, heatTop: 0.075, heatBottom: 0.05, bottomCy: 110, sourceHeat: 0 },
  /** 05 · Morph coach (EVA) — minimo de la rampa. */
  morphCoach: { heat: 0.11, lift: -36, heatTop: 0.052, heatBottom: 0.05, bottomCy: 114, sourceHeat: 0 },
  /** 06 · Retorno, capa EVA. */
  returnEva: { heat: 0.26, lift: -38, heatTop: 0.122, heatBottom: 0.05, bottomCy: 116, sourceHeat: 0.2 },
  /** 06 · Retorno, capa COACH. */
  returnCoach: { heat: 0.34, lift: -34, heatTop: 0.17, heatBottom: 0.05, bottomCy: 112, sourceHeat: 0.24 },
  /** 07 · Dashboard (coach). */
  dashboard: { heat: 0.18, lift: -34, heatTop: 0.084, heatBottom: 0.05, bottomCy: 112, sourceHeat: 0 },
}) satisfies Record<string, EntryLightSpec>

export interface LightLayerProps {
  /** Fila de la rampa §2.2. */
  spec: EntryLightSpec
  /** `--lux-rgb`. Default EVA `#1A6BE6`; el acento del coach llega por prop, no por `vars()`. */
  accent?: string
  /** `--lux-soft-rgb`. Si se omite se deriva del acento (`entryAccentSoft`). */
  accentSoft?: string
  /**
   * SOLO `opacity` (estilo animado de Reanimated). Cualquier otra propiedad rompe el
   * contrato de §4 R3 y mete relayout en el peor momento del cold start.
   */
  style?: StyleProp<ViewStyle>
}

export function LightLayer({ spec, accent, accentSoft, style }: LightLayerProps) {
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <EntryBackground
        canvas={false}
        grain={false}
        accent={accent}
        accentSoft={accentSoft}
        heatTop={spec.heatTop}
        heatBottom={spec.heatBottom}
        bottomCy={spec.bottomCy}
      />
    </Animated.View>
  )
}
