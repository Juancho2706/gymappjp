import { LucideIcon } from 'lucide-react'

interface Props {
    icon?: LucideIcon
    title: string
    description?: string
}

export function AdminEmptyState({ icon: Icon, title, description }: Props) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            {Icon && (
                <div className="mb-3 rounded-full border border-[--admin-border] bg-[--admin-bg-elevated] p-3">
                    <Icon className="h-5 w-5 text-[--admin-text-3]" />
                </div>
            )}
            <p className="text-sm font-medium text-[--admin-text-2]">{title}</p>
            {description && (
                <p className="mt-1 text-xs text-[--admin-text-3]">{description}</p>
            )}
        </div>
    )
}
