import { useCallback, useEffect, useId, useState } from 'react'
import { Dimensions, Pressable, Text, View } from 'react-native'
import type { TextStyle } from 'react-native'
import { AnchoredPopup, useAnchor, type AnchorRect } from '../_anchored'
import { FONT, LINE_HEIGHT, TYPE_SCALE } from '../../lib/typography'
import { resolveOrFallback } from '../../lib/measure-guard'
import { MacroSpark, type MacroSparkProps } from './MacroSpark'

/**
 * MacroSparkPopover RN (T3.v Cabina, tarea V3.1) — espejo nativo de
 * `apps/web/src/components/nutrition-v2/MacroSparkPopover.tsx`: el `MacroSpark` con los gramos
 * exactos a un tap. La barra resume; este popover es la garantía de que NADA se esconde —«los
 * gramos nunca quedan inaccesibles» es invariante bloqueante de la tanda (SPEC §Invariantes).
 *
 * Contrato de interacción en RN (SPEC D3, rama «puntero grueso»):
 * - Tap en el spark abre un mini-popover ANCLADO al elemento (posición medida con
 *   `measureInWindow`, flip arriba↔abajo si no cabe, clamp contra los bordes seguros).
 * - Cierra con tap fuera (backdrop), con el botón atrás de Android (`onRequestClose` del Modal) y
 *   al abrir otro spark. No hay hover ni foco de teclado: esas dos ramas son exclusivas de web.
 * - Scroll: en RN el `Modal` captura el toque, así que la lista de atrás NO puede desplazarse
 *   mientras el panel está abierto — el «cierre por scroll» de la web no tiene equivalente ni hace
 *   falta (el ancla no se puede volver obsoleta).
 *
 * Por qué se apoya en `components/_anchored`: ese módulo YA es el motor compartido de anclaje de
 * los overlays nativos (`Modal transparent` + `measureInWindow` + flip + clamp + backdrop +
 * `onRequestClose`), escrito justamente para que los overlays anclados no dupliquen ni deriven esa
 * matemática. El `Popover` público del DS no sirve acá porque su apertura es interna (no
 * controlada) y este popover necesita que OTRA instancia lo pueda cerrar (uno abierto a la vez) y
 * un panel compacto en vez del padding de ficha del DS.
 */
export type MacroSparkPopoverProps = MacroSparkProps & {
  fiberG?: number | null
  /** Meta de kcal del día/franja: si es > 0 el panel agrega «{n}% de la meta». */
  targetCalories?: number | null
  /** Contexto para el lector de pantalla (ej. nombre del alimento o de la franja). */
  ariaContext?: string
  /** Los macros son por 100 g (paleta/picker): el panel lo dice explícitamente. */
  per100?: boolean
  /**
   * Etiqueta de base EXPLÍCITA (ej. «por 30 g») que reemplaza el texto fijo de `per100`. Existe por
   * NUT-001: el catálogo tiene filas `per_serving` cuyos macros NO son por 100 g. Si se pasa, manda
   * sobre `per100`.
   */
  basisLabel?: string | null
}

// Mismos textos que el componente web (que también los mantiene internos: las claves `spark*` de
// `QUICK_EDIT_COPY` viven en la capa de quick-edit y no se importan desde acá — límite de capas).
const COPY = {
  noMacros: 'Sin macros registrados',
  per100: 'por 100 g',
  fiber: (grams: string) => `Fibra ${grams} g`,
  pctOfTarget: (pct: number) => `${pct}% de la meta`,
  macros: (protein: string, carbs: string, fats: string) =>
    `P ${protein} g · C ${carbs} g · G ${fats} g`,
  aria: (protein: string, carbs: string, fats: string) =>
    `Macros: proteína ${protein} g, carbohidratos ${carbs} g, grasas ${fats} g`,
  ariaNoMacros: 'Macros: sin macros registrados',
} as const

/**
 * Gramos: entero desde 10 g (la precisión decimal ahí es ruido) y un decimal debajo, donde 0,8 g de
 * grasa sí cambia la lectura. Sin ceros de relleno: 8 g se lee «8», no «8.0». Copia exacta del
 * formateador del componente web —cuatro líneas de presentación, no gramática: si alguna vez hay
 * un tercer consumidor, se muda a `packages/nutrition-v2/macro-spark.ts` junto a las shares.
 */
