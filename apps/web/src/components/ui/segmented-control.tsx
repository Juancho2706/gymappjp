"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * EVA SegmentedControl — iOS-style single-select segmented tabs.
 * The active segment lifts on a white card pill. Best for 2–4 short options.
 *
 * API mirrors the design source (`SegmentedControl.prompt.md`) so the web and
 * mobile (NativeWind) implementations stay in parity:
 *   <SegmentedControl options={['Hoy','Semana','Mes']} value={range} onChange={setRange} />
 */
export type SegmentedControlOption =
  | string
  | { value: string; label: React.ReactNode }

export interface SegmentedControlProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** `[{ value, label }]` or `['string', …]` (a bare string is both value and label). */
  options: SegmentedControlOption[]
  /** Currently selected option value. */
  value: string
  /** Fired with the newly selected option value. */
  onChange?: (value: string) => void
  /** Control height/typography. `sm` = 34px, `md` = 42px. */
  size?: "sm" | "md"
}

function SegmentedControl({
  options,
  value,
  onChange,
  size = "md",
  className,
  ...rest
}: SegmentedControlProps) {
  const norm = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o
  )

  return (
    <div
      role="radiogroup"
      data-slot="segmented-control"
      className={cn(
        "flex w-full gap-0.5 rounded-control bg-surface-sunken p-[3px]",
        className
      )}
      {...rest}
    >
      {norm.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-active={active ? "" : undefined}
            onClick={() => onChange?.(o.value)}
            className={cn(
              "flex-1 cursor-pointer select-none border-0 font-ui whitespace-nowrap",
              "rounded-[calc(var(--radius-control)-3px)]",
              "transition-all duration-[var(--dur-fast)] ease-[var(--ease-out)]",
              "[-webkit-tap-highlight-color:transparent]",
              "outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
              size === "sm" ? "h-[34px] text-[13px]" : "h-[42px] text-sm",
              active
                ? "bg-surface-card font-bold text-strong shadow-[var(--shadow-sm)]"
                : "bg-transparent font-semibold text-muted"
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export { SegmentedControl }
