import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * EVA Badge — compact status / category label (EVA Design System).
 *
 * Design API: `tone` (8 tones) × `variant` (soft | solid | outline) × `size` (sm | md),
 * plus `dot` and `icon`. Colors are driven off DS semantic CSS vars (via static
 * arbitrary-value classes), so dark mode flips automatically and a `className`
 * color override from a call site still wins through tailwind-merge.
 *
 * Backward-compatible: the pre-existing `variant` values
 * (`default | secondary | destructive | outline | ghost | link`) still work and map
 * onto the tone system, so existing call sites keep compiling and overriding.
 */

type BadgeTone =
  | "neutral"
  | "sport"
  | "ember"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "aqua"

// Design variants + legacy variants (preserved for the rest of the app).
type BadgeVariant =
  | "soft"
  | "solid"
  | "outline"
  // legacy aliases — kept so existing imports don't break
  | "default"
  | "secondary"
  | "destructive"
  | "ghost"
  | "link"

type ResolvedVariant = "soft" | "solid" | "outline" | "ghost" | "link"

// Static, literal class strings so Tailwind's JIT can see them. soft/outline foregrounds
// mirror the design reference (-700/-600 tints that lighten under .dark). Solid bg/fg are
// token-contract-correct for contrast: sport uses the dark-safe --cta-fill (its -600 lightens
// in dark), and light tones (ember/success/warning/aqua) get ink text via --text-on-*.
const TONE_CLASSES: Record<BadgeTone, Record<"soft" | "solid" | "outline", string>> = {
  neutral: {
    soft: "bg-[var(--ink-100)] text-[var(--ink-700)] border-transparent",
    solid: "bg-[var(--ink-600)] text-[var(--white)] border-transparent",
    outline: "bg-transparent text-[var(--ink-700)] border-current",
  },
  sport: {
    soft: "bg-[var(--sport-100)] text-[var(--sport-700)] border-transparent",
    solid: "bg-[var(--cta-fill)] text-[var(--text-on-sport)] border-transparent",
    outline: "bg-transparent text-[var(--sport-700)] border-current",
  },
  ember: {
    soft: "bg-[var(--ember-100)] text-[var(--ember-700)] border-transparent",
    solid: "bg-[var(--ember-500)] text-[var(--text-on-ember)] border-transparent",
    outline: "bg-transparent text-[var(--ember-700)] border-current",
  },
  success: {
    soft: "bg-[var(--success-100)] text-[var(--success-600)] border-transparent",
    solid: "bg-[var(--success-500)] text-[var(--text-on-success)] border-transparent",
    outline: "bg-transparent text-[var(--success-600)] border-current",
  },
  warning: {
    soft: "bg-[var(--warning-100)] text-[var(--warning-700)] border-transparent",
    solid: "bg-[var(--warning-500)] text-[var(--text-on-warning)] border-transparent",
    outline: "bg-transparent text-[var(--warning-700)] border-current",
  },
  danger: {
    soft: "bg-[var(--danger-100)] text-[var(--danger-600)] border-transparent",
    solid: "bg-[var(--danger-500)] text-[var(--white)] border-transparent",
    outline: "bg-transparent text-[var(--danger-600)] border-current",
  },
  info: {
    soft: "bg-[var(--info-100)] text-[var(--info-600)] border-transparent",
    solid: "bg-[var(--info-500)] text-[var(--white)] border-transparent",
    outline: "bg-transparent text-[var(--info-600)] border-current",
  },
  aqua: {
    soft: "bg-[var(--aqua-100)] text-[var(--aqua-700)] border-transparent",
    solid: "bg-[var(--aqua-500)] text-[var(--ink-950)] border-transparent",
    outline: "bg-transparent text-[var(--aqua-700)] border-current",
  },
}

// Vivid ramp var used for the status dot in soft/outline (solid uses currentColor).
const TONE_DOT: Record<BadgeTone, string> = {
  neutral: "--ink-600",
  sport: "--sport-600",
  ember: "--ember-500",
  success: "--success-500",
  warning: "--warning-500",
  danger: "--danger-500",
  info: "--info-500",
  aqua: "--aqua-500",
}

const GHOST_CLASSES =
  "bg-transparent border-transparent text-[var(--text-body)] hover:bg-[var(--surface-sunken)]"
const LINK_CLASSES =
  "bg-transparent border-transparent text-[var(--text-link)] underline-offset-4 hover:underline"

const LEGACY_TONE: Partial<Record<BadgeVariant, BadgeTone>> = {
  default: "sport",
  secondary: "neutral",
  destructive: "danger",
}

function resolveBadge(
  tone: BadgeTone | undefined,
  variant: BadgeVariant
): { tone: BadgeTone; variant: ResolvedVariant } {
  // Legacy soft aliases → tone + soft
  if (variant === "default" || variant === "secondary" || variant === "destructive") {
    return { tone: tone ?? LEGACY_TONE[variant]!, variant: "soft" }
  }
  if (variant === "solid" || variant === "outline" || variant === "ghost" || variant === "link") {
    return { tone: tone ?? "neutral", variant }
  }
  return { tone: tone ?? "neutral", variant: "soft" }
}

function variantClasses(tone: BadgeTone, variant: ResolvedVariant): string {
  if (variant === "ghost") return GHOST_CLASSES
  if (variant === "link") return LINK_CLASSES
  return TONE_CLASSES[tone][variant]
}

const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center overflow-hidden rounded-pill border border-transparent font-ui font-bold tracking-[0.01em] whitespace-nowrap transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--focus-ring)] [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      size: {
        sm: "h-5 gap-1 px-2 text-[11px]",
        md: "h-6 gap-1.5 px-2.5 text-[12px]",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
)

type BadgeProps = useRender.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    /** Color/category tone. Default `neutral`. `sport` = training, `ember` = nutrition. */
    tone?: BadgeTone
    /**
     * Visual style. Design: `soft` (default) | `solid` | `outline`.
     * Legacy aliases (`default | secondary | destructive | ghost | link`) are kept for compat.
     */
    variant?: BadgeVariant
    /** Leading status dot. */
    dot?: boolean
    /** Leading icon node (e.g. a lucide icon element). */
    icon?: React.ReactNode
  }

function Badge({
  className,
  variant = "default",
  tone,
  size = "md",
  dot = false,
  icon,
  children,
  render,
  ...props
}: BadgeProps) {
  const resolved = resolveBadge(tone, variant)
  const sm = size === "sm"

  const content = (
    <>
      {dot && (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{
            background:
              resolved.variant === "solid" ? "currentColor" : `var(${TONE_DOT[resolved.tone]})`,
          }}
        />
      )}
      {icon && (
        <span
          aria-hidden
          className={cn(
            "inline-flex shrink-0 items-center justify-center [&_svg]:size-full",
            sm ? "size-3" : "size-3.5"
          )}
        >
          {icon}
        </span>
      )}
      {children}
    </>
  )

  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(
          badgeVariants({ size }),
          variantClasses(resolved.tone, resolved.variant),
          className
        ),
        children: content,
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      tone: resolved.tone,
      variant: resolved.variant,
      size,
    },
  })
}

export { Badge, badgeVariants }
export type { BadgeProps, BadgeTone, BadgeVariant }
