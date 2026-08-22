import { describe, expect, it } from 'vitest'
import {
    PLATFORM_HEADER,
    PRICING_VERSION,
    SERVER_EMITTED_QUERY,
    resolveRegistrationPlatform,
} from './registration'

/**
 * W7.1 — `platform` en el alta.
 *
 * La app NO manda header de plataforma hoy (`apps/mobile/lib/api.ts` solo setea `Content-Type` y
 * `Authorization`), así que el User-Agent es la única fuente real y estos casos son los User-Agent
 * que llegan de verdad desde React Native: NSURLSession en iOS, okhttp en Android.
 */

function headers(bag: Record<string, string>) {
    return new Headers(bag)
}

describe('resolveRegistrationPlatform — header explícito', () => {
    it('el header gana sobre el User-Agent (dato afirmado > inferencia)', () => {
        const h = headers({ [PLATFORM_HEADER]: 'ios', 'user-agent': 'okhttp/4.9.2' })
        expect(resolveRegistrationPlatform(h)).toBe('ios')
    })

    it('acepta mayúsculas y espacios', () => {
        expect(resolveRegistrationPlatform(headers({ [PLATFORM_HEADER]: ' Android ' }))).toBe('android')
    })

    it('un valor que no está en la lista se ignora y cae al User-Agent', () => {
        const h = headers({ [PLATFORM_HEADER]: 'windows-phone', 'user-agent': 'okhttp/4.9.2' })
        expect(resolveRegistrationPlatform(h)).toBe('android')
    })
})

describe('resolveRegistrationPlatform — User-Agent', () => {
    it('iOS: React Native sale por NSURLSession (CFNetwork + Darwin)', () => {
        const ua = 'EVA/85 CFNetwork/1568.100.1 Darwin/24.0.0'
        expect(resolveRegistrationPlatform(headers({ 'user-agent': ua }))).toBe('ios')
    })

    it('Android: React Native sale por okhttp', () => {
        expect(resolveRegistrationPlatform(headers({ 'user-agent': 'okhttp/4.9.2' }))).toBe('android')
    })

    it('Android: Dalvik (HttpURLConnection) también cuenta', () => {
        const ua = 'Dalvik/2.1.0 (Linux; U; Android 14; SM-S921B Build/UP1A.231005.007)'
        expect(resolveRegistrationPlatform(headers({ 'user-agent': ua }))).toBe('android')
    })

    // Expo Go en iPhone manda «Expo» Y «CFNetwork»: si Android se evaluara primero, este caso
    // quedaría clasificado al revés y el número que decide sobre IAP nacería torcido.
    it('Expo Go en iPhone se clasifica como iOS, no como Android', () => {
        const ua = 'Expo/1021 CFNetwork/1568.100.1 Darwin/24.0.0'
        expect(resolveRegistrationPlatform(headers({ 'user-agent': ua }))).toBe('ios')
    })

    it('un Chrome de escritorio en macOS NO es iOS («Mac OS X» no es «Darwin»)', () => {
        const ua =
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
        expect(resolveRegistrationPlatform(headers({ 'user-agent': ua }))).toBe('unknown')
    })

    it('sin header y sin User-Agent devuelve `unknown`, nunca `web`', () => {
        expect(resolveRegistrationPlatform(headers({}))).toBe('unknown')
    })
})

describe('constantes del contrato', () => {
    it('la versión de catálogo es un literal, no una fecha', () => {
        expect(PRICING_VERSION).toBe('v3')
    })

    it('el flag anti doble-conteo se pega tal cual al final de un redirect', () => {
        expect(SERVER_EMITTED_QUERY).toBe('ph=srv')
    })
})
