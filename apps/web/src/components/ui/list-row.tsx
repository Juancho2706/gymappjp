import * as React from "react"
import { ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

export interface ListRowProps extends Omit<React.ComponentProps<"div">, "title"> {
  /** Leading node — avatar or icon. */
  leading?: React.ReactNode
  /** Primary label (bold, truncates on overflow). */
  title: React.ReactNode
  /** Secondary label (muted, truncates on overflow). */
  subtitle?: React.ReactNode
  /** Far-right node — badge, value, or ProgressRing. */
  trailing?: React.ReactNode
  /** Show the trailing chevron affordance. */
  showChevron?: boolean
}

/**
 * EVA ListRow — tappable list item for rosters, plan items, and settings lists.
 * Faithful to the EVA Design System (Fase 1).
 *
 * Hover tints the surface to `sunken` when `onClick` is set. Stack rows inside a
 * `<Card padding="none">`, separated by hairline `border-subtle` dividers.
 */
function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  showChevron = false,
  onClick,
  onKeyDown,
  className,
  ...props
}: ListRowProps) {
  const interactive = !!onClick

  const handleKeyDown = interactive
    ? (event: React.KeyboardEvent<HTMLDivElement>) => {
        onKeyDown?.(event)
        if (event.defaultPrevented) return
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onClick?.(event as unknown as React.MouseEvent<HTMLDivElement>)
        }
      }
    : onKeyDown

  return (
    <div
      data-slot="list-row"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      className={cn(
        // padding 12px 14px · gap 12px · radius 14 (control) · animated surface tint
        "flex items-center gap-3 rounded-control px-3.5 py-3 outline-none [transition:background-color_var(--dur-fast)_var(--ease-out)]",
        interactive
          ? "cursor-pointer bg-surface-card hover:bg-surface-sunken focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
          : "cursor-default bg-surface-card",
        className
      )}
      {...props}
    >
      {leading ? <div className="flex shrink-0">{leading}</div> : null}

      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold text-[var(--text-strong)]">
          {title}
        </div>
        {subtitle ? (
          <div className="mt-px truncate text-[13px] text-[var(--text-muted)]">
            {subtitle}
          </div>
        ) : null}
      </div>

      {trailing ? (
        <div className="flex shrink-0 items-center">{trailing}</div>
      ) : null}

      {showChevron ? (
        <ChevronRight
          aria-hidden
          strokeWidth={2.25}
          className="size-[18px] shrink-0 text-[var(--ink-300)]"
        />
      ) : null}
    </div>
  )
}

export { ListRow }
