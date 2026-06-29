import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * EVA IconButton — square, icon-only tappable control for toolbars,
 * headers, and list rows. Faithful to the EVA Design System (Fase 1).
 *
 * Variants: `soft` (default, sunken fill) · `ghost` · `solid` (ink) · `sport`.
 * Sizes: `sm` 36px · `md` 44px (iOS touch target) · `lg` 52px.
 * Always pass `aria-label` (icon-only control).
 */
const iconButtonVariants = cva(
  // Layout + shared behavior. Press scale 0.92, focus-visible ring, disabled,
  // transition: transform (instant) + background/color (fast), all eased.
  "inline-flex shrink-0 items-center justify-center rounded-control border-[1.5px] border-transparent cursor-pointer select-none outline-none [-webkit-tap-highlight-color:transparent] active:scale-[0.92] focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-[0.45] [transition:transform_var(--dur-instant)_var(--ease-out),background-color_var(--dur-fast)_var(--ease-out),color_var(--dur-fast)_var(--ease-out)] [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        soft: "bg-surface-sunken text-[var(--ink-800)]",
        ghost: "bg-transparent text-[var(--ink-700)]",
        solid: "bg-[var(--action-primary)] text-[var(--text-on-dark)]",
        sport: "bg-sport-500 text-[var(--text-on-sport)]",
      },
      size: {
        sm: "size-9 [&_svg]:size-[18px]", // 36px / icon 18
        md: "size-11 [&_svg]:size-5", // 44px / icon 20
        lg: "size-13 [&_svg]:size-6", // 52px / icon 24
      },
    },
    defaultVariants: {
      variant: "soft",
      size: "md",
    },
  }
)

interface IconButtonProps
  extends Omit<React.ComponentProps<"button">, "aria-label">,
    VariantProps<typeof iconButtonVariants> {
  /** Icon node (e.g. a `lucide-react` icon). Sized automatically per `size`. */
  icon: React.ReactNode
  /** Required — icon-only control needs an accessible name. */
  "aria-label": string
}

function IconButton({
  className,
  variant = "soft",
  size = "md",
  icon,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      data-slot="icon-button"
      type={type}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    >
      {icon}
    </button>
  )
}

export { IconButton, iconButtonVariants }
export type { IconButtonProps }