function fmtGrams(value: number | null | undefined): string {
  const safe = Math.max(0, value ?? 0)
  const rounded = safe < 10 ? Math.round(safe * 10) / 10 : Math.round(safe)
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/* ------------------------------------------------------------------------------------------------
 * Un solo popover abierto a la vez. Coordinación module-level (no contexto), igual que en web: los
 * sparks viven en árboles que no comparten provider —filas del canvas, header de franja, buscador,
 * PublishBar— y el contrato «abrir B cierra A» tiene que valer entre todos ellos. En RN el `Modal`
 * ya hace que un tap sobre otro spark caiga en el backdrop (y cierre), así que esto cubre las
 * aperturas PROGRAMÁTICAS y deja el invariante explícito en vez de derivado del overlay.
 * ---------------------------------------------------------------------------------------------- */
let activeSparkId: string | null = null
let activeSparkClose: (() => void) | null = null

function claimActiveSpark(id: string, close: () => void): void {
  // El cierre del anterior corre PRIMERO (se libera a sí mismo) y recién ahí se registra el nuevo.
  if (activeSparkId !== null && activeSparkId !== id) activeSparkClose?.()
  activeSparkId = id
  activeSparkClose = close
}

function releaseActiveSpark(id: string): void {
  if (activeSparkId !== id) return
  activeSparkId = null
  activeSparkClose = null
}

/**
 * Ventana máxima de espera de `measureInWindow` antes de abrir IGUAL (mismo valor y misma razón que
 * `session-morph.tsx`, QA5): en MIUI/HyperOS el callback nativo a veces NO dispara nunca y el tap
 * quedaría MUERTO. Acá eso significaría gramos inaccesibles —regresión bloqueante—, así que al
 * vencer la ventana el panel se abre igual sobre un ancla sintética al centro de la pantalla. Una
 * medición tardía se ignora (garantía de `resolveOrFallback`).
 */
const MEASURE_TIMEOUT_MS = 120

function centeredFallbackAnchor(): AnchorRect {
  const { width, height } = Dimensions.get('window')
  return { x: width / 2, y: height / 2, width: 0, height: 0 }
}

/* ---- Tipografía del panel: mono tabular para las cifras, UI para el texto de base (espejo del
 *      `font-mono text-[11px]` / `text-[10px]` de la web). ------------------------------------- */
const PANEL_MONO_PX = TYPE_SCALE['3xs'] // 11
const PANEL_BASIS_PX = 10

function panelMono(family: string): TextStyle {
  return {
    fontFamily: family,
    fontSize: PANEL_MONO_PX,
    lineHeight: Math.round(PANEL_MONO_PX * LINE_HEIGHT.normal),
    fontVariant: ['tabular-nums', 'lining-nums'],
  }
}

const MACROS_STYLE = panelMono(FONT.monoSemibold)
const DETAIL_STYLE = panelMono(FONT.mono)
const NO_MACROS_STYLE: TextStyle = {
  fontFamily: FONT.uiSemibold,
  fontSize: PANEL_MONO_PX,
  lineHeight: Math.round(PANEL_MONO_PX * LINE_HEIGHT.normal),
}
const BASIS_STYLE: TextStyle = {
  fontFamily: FONT.ui,
  fontSize: PANEL_BASIS_PX,
  lineHeight: Math.round(PANEL_BASIS_PX * LINE_HEIGHT.normal),
}

/**
 * Hit-area del trigger ≥44 px aunque la barra mida 38×5 (SPEC D3 · a11y). Va por `hitSlop` y no por
 * padding/min-height a propósito: no corre el layout de la fila y —clave acá— NO infla el rect
 * medido, así el panel queda pegado a la barra y no a una caja invisible.
 */
const HIT_SLOP = { top: 16, bottom: 16, left: 12, right: 12 } as const

/** Ancho máximo del panel (espejo de `max-w-60` de la web). */
const PANEL_MAX_WIDTH = 240

export function MacroSparkPopover({
  calories,
  proteinG,
  carbsG,
  fatsG,
  size = 'md',
  hideUnit = false,
  className,
  fiberG,
  targetCalories,
  ariaContext,
  per100 = false,
  basisLabel = null,
}: MacroSparkPopoverProps) {
  const { ref, rect, setRect } = useAnchor()
  const [open, setOpen] = useState(false)
  const instanceId = useId()

  const close = useCallback(() => {
    setOpen(false)
    setRect(null)
    releaseActiveSpark(instanceId)
  }, [instanceId, setRect])

  // Al desmontar (fila borrada, franja contraída, lista reciclada) el slot activo se libera.
  useEffect(() => () => releaseActiveSpark(instanceId), [instanceId])

  const openPopover = useCallback(() => {
    claimActiveSpark(instanceId, close)
    const resolve = resolveOrFallback<AnchorRect | null>(
      (measured) => {
        setRect(measured ?? centeredFallbackAnchor())
        setOpen(true)
      },
      null,
      MEASURE_TIMEOUT_MS,
    )
    ref.current?.measureInWindow((x, y, width, height) => {
      // Un rect degenerado (View colapsada por Android) vale lo mismo que no haber medido.
      resolve(width > 0 && height > 0 ? { x, y, width, height } : null)
    })
  }, [instanceId, close, ref, setRect])

  const hasMacros =
    Math.max(0, proteinG ?? 0) + Math.max(0, carbsG ?? 0) + Math.max(0, fatsG ?? 0) > 0
  const protein = fmtGrams(proteinG)
  const carbs = fmtGrams(carbsG)
  const fats = fmtGrams(fatsG)

  // `basisLabel` explícito manda sobre `per100` (ver comentario del tipo, NUT-001).
  const basisText = basisLabel ?? (per100 ? COPY.per100 : null)

  const accessibilityLabel = [
    hasMacros ? COPY.aria(protein, carbs, fats) : COPY.ariaNoMacros,
    ariaContext,
    basisText,
  ]
    .filter(Boolean)
    .join(' — ')

  const pctOfTarget =
    targetCalories != null && targetCalories > 0
      ? Math.round((Math.max(0, calories) / targetCalories) * 100)
      : null

  return (
    <>
      <Pressable
        ref={ref}
        // Android colapsa Views sin pintura propia y `measureInWindow` devolvería 0 (gotcha del
        // hero/day-cards): el trigger tiene que sobrevivir como nodo real para poder medirse.
        collapsable={false}
        onPress={openPopover}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open }}
        // `className` estático a secas: `style` como FUNCIÓN en un Pressable hace que css-interop
        // descarte el prop y el elemento pierda TODO el estilo (regla de apps/mobile/AGENTS.md).
        className={className}
      >
        <MacroSpark
          calories={calories}
          proteinG={proteinG}
          carbsG={carbsG}
          fatsG={fatsG}
          size={size}
          hideUnit={hideUnit}
        />
      </Pressable>

      <AnchoredPopup
        visible={open}
        anchor={rect}
        onClose={close}
        align="end"
        preferredSide="top"
        sideOffset={6}
        // El panel se ciñe a su contenido (el default de 176 px del motor es para menús).
        minWidth={0}
        showArrow
      >
        <View className="gap-0.5 px-2.5 py-2" style={{ maxWidth: PANEL_MAX_WIDTH }}>
          {hasMacros ? (
            <Text className="text-strong" style={MACROS_STYLE}>
              {COPY.macros(protein, carbs, fats)}
            </Text>
          ) : (
            <Text className="text-muted" style={NO_MACROS_STYLE}>
              {COPY.noMacros}
            </Text>
          )}

          {fiberG != null ? (
            <Text className="text-body" style={DETAIL_STYLE}>
              {COPY.fiber(fmtGrams(fiberG))}
            </Text>
          ) : null}

          {pctOfTarget != null ? (
            <Text className="text-muted" style={DETAIL_STYLE}>
              {COPY.pctOfTarget(pctOfTarget)}
            </Text>
          ) : null}

          {basisText ? (
            <Text className="text-subtle" style={BASIS_STYLE}>
              {basisText}
            </Text>
          ) : null}
        </View>
      </AnchoredPopup>
    </>
  )
}
