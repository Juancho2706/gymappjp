import { Badge } from '@/components/ui/badge'

/**
 * Mapper fino sobre el Badge de EVA DS (F1 08-05): antes eran 66 clases `--admin-*`
 * muertas en Tailwind 4 (badges sin color en pantalla). El API (`value`, `type`) no
 * cambia — solo se traduce a `tone` del design system. Flow agregado (dual-gateway).
 */

type Tone = 'neutral' | 'sport' | 'ember' | 'success' | 'warning' | 'danger' | 'info' | 'aqua'

const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
    active:          { label: 'Activo',      tone: 'success' },
    free_active:     { label: 'Free',        tone: 'neutral' },
    trialing:        { label: 'Trial',       tone: 'sport' },
    canceled:        { label: 'Cancelado',   tone: 'warning' },
    pending_payment: { label: 'Pago pend.',  tone: 'danger' },
    pending_email:   { label: 'Email pend.', tone: 'warning' },
    expired:         { label: 'Expirado',    tone: 'neutral' },
    past_due:        { label: 'Atrasado',    tone: 'danger' },
    paused:          { label: 'Suspendido',  tone: 'aqua' },
}

const TIER_MAP: Record<string, { label: string; tone: Tone }> = {
    free:    { label: 'free',    tone: 'neutral' },
    starter: { label: 'Starter', tone: 'neutral' },
    pro:     { label: 'Pro',     tone: 'sport' },
    elite:   { label: 'Elite',   tone: 'aqua' },
    growth:  { label: 'Growth',  tone: 'warning' },
    scale:   { label: 'Scale',   tone: 'success' },
}

const PROVIDER_MAP: Record<string, { label: string; tone: Tone }> = {
    free:         { label: 'free',     tone: 'neutral' },
    admin:        { label: 'cortesía', tone: 'neutral' },
    internal:     { label: 'internal', tone: 'aqua' },
    beta:         { label: 'beta',     tone: 'warning' },
    mercadopago:  { label: 'MP',       tone: 'sport' },
    flow:         { label: 'Flow',     tone: 'ember' },
    stripe:       { label: 'Stripe',   tone: 'aqua' },
}

interface Props {
    value: string
    type?: 'status' | 'tier' | 'provider'
}

export function AdminStatusBadge({ value, type = 'status' }: Props) {
    const map = type === 'tier' ? TIER_MAP : type === 'provider' ? PROVIDER_MAP : STATUS_MAP
    const entry = map[value] ?? { label: value, tone: 'neutral' as Tone }
    return (
        <Badge tone={entry.tone} variant="soft" size="sm" title={value}>
            {entry.label}
        </Badge>
    )
}
