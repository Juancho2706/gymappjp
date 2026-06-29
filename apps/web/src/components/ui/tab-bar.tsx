import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * EVA TabBar — the official bottom navigation.
 *
 * Default look is the **floating capsule** (iOS-26 style): a translucent,
 * frosted pill that hovers just above content near the bottom of the screen,
 * with a brand-tinted sliding indicator (`var(--sport-*)`) that glides behind
 * the active tab. The active glyph fills with the brand color; inactive glyphs
 * stay outlined. Active text/icon go `--sport-600`, inactive `--ink-400`.
 *
 * Positioning: the floating bar is `position:absolute`, pinned `bottom:24` and
 * inset `14px` from its nearest positioned ancestor — drop it inside a
 * `position:relative`, height-constrained screen frame (a phone surface) and
 * reserve ~96px of bottom scroll padding so content clears it.
 *
 * `minimized` collapses it to an icon-only pill (labels fade, insets pull in to
 * `72px`) — drive it from scroll for hide-on-scroll-down / reveal-on-scroll-up.
 *
 * `floating={false}` is the legacy docked bar that sits in normal flow at the
 * bottom of a column (translucent, top border, same sliding pill).
 *
 * Icon-agnostic: pass any node as `item.icon` (lucide-react node or SVG). Colors
 * flow through DS tokens so the bar inherits per-coach white-label brand and
 * dark mode for free.
 */

export interface TabBarItem {
  /** Stable identifier compared against `value`. */
  value: string
  /** Short label rendered under the glyph. */
  label: React.ReactNode
  /** Icon node (lucide-react / SVG). Rendered in a 24px slot. */
  icon?: React.ReactNode
}

export interface TabBarProps
  extends Omit<React.ComponentProps<"nav">, "onChange"> {
  /** Tabs to render, left to right. */
  items?: TabBarItem[]
  /** Currently active tab `value`. */
  value?: string
  /** Fired with the selected tab `value` on press. */
  onChange?: (value: string) => void
  /** Floating frosted capsule (official default). `false` = legacy docked bar. */
  floating?: boolean
  /** Collapse to an icon-only pill (hide-on-scroll). Floating only. */
  minimized?: boolean
}

// Shared press feedback (scale on tap) + active-glyph fill, expressed as
// utility classes so they survive SSR and honour reduced-motion.
const pressClass =
  "[-webkit-tap-highlight-color:transparent] active:scale-[0.96] motion-reduce:active:scale-100 motion-reduce:[transition:none]"
const activeIcoClass = "[&_svg]:fill-current [&_svg]:[fill-opacity:0.18]"

