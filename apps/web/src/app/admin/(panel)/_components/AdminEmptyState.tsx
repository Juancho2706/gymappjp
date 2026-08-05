import type { ReactNode } from 'react'
import { LucideIcon } from 'lucide-react'

interface Props {
    icon?: LucideIcon
    title: string
    description?: string
    action?: ReactNode
}

export function AdminEmptyState({ icon: Icon, title, description, action }: Props) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            {Icon && (
                <div className="mb-3 rounded-full border border-subtle bg-surface-sunken p-3">
                    <Icon className="h-5 w-5 text-muted" />
                </div>
            )}
            <p className="text-sm font-medium text-body">{title}</p>
            {description && (
                <p className="mt-1 text-xs text-muted">{description}</p>
            )}
            {action && (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    {action}
                </div>
            )}
        </div>
    )
}
