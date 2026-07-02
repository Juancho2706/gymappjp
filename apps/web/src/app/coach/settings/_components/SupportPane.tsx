import { SupportForm } from '../../support/SupportForm'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LifeBuoy, MessageCircle, Mail, BookOpen, ChevronRight } from 'lucide-react'

const SUPPORT_EMAIL = 'contacto@eva-app.cl'

/**
 * Soporte EMBEBIDO en la SettingsShell desktop (kit DesktopOpciones: "Reused mobile
 * screens, embedded WITHOUT onBack" — sin doble back). Mismo contenido que la página
 * /coach/support (que sigue viva como ruta directa para el hub mobile).
 */
export function SupportPane() {
    return (
        <div className="space-y-[18px]">
            {/* Inverse hero */}
            <Card variant="inverse" padding="lg">
                <div className="flex items-center gap-3">
                    <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-control bg-[var(--sport-500)] text-white">
                        <LifeBuoy className="h-6 w-6" />
                    </span>
                    <div className="min-w-0">
                        <h2 className="font-display text-lg font-extrabold text-on-dark">
                            ¿En qué te ayudamos?
                        </h2>
                        <p className="text-[13px] text-on-dark-muted">
                            Respondemos en menos de 24 h
                        </p>
                    </div>
                </div>
            </Card>

            {/* Canales */}
            <div>
                <h3 className="mb-2.5 font-display text-[17px] font-extrabold tracking-[-0.02em] text-strong">
                    Canales
                </h3>
                <Card padding="none">
                    {/* Chat en vivo */}
                    <div className="flex items-center gap-3 px-3.5 py-3">
                        <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-control bg-surface-sunken text-[var(--ink-700)]">
                            <MessageCircle className="h-[18px] w-[18px]" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-[15px] font-bold text-strong">Chat en vivo</div>
                            <div className="mt-px truncate text-[13px] text-muted">En línea</div>
                        </div>
                        <Badge tone="success" dot size="sm">
                            En línea
                        </Badge>
                        <ChevronRight aria-hidden strokeWidth={2.25} className="size-[18px] shrink-0 text-[var(--ink-300)]" />
                    </div>

                    <div className="mx-3.5 h-px bg-[var(--border-subtle)]" />

                    {/* Email */}
                    <a
                        href={`mailto:${SUPPORT_EMAIL}`}
                        className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-surface-sunken"
                    >
                        <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-control bg-surface-sunken text-[var(--ink-700)]">
                            <Mail className="h-[18px] w-[18px]" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-[15px] font-bold text-strong">{SUPPORT_EMAIL}</div>
                            <div className="mt-px truncate text-[13px] text-muted">Email</div>
                        </div>
                        <ChevronRight aria-hidden strokeWidth={2.25} className="size-[18px] shrink-0 text-[var(--ink-300)]" />
                    </a>

                    <div className="mx-3.5 h-px bg-[var(--border-subtle)]" />

                    {/* Centro de ayuda */}
                    <div className="flex items-center gap-3 px-3.5 py-3">
                        <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-control bg-surface-sunken text-[var(--ink-700)]">
                            <BookOpen className="h-[18px] w-[18px]" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-[15px] font-bold text-strong">Centro de ayuda</div>
                            <div className="mt-px truncate text-[13px] text-muted">Guías y FAQ</div>
                        </div>
                        <ChevronRight aria-hidden strokeWidth={2.25} className="size-[18px] shrink-0 text-[var(--ink-300)]" />
                    </div>
                </Card>
            </div>

            {/* Enviar un mensaje */}
            <div>
                <h3 className="mb-2.5 font-display text-[17px] font-extrabold tracking-[-0.02em] text-strong">
                    Enviar un mensaje
                </h3>
                <Card padding="md">
                    <SupportForm />
                </Card>
            </div>
        </div>
    )
}
