import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/**
 * EVA Input — labelled text field (DS redesign).
 *
 * Public API preserved: still accepts every native `<input>` prop + `className`
 * and renders a single styled input when no field decorations are passed (most
 * existing call sites). When any of `label` / `iconLeft` / `hint` / `error` is
 * provided it renders the richer field from the design source: label above, a
 * 48px bordered control (sport focus ring) with optional leading icon, and a
 * hint/error line below.
 */
type InputProps = React.ComponentProps<"input"> & {
  /** Label rendered above the control. */
  label?: React.ReactNode
  /** Leading icon node (e.g. a lucide-react `<Search />`). */
  iconLeft?: React.ReactNode
  /** Helper text below the control. */
  hint?: React.ReactNode
  /** Error message — flags the field invalid (danger border + red message). */
  error?: React.ReactNode
}

// 14px horizontal padding, 48px tall control, control radius, sport focus ring.
const FIELD_TRANSITION =
  "[transition:border-color_var(--dur-fast)_var(--ease-out),box-shadow_var(--dur-fast)_var(--ease-out)]"

function Input({
  className,
  type,
  label,
  iconLeft,
  hint,
  error,
  disabled,
  ...props
}: InputProps) {
  const ariaInvalid = props["aria-invalid"]
  const hasError =
    Boolean(error) || ariaInvalid === true || ariaInvalid === "true"

  const isRich =
    label != null ||
    iconLeft != null ||
    hint != null ||
    error != null

  // Bare mode: backward-compatible single input — `className` styles the input.
  if (!isRich) {
    return (
      <InputPrimitive
        type={type}
        data-slot="input"
        disabled={disabled}
        className={cn(
          "h-12 w-full min-w-0 rounded-control border-[1.5px] bg-surface-card px-3.5 font-ui text-[15px] font-medium text-text-strong outline-none placeholder:text-text-muted",
          FIELD_TRANSITION,
          hasError
            ? "border-[var(--danger-500)]"
            : "border-border-default focus-visible:border-sport-600 focus-visible:shadow-[var(--ring-focus)]",
          "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-muted",
          className
        )}
        {...props}
      />
    )
  }

  // Rich mode: label + bordered control + hint/error (faithful to Input.jsx).
  const descId = React.useId()

  return (
    <label
      data-slot="input-field"
      className={cn("flex w-full flex-col gap-1.5", className)}
    >
      {label != null && (
        <span className="font-ui text-[13px] font-semibold text-text-strong">
          {label}
        </span>
      )}

      <div
        data-disabled={disabled || undefined}
        className={cn(
          "flex h-12 items-center gap-2 rounded-control border-[1.5px] px-3.5",
          FIELD_TRANSITION,
          disabled ? "bg-surface-sunken" : "bg-surface-card",
          hasError
            ? "border-[var(--danger-500)]"
            : "border-border-default focus-within:border-sport-600 focus-within:shadow-[var(--ring-focus)]"
        )}
      >
        {iconLeft != null && (
          <span className="inline-flex size-[18px] shrink-0 items-center justify-center text-text-muted [&_svg]:size-[18px]">
            {iconLeft}
          </span>
        )}
        <InputPrimitive
          type={type}
          data-slot="input"
          disabled={disabled}
          aria-invalid={hasError || undefined}
          aria-describedby={hint != null || error != null ? descId : undefined}
          className="min-w-0 flex-1 border-none bg-transparent font-ui text-[15px] font-medium text-text-strong outline-none placeholder:text-text-muted disabled:cursor-not-allowed disabled:text-text-muted"
          {...props}
        />
      </div>

      {(hint != null || error != null) && (
        <span
          id={descId}
          className={cn(
            "font-ui text-[12px]",
            hasError ? "text-[var(--danger-600)]" : "text-text-muted"
          )}
        >
          {error ?? hint}
        </span>
      )}
    </label>
  )
}

export { Input }
export type { InputProps }