export function TabBar({
  items = [],
  value,
  onChange,
  floating = true,
  minimized = false,
  className,
  style,
  ...rest
}: TabBarProps) {
  const n = items.length || 1
  const idx = items.findIndex((it) => it.value === value)
  const activeIndex = idx < 0 ? 0 : idx

  if (floating) {
    return (
      <nav
        className={className}
        style={{
          position: "absolute",
          left: minimized ? 72 : 14,
          right: minimized ? 72 : 14,
          bottom: 24,
          zIndex: 45,
          display: "flex",
          alignItems: "stretch",
          padding: 8,
          borderRadius: 30,
          background: "color-mix(in srgb, var(--surface-card) 74%, transparent)",
          backdropFilter: "saturate(180%) blur(26px)",
          WebkitBackdropFilter: "saturate(180%) blur(26px)",
          border:
            "1px solid color-mix(in srgb, var(--text-strong) 9%, transparent)",
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.45) inset, 0 14px 36px rgba(13,18,28,0.24), 0 4px 12px rgba(13,18,28,0.12)",
          transition:
            "left var(--dur-slow) var(--ease-spring), right var(--dur-slow) var(--ease-spring)",
          ...style,
        }}
        {...rest}
      >
        {/* brand-tinted sliding indicator */}
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 8,
            bottom: 8,
            left: `calc(8px + ${activeIndex} * ((100% - 16px) / ${n}))`,
            width: `calc((100% - 16px) / ${n})`,
            borderRadius: 22,
            background: "color-mix(in srgb, var(--sport-500) 15%, transparent)",
            border:
              "1px solid color-mix(in srgb, var(--sport-500) 24%, transparent)",
            transition: "left var(--dur-slow) var(--ease-spring)",
            pointerEvents: "none",
            zIndex: 0,
            opacity: idx < 0 ? 0 : 1,
          }}
        />
        {items.map((it) => {
          const active = it.value === value
          return (
            <button
              key={it.value}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onChange?.(it.value)}
              className={cn(
                pressClass,
                "[transition:transform_var(--dur-fast)_var(--ease-out),color_var(--dur-base)_var(--ease-out),padding_var(--dur-base)_var(--ease-out)]"
              )}
              style={{
                position: "relative",
                zIndex: 1,
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: minimized ? 0 : 3,
                padding: minimized ? "5px 0" : "6px 0",
                border: "none",
                background: "transparent",
                color: active ? "var(--sport-600)" : "var(--ink-400)",
                cursor: "pointer",
              }}
            >
              <span
                className={cn(
                  "inline-flex items-center justify-center",
                  active && activeIcoClass
                )}
                style={{
                  width: 24,
                  height: 24,
                  transform: active ? "translateY(-1px)" : "none",
                  transition: "transform var(--dur-base) var(--ease-spring)",
                }}
              >
                {it.icon}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: active ? 800 : 600,
                  letterSpacing: "0.01em",
                  maxHeight: minimized ? 0 : 14,
                  opacity: minimized ? 0 : 1,
                  overflow: "hidden",
                  transition:
                    "max-height var(--dur-base) var(--ease-out), opacity var(--dur-base) var(--ease-out)",
                }}
              >
                {it.label}
              </span>
            </button>
          )
        })}
      </nav>
    )
  }

  // Legacy docked bar — sits in normal flow at the bottom of a column.
  return (
    <nav
      className={className}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "stretch",
        gap: 0,
        padding: "8px 0 10px",
        background: "color-mix(in srgb, var(--surface-card) 86%, transparent)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        borderTop: "1px solid var(--border-subtle)",
        ...style,
      }}
      {...rest}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 6,
          bottom: 8,
          left: `${(activeIndex * 100) / n}%`,
          width: `${100 / n}%`,
          padding: "0 10px",
          boxSizing: "border-box",
          transition: "left var(--dur-slow) var(--ease-spring)",
          pointerEvents: "none",
          zIndex: 0,
          opacity: idx < 0 ? 0 : 1,
        }}
      >
        <span
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            background: "var(--sport-100)",
            border:
              "1px solid color-mix(in srgb, var(--sport-500) 24%, transparent)",
            borderRadius: "var(--radius-md)",
          }}
        />
      </span>
      {items.map((it) => {
        const active = it.value === value
        return (
          <button
            key={it.value}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onChange?.(it.value)}
            className={cn(
              pressClass,
              "[transition:transform_var(--dur-fast)_var(--ease-out),color_var(--dur-base)_var(--ease-out)]"
            )}
            style={{
              position: "relative",
              zIndex: 1,
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              padding: "4px 0",
              border: "none",
              background: "transparent",
              color: active ? "var(--sport-600)" : "var(--ink-400)",
              cursor: "pointer",
            }}
          >
            <span
              className={cn(
                "inline-flex items-center justify-center",
                active && activeIcoClass
              )}
              style={{
                width: 24,
                height: 24,
                transform: active ? "translateY(-1px)" : "none",
                transition: "transform var(--dur-base) var(--ease-spring)",
              }}
            >
              {it.icon}
            </span>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: active ? 700 : 600,
                letterSpacing: "0.01em",
              }}
            >
              {it.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
