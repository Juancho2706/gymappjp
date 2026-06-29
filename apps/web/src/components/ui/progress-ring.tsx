import * as React from "react"

import { cn } from "@/lib/utils"

export interface ProgressRingProps
  extends Omit<React.ComponentProps<"div">, "color"> {
  /** Progress value, 0..100 (clamped). */
  value?: number
  /** Outer diameter in px. */
  size?: number
  /** Ring stroke width in px. */
  stroke?: number
  /** Progress stroke color — defaults to the sport (brand) ramp. */
  color?: string
  /** Track (remaining) color. */
  track?: string
  /** Custom center content (e.g. "3/5 comidas"). Overrides the default value. */
  label?: React.ReactNode
  /** Show the default "<value>%" center when no `label` is given. */
  showValue?: boolean
}

/**
 * EVA ProgressRing — circular activity-ring for adherence, weekly goal, or
 * macro completion.
 *
 * Renders a track + progress arc as SVG. The arc animates with a spring on
 * value change (CSS transition on `stroke-dashoffset`). Pass `label` for
 * custom center content, otherwise the rounded value renders as "NN%".
 *
 * Colors flow through DS tokens (`--sport-500`, `--track`, `--text-strong`)
 * so the ring inherits per-coach white-label brand and dark mode for free.
 */
export function ProgressRing({
  value = 0,
  size = 72,
  stroke = 8,
  color = "var(--sport-500)",
  track = "var(--track)",
  label,
  showValue = true,
  className,
  style,
  ...rest
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, value))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - clamped / 100)

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size, ...style }}
      {...rest}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={track}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset var(--dur-slow) var(--ease-spring)",
          }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {label != null
          ? label
          : showValue && (
              <span
                className="font-display text-strong leading-none font-black tabular-nums tracking-[-0.03em]"
                style={{ fontSize: size * 0.26 }}
              >
                {Math.round(clamped)}
                <span style={{ fontSize: size * 0.13 }}>%</span>
              </span>
            )}
      </div>
    </div>
  )
}
