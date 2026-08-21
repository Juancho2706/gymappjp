/**
 * Normalizador de teléfono → link de WhatsApp.
 *
 * POR QUÉ existe (y por qué NO es `normalizePhoneDigits` de coach/nutrition-v2/_lib/hub-roster):
 * ese helper solo saca lo que no sea dígito, y sirve porque los teléfonos del roster los tipea el
 * COACH (que suele guardar el +56). Acá el número lo escribe un desconocido en un form público
 * (`/join/[código]`, solicitud al coach), y en Chile lo natural es escribir «9 1234 5678» o
 * «09 1234 5678»: sin país, `wa.me/912345678` abre un chat inexistente y el coach pierde el lead.
 *
 * Se comparte entre el correo que le llega al coach (server) y el panel «Solicitudes»
 * (/coach/clients), para que el botón sea EL MISMO número en los dos lados. Módulo puro y sin
 * `server-only` a propósito: lo importa también un client component.
 *
 * Regla (deliberadamente conservadora, solo toca el caso chileno inequívoco):
 *  1. se descarta todo lo que no sea dígito (`+`, espacios, guiones, paréntesis);
 *  2. se quitan los ceros iniciales (prefijo de salida nacional: «09…» → «9…»);
 *  3. si quedan exactamente 9 dígitos y empiezan con 9 (móvil chileno sin país) → se antepone 56.
 * Cualquier otro largo se deja intacto: un número extranjero ya trae su país y meterle mano sería
 * romperlo (ej. `5491112345678`, Argentina).
 */

/** Solo dígitos, listos para `wa.me`; `null` si no queda nada marcable. */
export function toWhatsAppDigits(phone: string | null | undefined): string | null {
    if (!phone) return null

    const digits = phone.replace(/\D/g, '').replace(/^0+/, '')
    if (!digits) return null

    if (digits.length === 9 && digits.startsWith('9')) return `56${digits}`

    return digits
}

/** `https://wa.me/<dígitos>?text=…`; `null` si el teléfono no sirve (nunca un wa.me vacío). */
export function waMeUrl(phone: string | null | undefined, message?: string): string | null {
    const digits = toWhatsAppDigits(phone)
    if (!digits) return null

    const text = message?.trim()
    return text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}`
}
