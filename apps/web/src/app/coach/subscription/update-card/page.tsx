import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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
 *
 * T5.5 (bifurcación por gateway): el `subscription_provider` del coach se lee ACÁ server-side (RLS
 * SELECT propio, misma fila que /api/payments/subscription-status) y se pasa como prop — el form NO
 * hace un fetch aparte solo para decidir qué UI mostrar. Coach Flow → sin Secure Fields; el cambio de
 * tarjeta ahí es un redirect de re-enrolamiento Webpay sobre el `provider_customer_id` persistido.
 */
export default async function UpdateCardPage() {
    if (!CHANGE_CARD_ENABLED) notFound()

    const publicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? ''

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    let subscriptionProvider: 'mercadopago' | 'flow' = 'mercadopago'
    if (user?.id) {
        const { data: coach } = await supabase
            .from('coaches')
            .select('subscription_provider')
            .eq('id', user.id)
            .maybeSingle()
        if (coach?.subscription_provider === 'flow') subscriptionProvider = 'flow'
    }

    return (
        <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pt-safe pb-safe py-8">
            <header className="space-y-1">
                <h1 className="font-display text-xl font-bold tracking-tight text-strong">
                    Cambiar tarjeta
                </h1>
                <p className="text-sm text-muted">
                    Actualizá la tarjeta de tu suscripción. Tu plan, monto y fecha de cobro no cambian.
                </p>
            </header>

            <CardChangeForm
                publicKey={publicKey}
                termsVersion={CARD_CHANGE_DISCLOSURE.version}
                subscriptionProvider={subscriptionProvider}
                disclosure={CARD_CHANGE_DISCLOSURE.points.map((p) => ({
                    number: p.number,
                    title: p.title,
                    text: p.text,
                }))}
            />
        </main>
    )
}
