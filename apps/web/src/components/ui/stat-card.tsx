import * as React from "react"

import { cn } from "@/lib/utils"

export type StatAccent = "sport" | "ember" | "aqua" | "neutral"

export interface StatCardProps extends React.ComponentProps<"div"> {
  /** Uppercase eyebrow label. */
  label: React.ReactNode
  /** Big tabular metric value. */
  value: React.ReactNode
  /** Optional unit suffix (e.g. "kg", "%"). */
  unit?: React.ReactNode
  /** Signed delta — a leading "+" renders green/up, otherwise red/down. */
  delta?: string | null
  /** Optional accent icon (lucide-react node). Colored by `accent`. */
  icon?: React.ReactNode
  /** Accent ramp for the icon. */
  accent?: StatAccent
  /** Render on a dark/inverse surface (for dark dashboards). */
  inverse?: boolean
}

const accentClasses: Record<StatAccent, string> = {
  sport: "text-sport-500",
  ember: "text-ember-500",
  aqua: "text-aqua-500",
  neutral: "text-[var(--ink-400)]",
}

/**
 * EVA StatCard — labelled metric tile with an uppercase eyebrow label,
 * a big tabular value, an optional unit, and an optional signed delta.
 *
 * The delta sign drives its color (green up / red down). Pass `inverse`
 * to render on a dark dashboard surface.
 */
export function StatCard({
  label,
  value,
  unit,
  delta,
  icon,
  accent = "sport",
  inverse = false,
  className,
  ...props
}: StatCardProps) {
  const deltaUp = typeof delta === "string" && delta.trim().startsWith("+")
  const hasDelta = delta != null && delta !== ""

  const mutedClass = inverse
    ? "text-[var(--text-on-dark-muted)]"
    : "text-[var(--text-muted)]"
  const fgClass = inverse
    ? "text-[var(--text-on-dark)]"
    : "text-[var(--text-strong)]"

  return (
    <div
      data-slot="stat-card"
      className={cn(
        "flex flex-col gap-2 rounded-card border p-4",
        inverse
          ? "border-[var(--border-inverse)] bg-[var(--surface-inverse)] shadow-[var(--shadow-md)]"
          : "border-border-subtle bg-surface-card shadow-[var(--shadow-sm)]",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-[11px] font-bold tracking-[0.08em] uppercase",
            mutedClass
          )}
        >
          {label}
        </span>
        {icon ? (
          <span
            className={cn(
              "inline-flex size-[18px] items-center justify-center [&_svg]:size-[18px]",
              accentClasses[accent] ?? accentClasses.sport
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>

      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "font-display text-[32px] leading-none font-black tracking-[-0.03em] tabular-nums",
            fgClass
          )}
        >
          {value}
        </span>
        {unit ? (
          <span className={cn("text-sm font-semibold", mutedClass)}>{unit}</span>
        ) : null}
      </div>

      {hasDelta ? (
        <div
          className={cn(
            "flex items-center gap-1 text-xs font-bold",
            deltaUp ? "text-[var(--success-500)]" : "text-[var(--danger-500)]"
          )}
        >
          <span className="text-[13px] leading-none" aria-hidden>
            {deltaUp ? "▲" : "▼"}
          </span>
          {delta}
        </div>
      ) : null}
    </div>
  )
}
