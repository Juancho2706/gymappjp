import * as React from "react"

import { cn } from "@/lib/utils"

type CardVariant = "default" | "inverse" | "sport" | "outline" | "sunken"
type CardPadding = "none" | "sm" | "md" | "lg"

/**
 * EVA DS surface tokens per Card variant (TOKENS.md).
 * Light/dark flip automatically via the semantic vars redefined under `.dark`.
 * Clean utilities (`bg-surface-card`, `bg-sport-500`, `shadow-sm/md`) are used
 * where they exist; `[var(--token)]` references the same DS aliases otherwise.
 */
const cardVariants: Record<CardVariant, string> = {
  default:
    "bg-surface-card text-[var(--text-body)] border border-[var(--border-subtle)] shadow-sm",
  inverse:
    "bg-[var(--surface-inverse)] text-[var(--text-on-dark)] border border-[var(--border-inverse)] shadow-md",
  sport:
    "bg-sport-500 text-[var(--text-on-sport)] border border-transparent shadow-sm",
  outline:
    "bg-transparent text-[var(--text-body)] border border-[var(--border-default)] shadow-none",
  sunken:
    "bg-surface-sunken text-[var(--text-body)] border border-transparent shadow-none",
}

// Design pads: none 0 · sm 12 · md 16 · lg 20.
const cardPadding: Record<CardPadding, string> = {
  none: "p-0",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
}

function Card({
  className,
  size = "default",
  variant = "default",
  padding,
  interactive = false,
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm"
  variant?: CardVariant
  padding?: CardPadding
  interactive?: boolean
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-variant={variant}
      className={cn(
        "group/card flex flex-col gap-4 overflow-hidden rounded-card text-sm data-[size=sm]:gap-3",
        cardVariants[variant],
        // `padding` set → uniform DS padding (standalone surface, matches design).
        // Omitted → legacy compound model: vertical here, horizontal via
        // CardHeader/CardContent/CardFooter (keeps existing consumers intact).
        padding
          ? cardPadding[padding]
          : "py-4 data-[size=sm]:py-3 has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:has-data-[slot=card-footer]:pb-0",
        "*:[img:first-child]:rounded-t-card *:[img:last-child]:rounded-b-card",
        interactive &&
          "cursor-pointer transition-[box-shadow,transform] duration-[140ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px hover:shadow-md",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-card px-4 group-data-[size=sm]/card:px-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "text-base leading-snug font-semibold group-data-[size=sm]/card:text-sm",
        // Strong title color on light-surface variants; inverse/sport inherit the
        // card's on-dark/white foreground so titles stay legible.
        "group-data-[variant=default]/card:text-[var(--text-strong)] group-data-[variant=outline]/card:text-[var(--text-strong)] group-data-[variant=sunken]/card:text-[var(--text-strong)]",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-[var(--text-muted)]", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-4 group-data-[size=sm]/card:px-3", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-card border-t bg-surface-sunken/50 p-4 group-data-[size=sm]/card:p-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
