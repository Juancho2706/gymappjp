const STATUS_MAP: Record<string, { label: string; color: string }> = {
    active:          { label: 'Activo',      color: 'text-[--admin-green]  bg-[--admin-green]/10  border-[--admin-green]/30' },
    free_active:     { label: 'Free',        color: 'text-[--admin-text-2] bg-[--admin-text-2]/10 border-[--admin-text-2]/30' },
    trialing:        { label: 'Trial',       color: 'text-[--admin-blue]   bg-[--admin-blue]/10   border-[--admin-blue]/30' },
    canceled:        { label: 'Cancelado',   color: 'text-[--admin-amber]  bg-[--admin-amber]/10  border-[--admin-amber]/30' },
    pending_payment: { label: 'Pago pend.',  color: 'text-[--admin-red]    bg-[--admin-red]/10    border-[--admin-red]/30' },
    pending_email:   { label: 'Email pend.', color: 'text-[--admin-amber]  bg-[--admin-amber]/10  border-[--admin-amber]/30' },
    expired:         { label: 'Expirado',    color: 'text-[--admin-text-3] bg-[--admin-text-3]/10 border-[--admin-text-3]/30' },
    past_due:        { label: 'Atrasado',    color: 'text-[--admin-red]    bg-[--admin-red]/10    border-[--admin-red]/30' },
    paused:          { label: 'Suspendido',  color: 'text-[--admin-purple] bg-[--admin-purple]/10 border-[--admin-purple]/30' },
}

const TIER_MAP: Record<string, { label: string; color: string }> = {
    free:    { label: 'free',    color: 'text-[--admin-text-3] bg-[--admin-text-3]/10 border-[--admin-text-3]/30' },
    starter: { label: 'Starter', color: 'text-[--admin-text-2] bg-[--admin-text-2]/10 border-[--admin-text-2]/30' },
    pro:     { label: 'Pro',     color: 'text-[--admin-blue]   bg-[--admin-blue]/10   border-[--admin-blue]/30' },
    elite:   { label: 'Elite',   color: 'text-[--admin-purple] bg-[--admin-purple]/10 border-[--admin-purple]/30' },
    growth:  { label: 'Growth',  color: 'text-[--admin-amber]  bg-[--admin-amber]/10  border-[--admin-amber]/30' },
    scale:   { label: 'Scale',   color: 'text-[--admin-green]  bg-[--admin-green]/10  border-[--admin-green]/30' },
}

const PROVIDER_MAP: Record<string, { label: string; color: string }> = {
    free:         { label: 'free',     color: 'text-[--admin-text-3] bg-[--admin-text-3]/10 border-[--admin-text-3]/30' },
    admin:        { label: 'free',     color: 'text-[--admin-text-3] bg-[--admin-text-3]/10 border-[--admin-text-3]/30' },
    internal:     { label: 'internal', color: 'text-[--admin-purple] bg-[--admin-purple]/10 border-[--admin-purple]/30' },
    beta:         { label: 'beta',     color: 'text-[--admin-amber]  bg-[--admin-amber]/10  border-[--admin-amber]/30' },
    mercadopago:  { label: 'MP',       color: 'text-[--admin-blue]   bg-[--admin-blue]/10   border-[--admin-blue]/30' },
    stripe:       { label: 'Stripe',   color: 'text-[--admin-purple] bg-[--admin-purple]/10 border-[--admin-purple]/30' },
}

interface Props {
    value: string
    type?: 'status' | 'tier' | 'provider'
}

export function AdminStatusBadge({ value, type = 'status' }: Props) {
    const map = type === 'tier' ? TIER_MAP : type === 'provider' ? PROVIDER_MAP : STATUS_MAP
    const entry = map[value] ?? { label: value, color: 'text-[--admin-text-3] bg-[--admin-text-3]/10 border-[--admin-text-3]/30' }
    return (
        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium ${entry.color}`}>
            {entry.label}
        </span>
    )
}
