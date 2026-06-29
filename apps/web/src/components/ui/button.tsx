"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// EVA DS Button — semantic tokens only (no hardcoded hex).
// Design source: docs/design-source/components/core/Button.{prompt.md,jsx}
// Solid fill uses var(--cta-fill) (NOT lime — prompt.md is stale on that).
// Public API preserved: every legacy variant/size key still resolves; the
// design's named variants (primary / sport / danger) and size (md) are added.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center bg-clip-padding rounded-control border-[1.5px] font-ui font-bold tracking-[-0.01em] leading-none whitespace-nowrap select-none outline-none transition-[transform,background-color,box-shadow,border-color] duration-150 ease-[cubic-bezier(.22,1,.36,1)] active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-[0.45] disabled:shadow-none aria-invalid:border-[var(--cta-danger)] aria-invalid:ring-[3px] aria-invalid:ring-[color-mix(in_oklab,var(--cta-danger)_30%,transparent)] [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Legacy default — the app's prominent solid action (blue CTA fill).
        default:
          "bg-[var(--cta-fill)] text-[var(--text-on-sport)] border-transparent shadow-[var(--shadow-sm)] hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)]",
        // Design `primary` — solid ink action.
        primary:
          "bg-[var(--action-primary)] text-[var(--text-on-dark)] border-transparent shadow-[var(--shadow-sm)] hover:bg-[var(--action-primary-hover)]",
        // Design `sport` — high-energy hero CTA (blue + glow). One per screen.
        sport:
          "bg-[var(--cta-fill)] text-[var(--text-on-sport)] border-transparent shadow-[var(--glow-sport)] hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)]",
        // Legacy electric — alias of the glowy brand CTA.
        electric:
          "bg-[var(--cta-fill)] text-[var(--text-on-sport)] border-transparent shadow-[var(--glow-sport)] hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)]",
        // Legacy glass — token-aware translucent surface.
        glass:
          "bg-[color-mix(in_oklab,var(--surface-card)_70%,transparent)] backdrop-blur-md text-[var(--text-strong)] border-[var(--border-subtle)] hover:bg-surface-card",
        // Legacy outline — DS bordered control.
        outline:
          "bg-surface-card text-[var(--text-body)] border-[var(--border-default)] hover:bg-surface-sunken hover:text-[var(--text-strong)]",
        // Design `secondary` — outline card.
        secondary:
          "bg-surface-card text-[var(--text-strong)] border-[var(--border-default)] hover:bg-surface-sunken",
        // Design `ghost` — text only.
        ghost:
          "bg-transparent text-[var(--text-strong)] border-transparent hover:bg-surface-sunken",
        // Design `danger` — solid destructive CTA.
        danger:
          "bg-[var(--cta-danger)] text-white border-transparent hover:bg-[color-mix(in_oklab,var(--cta-danger)_90%,#000)]",
        // Legacy destructive — soft destructive tint (kept).
        destructive:
          "bg-[color-mix(in_oklab,var(--cta-danger)_12%,transparent)] text-[var(--cta-danger)] border-transparent shadow-none hover:bg-[color-mix(in_oklab,var(--cta-danger)_20%,transparent)]",
        // Legacy link — text link.
        link: "bg-transparent text-[var(--text-link)] border-transparent shadow-none underline-offset-4 hover:underline",
      },
      size: {
        // Legacy default → design `md` (48px comfortable touch target).
        default:
          "h-12 gap-2 px-[18px] text-[15px] [&_svg:not([class*='size-'])]:size-[18px]",
        sm: "h-9 gap-1.5 px-3.5 text-sm [&_svg:not([class*='size-'])]:size-4",
        md: "h-12 gap-2 px-[18px] text-[15px] [&_svg:not([class*='size-'])]:size-[18px]",
        lg: "h-14 gap-2.5 px-[22px] text-[17px] [&_svg:not([class*='size-'])]:size-5",
        xs: "h-7 gap-1 px-2.5 text-xs rounded-[10px] [&_svg:not([class*='size-'])]:size-3.5",
        icon: "size-12 [&_svg:not([class*='size-'])]:size-[18px]",
        "icon-xs":
          "size-7 rounded-[10px] [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-9 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-14 [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
