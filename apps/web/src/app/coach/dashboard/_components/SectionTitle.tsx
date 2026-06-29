import type { ReactNode } from 'react'

/**
 * SectionTitle — verbatim from eva-app/screens/shared.jsx: display 17/800 strong
 * heading with an optional sport-700 action on the right (baseline-aligned).
 */
export function SectionTitle({
    children,
    action,
    onAction,
}: {
    children: ReactNode
    action?: ReactNode
    onAction?: () => void
}) {
    return (
        <div className="mx-0 mb-2.5 mt-1 flex items-baseline justify-between">
            <h2 className="font-display text-[17px] font-extrabold tracking-[-0.02em] text-[var(--text-strong)]">
                {children}
            </h2>
            {action != null && (
                <span
                    onClick={onAction}
                    className={`text-[13px] font-bold text-sport-700 ${onAction ? 'cursor-pointer' : ''}`}
                >
                    {action}
                </span>
            )}
        </div>
    )
}
