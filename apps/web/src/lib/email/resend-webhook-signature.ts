import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verificación de la firma de los webhooks de Resend — SIN el SDK de Svix (cero dependencias nuevas).
 *
 * Resend firma con Svix y su doc delega el detalle en
 * https://docs.svix.com/receiving/verifying-payloads/how-manual
 * (referenciada desde https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests):
 *
 *   · headers `svix-id`, `svix-timestamp`, `svix-signature`;
 *   · contenido firmado = `${svix-id}.${svix-timestamp}.${rawBody}` — el body CRUDO, sin re-serializar
 *     (un `JSON.parse` + `JSON.stringify` reordena claves y rompe la firma);
 *   · HMAC-SHA256 con la clave = base64-decode de lo que sigue a `whsec_` en el secreto;
 *   · el header trae firmas SEPARADAS POR ESPACIO, cada una `<version>,<base64>`: hay que probar
 *     contra TODAS las `v1` (Svix manda varias durante una rotación de secreto);
 *   · comparación en tiempo constante;
 *   · el timestamp se compara contra el reloj propio con una tolerancia (acá ±5 min, el default de
 *     Svix) para que una request capturada no se pueda reproducir mañana.
 *
 * PURA: sin red, sin env, sin `Date.now()` — el reloj entra por parámetro. Todo lo que decide si un
 * POST anónimo puede escribir en la DB tiene que ser testeable sin montar un servidor.
 */

/** Tolerancia de reloj, en milisegundos (default de Svix). */
export const RESEND_WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000

export type VerifyResendSignatureInput = {
    /** `RESEND_WEBHOOK_SECRET`, con o sin el prefijo `whsec_`. */
    secret: string
    /** Header `svix-id`. */
    id: string
    /** Header `svix-timestamp` (segundos UNIX, como texto). */
    timestamp: string
    /** Header `svix-signature` completo (`v1,<b64> v1,<b64>`). */
    signatureHeader: string
    /** Body EXACTAMENTE como llegó. */
    rawBody: string
    now: Date
    toleranceMs?: number
}

export type VerifyResendSignatureResult =
    | { ok: true }
    | {
          ok: false
          reason: 'missing_input' | 'bad_secret' | 'bad_timestamp' | 'stale_timestamp' | 'no_match'
      }

/** `whsec_<base64>` → Buffer con la clave. `null` si el secreto no sirve. */
function decodeSecret(secret: string): Buffer | null {
    const raw = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
    if (!raw) return null
    const key = Buffer.from(raw, 'base64')
    // Un secreto que no es base64 válido decodifica a algo vacío o distinto de lo que se pegó: sin
    // esta guarda, un `whsec_` mal copiado degrada a una clave de 0 bytes que igual firma.
    if (key.length === 0) return null
    return key
}

/** Comparación en tiempo constante de dos base64 (longitudes distintas = no coinciden). */
function safeEqualBase64(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8')
    const bufB = Buffer.from(b, 'utf8')
    if (bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
}

export function verifyResendSignature(
    input: VerifyResendSignatureInput
): VerifyResendSignatureResult {
    const { secret, id, timestamp, signatureHeader, rawBody, now } = input
    if (!secret || !id || !timestamp || !signatureHeader) return { ok: false, reason: 'missing_input' }

    const key = decodeSecret(secret)
    if (!key) return { ok: false, reason: 'bad_secret' }

    const seconds = Number(timestamp)
    if (!Number.isFinite(seconds) || !Number.isInteger(seconds)) {
        return { ok: false, reason: 'bad_timestamp' }
    }
    const toleranceMs = input.toleranceMs ?? RESEND_WEBHOOK_TOLERANCE_MS
    // Valor absoluto: se rechaza tanto la request vieja (replay) como la del futuro (reloj torcido
    // del emisor o timestamp forjado para que nunca venza).
    if (Math.abs(now.getTime() - seconds * 1000) > toleranceMs) {
        return { ok: false, reason: 'stale_timestamp' }
    }

    const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64')

    for (const entry of signatureHeader.split(' ')) {
        const separator = entry.indexOf(',')
        if (separator < 0) continue
        const version = entry.slice(0, separator)
        if (version !== 'v1') continue
        if (safeEqualBase64(entry.slice(separator + 1), expected)) return { ok: true }
    }

    return { ok: false, reason: 'no_match' }
}
