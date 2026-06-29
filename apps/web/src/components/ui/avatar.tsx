"use client"

import * as React from "react"
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar"

import { cn } from "@/lib/utils"

/**
 * EVA Avatar — user image or initials fallback (ink fill, sport initials),
 * with optional colored status ring. Restyled to the EVA Design System.
 *
 * Public API preserved: compound usage stays valid
 *   <Avatar size="default"><AvatarFallback>JP</AvatarFallback></Avatar>
 * Flat DS API added (parity with the design source .prompt.md)
 *   <Avatar name="Lucía Romero" size="lg" ring="sport" />
 *   <Avatar src="/photo.jpg" name="Diego" />
 */

type AvatarSize = "xs" | "sm" | "default" | "md" | "lg" | "xl"
type AvatarRing = false | "sport" | "success" | "ember"

// DS sizes (px): xs 24 · sm 32 · md 40 · lg 56 · xl 72. `default` (legacy) === sm (32).
const SIZE_BOX: Record<AvatarSize, string> = {
  xs: "size-6", // 24
  sm: "size-8", // 32
  default: "size-8", // 32 (legacy alias)
  md: "size-10", // 40
  lg: "size-14", // 56
  xl: "size-18", // 72
}

// Initials font size ≈ dim * 0.36 (design source).
const SIZE_FONT: Record<AvatarSize, string> = {
  xs: "text-[9px]", // 24 → 8.64
  sm: "text-[12px]", // 32 → 11.52
  default: "text-[12px]",
  md: "text-[14px]", // 40 → 14.4
  lg: "text-[20px]", // 56 → 20.16
  xl: "text-[26px]", // 72 → 25.92
}

// Status halo fill. success has no `bg-*` color utility → use the CSS var.
const RING_BG: Record<Exclude<AvatarRing, false>, string> = {
  sport: "bg-sport-500",
  success: "bg-[var(--success-500)]",
  ember: "bg-ember-500",
}

const AvatarCtx = React.createContext<{
  size: AvatarSize
  ring: AvatarRing
  square: boolean
}>({ size: "default", ring: false, square: false })

function Avatar({
  className,
  size = "default",
  ring = false,
  square = false,
  name,
  src,
  children,
  ...props
}: AvatarPrimitive.Root.Props & {
  size?: AvatarSize
  ring?: AvatarRing
  square?: boolean
  name?: string
  src?: string
}) {
  const initials = (name ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()

  return (
    <AvatarCtx.Provider value={{ size, ring, square }}>
      <AvatarPrimitive.Root
        data-slot="avatar"
        data-size={size}
        className={cn(
          "group/avatar relative flex shrink-0 select-none",
          square ? "rounded-control" : "rounded-full",
          SIZE_BOX[size],
          // colored status halo: 2px padding + ring color fill
          ring && cn("p-0.5", RING_BG[ring]),
          className
        )}
        {...props}
      >
        {children ?? (
          <>
            {src ? <AvatarImage src={src} alt={name ?? ""} /> : null}
            <AvatarFallback>{initials || "?"}</AvatarFallback>
          </>
        )}
      </AvatarPrimitive.Root>
    </AvatarCtx.Provider>
  )
}

function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props) {
  const { ring, square } = React.useContext(AvatarCtx)
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn(
        "aspect-square size-full overflow-hidden object-cover",
        square ? "rounded-control" : "rounded-full",
        // white separator between halo and image
        ring && "border-2 border-[var(--surface-card)]",
        className
      )}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: AvatarPrimitive.Fallback.Props) {
  const { ring, square, size } = React.useContext(AvatarCtx)
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center overflow-hidden",
        // ink fill + sport initials (DS)
        "bg-[var(--surface-inverse)] text-sport-400 font-display font-extrabold tracking-[-0.02em]",
        square ? "rounded-control" : "rounded-full",
        SIZE_FONT[size],
        // white separator between halo and content
        ring && "border-2 border-[var(--surface-card)]",
        className
      )}
      {...props}
    />
  )
}

function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground bg-blend-color ring-2 ring-background select-none",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=md]/avatar:size-2.5 group-data-[size=md]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
        "group-data-[size=xl]/avatar:size-3.5 group-data-[size=xl]/avatar:[&>svg]:size-2.5",
        className
      )}
      {...props}
    />
  )
}

function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
        className
      )}
      {...props}
    />
  )
}

function AvatarGroupCount({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-text-muted font-display font-extrabold text-[12px] tracking-[-0.02em] ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-14 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
}
