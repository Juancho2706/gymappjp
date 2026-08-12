import { apiFetch } from './api'

/**
 * Eliminacion de cuenta EN-APP (Guideline 5.1.1(v) — rechazo de la build iOS 1.1.0).
 *
 * RN no puede tocar `auth.admin` (eso exige service_role), asi que la baja va por el bridge bearer
 * `/api/mobile/account/delete`: el server identifica al titular por el TOKEN, cancela la suscripcion
 * del coach si existe y deshabilita la cuenta al instante. La purga definitiva ocurre a los 30 dias.
 *
 * Espejo estructural de `lib/pool-consent.ts`. Lanza `ApiError` en fallo: el caller muestra el error
 * inline y deja reintentar — jamas cerrar sesion sin un `ok` del server (si la cuenta no quedo
 * deshabilitada, sacar al usuario de la app solo le esconde el problema).
 */

export interface AccountDeletionResult {
    ok: true
    /** Codigos no-bloqueantes (p.ej. `SUBSCRIPTION_CANCEL_FAILED`): la baja SI se hizo. */
    warnings?: string[]
}

export function requestAccountDeletion(): Promise<AccountDeletionResult> {
    return apiFetch<AccountDeletionResult>('/api/mobile/account/delete', {
        method: 'POST',
        authenticated: true,
    })
}
