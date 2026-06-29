'use client'

import { motion, useReducedMotion, type Transition } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * Plate-method (MINSAL / "Plato del Bien Comer") proportional visual.
 *
 * Renders a circle split into three wedges — verduras, proteína, carbohidrato —
 * from a {veg, protein, carb} proportion prop (each 0..1, summing ~1). This is a
 * PROPORTIONAL guide (how the plate should be divided), NOT an absolute "goal met"
 * indicator: it never uses the success/adherence green and its copy talks about
 * "proporción del plato", never compliance.
 *
 * Color is never the only channel: each segment has hue + position + a text
 * legend (label + percentage). The SVG carries `role="img"` + a full-phrase
 * `aria-label`; the visible legend below is the accessible text fallback.
 */
export interface PlateProportion {
  /** Vegetables share of the plate, 0..1. */
  veg: number
  /** Protein share of the plate, 0..1. */
  protein: number
  /** Carbohydrate share of the plate, 0..1. */
  carb: number
}

export interface ProportionPlateProps {
  proportion: PlateProportion
  /** Override the default Spanish (latam) labels, e.g. for i18n. */
  labels?: Partial<Record<PlateSegmentKey, string>>
  /** Pixel diameter of the plate. */
  size?: number
  /** Show the text legend below the plate (default true; always rendered for a11y). */
  showLegend?: boolean
  className?: string
}

export type PlateSegmentKey = 'veg' | 'protein' | 'carb'

interface SegmentMeta {
  label: string
  /** CSS color — a canonical `var(--color-macro-*)` reference. */
  color: string
}

/**
 * Plate segment hues (EVA redesign). Vegetables keep a vegetal green that is
 * NOT the success/adherence green; protein + carb follow the design's macro
 * triad so the plate stays consistent with the rings/bars:
 * - veg     → vegetal green (`--color-macro-fats`, never success-green)
 * - protein → ember (nutrition accent)
 * - carb    → sport (brand blue)
 */
const SEGMENT_META: Record<PlateSegmentKey, SegmentMeta> = {
  veg: { label: 'Verduras', color: 'var(--color-macro-fats)' },
  protein: { label: 'Proteína', color: 'var(--ember-500)' },
  carb: { label: 'Carbohidrato', color: 'var(--sport-500)' },
}

const SEGMENT_ORDER: PlateSegmentKey[] = ['veg', 'protein', 'carb']

/** Normalize the three shares to sum to 1 (defensive against drift / 0-sum). */
function normalize(p: PlateProportion): Record<PlateSegmentKey, number> {
  const veg = Math.max(0, p.veg)
  const protein = Math.max(0, p.protein)
  const carb = Math.max(0, p.carb)
  const sum = veg + protein + carb
  if (sum <= 0) return { veg: 0, protein: 0, carb: 0 }
  return { veg: veg / sum, protein: protein / sum, carb: carb / sum }
}

const pct = (v: number) => Math.round(v * 100)

/** Accessible full-phrase label for the whole plate. Exported for tests. */
export function plateAriaLabel(
  shares: Record<PlateSegmentKey, number>,
  labels: Record<PlateSegmentKey, string>
): string {
  const parts = SEGMENT_ORDER.filter((k) => shares[k] > 0).map(
    (k) => `${labels[k]} ${pct(shares[k])} por ciento`
  )
  if (parts.length === 0) {
    return 'Plato del Bien Comer: sin proporción definida'
  }
  return `Proporción sugerida del plato (método del plato): ${parts.join(
    ', '
  )}. Es una guía de cómo dividir el plato, no una meta cumplida.`
}

/** Point on the unit circle at `turns` (0..1, clockwise from top). */
function pointAt(turns: number, cx: number, cy: number, r: number): [number, number] {
  // start at top (-90deg), go clockwise
  const angle = (turns * 2 * Math.PI) - Math.PI / 2
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
}

/** SVG arc path for a wedge from `start` to `end` (in turns). */
function wedgePath(
  start: number,
  end: number,
  cx: number,
  cy: number,
  r: number
): string {
  // Full circle (single segment === 1): draw two half-arcs to avoid degenerate arc.
  if (end - start >= 1) {
    const [mx, my] = pointAt(0.5, cx, cy, r)
    const [sx, sy] = pointAt(0, cx, cy, r)
    return [
      `M ${cx} ${cy}`,
      `L ${sx} ${sy}`,
      `A ${r} ${r} 0 1 1 ${mx} ${my}`,
      `A ${r} ${r} 0 1 1 ${sx} ${sy}`,
      'Z',
    ].join(' ')
  }
  const [sx, sy] = pointAt(start, cx, cy, r)
  const [ex, ey] = pointAt(end, cx, cy, r)
  const largeArc = end - start > 0.5 ? 1 : 0
  return [
    `M ${cx} ${cy}`,
    `L ${sx} ${sy}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`,
    'Z',
  ].join(' ')
}

export function ProportionPlate({
  proportion,
  labels,
  size = 160,
  showLegend = true,
  className,
}: ProportionPlateProps) {
  const reduce = useReducedMotion()
  const shares = normalize(proportion)

  const resolvedLabels: Record<PlateSegmentKey, string> = {
    veg: labels?.veg ?? SEGMENT_META.veg.label,
    protein: labels?.protein ?? SEGMENT_META.protein.label,
    carb: labels?.carb ?? SEGMENT_META.carb.label,
  }

  const cx = size / 2
  const cy = size / 2
  const r = (size / 2) - 2

  // Build wedges in order, accumulating turns.
  let cursor = 0
  const wedges = SEGMENT_ORDER.map((key) => {
    const share = shares[key]
    const start = cursor
    const end = cursor + share
    cursor = end
    return { key, share, start, end }
  }).filter((w) => w.share > 0)

  const ariaLabel = plateAriaLabel(shares, resolvedLabels)

  const revealTransition: Transition = reduce
    ? { duration: 0 }
    : { duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <motion.div
        role="img"
        aria-label={ariaLabel}
        style={{ width: size, height: size }}
        className="relative"
        initial={reduce ? false : { opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={revealTransition}
      >
        <svg width={size} height={size} aria-hidden>
          {wedges.map((w) => (
            <path
              key={w.key}
              d={wedgePath(w.start, w.end, cx, cy, r)}
              fill={SEGMENT_META[w.key].color}
            />
          ))}
          {/* divider rim for definition in both themes */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="var(--background)"
            strokeWidth={2}
          />
        </svg>
      </motion.div>

      {showLegend && (
        <ul className="flex flex-col gap-1 text-xs" aria-hidden>
          {SEGMENT_ORDER.map((key) => {
            const share = shares[key]
            if (share <= 0) return null
            return (
              <li key={key} className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: SEGMENT_META[key].color }}
                />
                <span className="font-semibold text-foreground">
                  {resolvedLabels[key]}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {pct(share)}%
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <p className="max-w-[14rem] text-center text-[10px] leading-snug text-muted-foreground/70">
        Proporción sugerida del plato, no una meta cumplida.
      </p>
    </div>
  )
}
