import { describe, expect, it } from 'vitest'
import { appSignupSurface, webSignupSurface } from './signup-surface'

describe('webSignupSurface', () => {
    it('teléfono o tablet ⇒ web_mobile', () => {
        expect(webSignupSurface('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('web_mobile')
        expect(webSignupSurface('Mozilla/5.0 (Linux; Android 14; SM-S918B) Mobile Safari/537.36')).toBe('web_mobile')
    })

    it('escritorio o sin user-agent ⇒ web_desktop', () => {
        expect(webSignupSurface('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0')).toBe('web_desktop')
        expect(webSignupSurface(null)).toBe('web_desktop')
    })
})

describe('appSignupSurface', () => {
    it('mapea la plataforma resuelta del alta móvil', () => {
        expect(appSignupSurface('ios')).toBe('app_ios')
        expect(appSignupSurface('android')).toBe('app_android')
    })

    it('lo que no es iOS ni Android queda app_unknown, nunca web', () => {
        expect(appSignupSurface('unknown')).toBe('app_unknown')
        expect(appSignupSurface('web')).toBe('app_unknown')
    })
})
