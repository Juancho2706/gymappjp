import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * EVA Tag — selectable filter chip (muscle groups, meal types, training focus).
 *
 * Outlined when unselected, fills with the `tone` color when `selected`.
 * Designed to live in a flex/gap row. Mirrors the design-source contract
 * (`docs/design-source/components/core/Tag.{prompt.md,jsx}`).
 */
const tagVariants = cva(
  // Base: pill chip, UI font, 13px / 600, 34px tall, 1.5px border, token-driven transition.
  "inline-flex shrink-0 items-center justify-center gap-1.5 h-[34px] px-3.5 rounded-pill border-[1.5px] font-ui text-[13px] font-semibold leading-none whitespace-nowrap select-none outline-none [transition:all_var(--dur-fast)_var(--ease-out)] [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      tone: {
        sport: "",
        ember: "",
        aqua: "",
        neutral: "",
      },
      selected: {
        true: "border-transparent",
        false: "bg-surface-card text-text-body border-border-default",
      },
    },
    compoundVariants: [
      // Selected fills with the tone color. Sport is the white-label ramp, so it uses the
      // contrast-safe `--text-on-sport`; fixed tones use white per the design source.
      { tone: "sport", selected: true, class: "bg-sport-500 text-[var(--text-on-sport)]" },
      { tone: "ember", selected: true, class: "bg-ember-500 text-white" },
      { tone: "aqua", selected: true, class: "bg-aqua-500 text-white" },
      { tone: "neutral", selected: true, class: "bg-[var(--ink-900)] text-white" },
    ],
    defaultVariants: {
      tone: "sport",
      selected: false,
    },
  }
)

export interface TagProps
  extends Omit<React.ComponentProps<"button">, "color">,
    VariantProps<typeof tagVariants> {
  /** Tone color used when selected. @default 'sport' */
  tone?: "sport" | "ember" | "aqua" | "neutral"
  /** Whether the chip is in its filled/active state. @default false */
  selected?: boolean
  /** Optional leading icon (rendered in a 14px slot). */
  icon?: React.ReactNode
}

function Tag({
  className,
  tone = "sport",
  selected = false,
  icon,
  type = "button",
  onClick,
  children,
  ...props
}: TagProps) {
  const interactive = !!onClick

  return (
    <button
      type={type}
      data-slot="tag"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        tagVariants({ tone, selected }),
        interactive ? "cursor-pointer" : "cursor-default",
        // Hover only firms up the outline of unselected, interactive chips.
        interactive && !selected && "hover:border-[var(--border-strong)]",
        className
      )}
      {...props}
    >
      {icon && (
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center">
          {icon}
        </span>
      )}
      {children}
    </button>
  )
}

export { Tag, tagVariants }
