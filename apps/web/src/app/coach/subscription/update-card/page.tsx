import { notFound } from 'next/navigation'
import { CARD_CHANGE_DISCLOSURE, CHANGE_CARD_ENABLED } from '@/lib/constants'
import { CardChangeForm } from './_components/CardChangeForm'

// El flag es server-only (process.env) → la página DEBE renderizarse en request time, no en build.
export const dynamic = 'force-dynamic'

/**
 * /coach/subscription/update-card — superficie del cambio de tarjeta in-place (Modalidad A).
 *
 * Gate server-side: si CHANGE_CARD_ENABLED está OFF, la página no existe (404), igual que el gate
 * de la ruta /api/payments/change-card. Es la MISMA URL que abrirá la futura app RN en el navegador
 * externo (pago fuera de la app). La tokenización ocurre 100% client-side (Secure Fields) → el PAN
 * nunca toca el server (PCI SAQ-A).
 */
export default function UpdateCardPage() {
    if (!CHANGE_CARD_ENABLED) notFound()

    const publicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? ''

    return (
        <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pt-safe pb-safe py-8">
            <header className="space-y-1">
                <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
                    Cambiar tarjeta
                </h1>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Actualizá la tarjeta de tu suscripción. Tu plan, monto y fecha de cobro no cambian.
                </p>
            </header>

            <CardChangeForm
                publicKey={publicKey}
                termsVersion={CARD_CHANGE_DISCLOSURE.version}
                disclosure={CARD_CHANGE_DISCLOSURE.points.map((p) => ({
                    number: p.number,
                    title: p.title,
                    text: p.text,
                }))}
            />
        </main>
    )
}
