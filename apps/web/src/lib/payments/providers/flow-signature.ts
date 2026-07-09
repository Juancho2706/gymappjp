import { createHmac } from 'node:crypto'

/**
 * Firma HMAC-SHA256 de Flow.cl (developers.flow.cl §Autenticacion) — nucleo criptografico de TODA
 * llamada al REST de Flow y de la verificacion del round-trip firmado del webhook (Ola 2/3).
 *
 * Algoritmo EXACTO (validado empiricamente contra el sandbox de Flow en la Fase 0):
 *   1. Se ordenan los parametros por nombre ALFABETICAMENTE, EXCLUYENDO el propio `s`.
 *   2. Se concatenan como `nombre + valor` SIN separador (ni `&` ni `=`): `apiKey<v>amount<v>...`.
 *   3. HMAC-SHA256 de esa cadena con el `secretKey`, en hex. El resultado viaja como el param `s`.
 *
 * Puro y determinista (sin red, sin reloj) → testeable con vectores fijos. NUNCA loguear `secretKey`.
 */
export type FlowParams = Record<string, string | number>

/** Firma los params (excluye `s`) y devuelve el HMAC-SHA256 hex que va como `s`. */
export function signFlowParams(params: FlowParams, secretKey: string): string {
    const toSign = Object.keys(params)
        .filter((k) => k !== 's')
        .sort()
        .reduce((acc, k) => acc + k + String(params[k]), '')
    return createHmac('sha256', secretKey).update(toSign, 'utf8').digest('hex')
}

/**
 * Construye el body `application/x-www-form-urlencoded` firmado (todos los params + `s`).
 * Lo usan las llamadas POST al REST de Flow. El orden de aparicion en el body es irrelevante para
 * Flow (re-firma ordenando alfabeticamente); igual respetamos el orden de insercion de `params`.
 */
export function buildSignedFlowBody(params: FlowParams, secretKey: string): string {
    const usp = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) usp.append(k, String(v))
    usp.append('s', signFlowParams(params, secretKey))
    return usp.toString()
}

/**
 * Verifica una firma recibida (`s`) contra el resto de los params. Comparacion en tiempo
 * constante (timingSafeEqual via longitud + XOR acumulado sobre el hex) para no filtrar por timing.
 * Lo usa la autorizacion del webhook de Flow (defensa en profundidad sobre el token propio).
 */
export function verifyFlowSignature(params: FlowParams, receivedSignature: string, secretKey: string): boolean {
    const expected = signFlowParams(params, secretKey)
    if (expected.length !== receivedSignature.length) return false
    let diff = 0
    for (let i = 0; i < expected.length; i++) {
        diff |= expected.charCodeAt(i) ^ receivedSignature.charCodeAt(i)
    }
    return diff === 0
}
