/**
 * Error tipado de una request HTTP fallida a un gateway de pagos. Es un subtipo de `Error`
 * con el MISMO `message` que se lanzaba antes (cero regresión para los callers que solo leen
 * `.message` o hacen `instanceof Error`), pero ADEMÁS lleva el `status` HTTP y el `provider`.
 *
 * Motivación (cron paid-expiry): la verificación provider-verified necesita distinguir un
 * `404 / not found` (la suscripción ya no existe en el gateway → MUERTA → expirar) de un error
 * TRANSITORIO (5xx, timeout de red → fail-safe alert-only). Sin el status tipado habría que
 * parsear el texto del mensaje (frágil). El status queda disponible para cualquier caller que
 * lo quiera; los existentes lo ignoran.
 */
export class ProviderRequestError extends Error {
    readonly provider: 'mercadopago' | 'flow' | 'stripe'
    readonly status: number | null
    readonly requestId: string | null

    constructor(
        provider: 'mercadopago' | 'flow' | 'stripe',
        status: number | null,
        message: string,
        requestId: string | null = null
    ) {
        super(message)
        this.name = 'ProviderRequestError'
        this.provider = provider
        this.status = status
        this.requestId = requestId
    }

    /** 404 (o "not found" equivalente): el recurso ya no existe en el gateway. */
    get isNotFound(): boolean {
        return this.status === 404
    }

    /**
     * MP 400 "the preapprovalId is not valid for callerId": el preapproval existe pero pertenece a
     * OTRA cuenta MP — en la práctica, la cuenta vieja pre-migración del 2026-07-05, cuyos
     * preapprovals fueron cancelados out-of-band. Para el caller actual es inalcanzable e
     * incobrable → equivale a suscripción MUERTA (caso movida-la2yw4 27-jul: quedó Pro gratis
     * porque este 400 caía como error transitorio permanente).
     */
    get isForeignAccount(): boolean {
        return (
            this.provider === 'mercadopago' &&
            this.status === 400 &&
            this.message.includes('not valid for callerId')
        )
    }
}
