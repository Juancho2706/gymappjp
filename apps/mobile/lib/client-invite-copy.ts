import { formatWhatsappInvite, type Persona } from '@eva/schemas'

/**
 * Texto con el que el coach manda el acceso a un alumno (WhatsApp / hoja de compartir).
 *
 * Lógica PURA: sin react-native, para que `tests/mobile` la cubra con el runner del repo.
 *
 * Por qué existe (auditoría onboarding v2, 22-08): `lib/client-actions.ts` tenía el texto
 * hardcodeado «…tu acceso a la app de EVA» — una fuga de marca en white-label (el coach Pro con
 * marca propia le escribía a su alumno hablando de EVA) y un copy que no coincidía con el de la
 * web. La plantilla canónica vive en `@eva/schemas` (`PERSONA_COPY[persona].whatsappInvite`) y
 * habla de «mi app», que es lo que vale en cualquier marca.
 *
 * Sin persona (coach anterior al onboarding v2, o caché todavía fría) se usa la plantilla de
 * `other`: neutra, sin nombre de producto.
 */
export const DEFAULT_INVITE_PERSONA: Persona = 'other'

/**
 * Con `email` y `tempPassword` sale la variante CON credencial (usuario y clave adentro del
 * mensaje); si falta cualquiera de los dos —o viene vacío— sale la variante sin clave, que dice la
 * verdad («te mandé tu clave al correo»). Los dos o ninguno: media credencial, un «Tu usuario:»
 * huérfano sin la clave al lado, es peor que ninguna.
 *
 * **CUÁNDO mandar la credencial NO se decide acá**: esta función solo redacta. La regla 4 de
 * `docs/specs/flujo-coach-nuevo/SPEC.md §5` —«una credencial nunca viaja a un destinatario sin
 * nombre»— necesita saber por dónde y a quién se manda, y ese dato vive en el call site
 * (`guidedInvitePayload` en RN, `buildWhatsappUrl` en web). Este módulo no sabe si hay teléfono.
 */
export function clientInviteMessage(input: {
    persona: Persona | null | undefined
    clientName: string
    loginUrl: string
    email?: string | null
    tempPassword?: string | null
}): string {
    const nombre = input.clientName.trim() || 'hola'
    const correo = (input.email ?? '').trim()
    const clave = (input.tempPassword ?? '').trim()
    const conCredencial = Boolean(correo && clave)
    return formatWhatsappInvite(input.persona ?? DEFAULT_INVITE_PERSONA, {
        nombre,
        link: input.loginUrl,
        correo: conCredencial ? correo : null,
        clave: conCredencial ? clave : null,
    })
}
