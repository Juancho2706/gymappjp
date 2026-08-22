import { describe, expect, it } from 'vitest'
import { redirectSystemPath } from '../../apps/mobile/app/+native-intent'

describe('redirectSystemPath', () => {
  it('convierte links de coach e invite al resolver React', () => {
    expect(redirectSystemPath({ path: 'https://eva-app.cl/c/ana-fit/login', initial: true }))
      .toBe('/alumno/codigo?identifier=ana-fit&auto=1')
    expect(redirectSystemPath({ path: '/invite/A7K9P?utm_source=coach', initial: true }))
      .toBe('/alumno/codigo?identifier=A7K9P&auto=1')
    expect(redirectSystemPath({ path: 'eva://c/coach%20uno', initial: false }))
      .toBe('/alumno/codigo?identifier=coach%20uno&auto=1')
  })

  it('preserva rutas ajenas y degrada segmentos vacíos de forma segura', () => {
    expect(redirectSystemPath({ path: '/reset-password?token=abc', initial: true }))
      .toBe('/reset-password?token=abc')
    expect(redirectSystemPath({ path: '/c/', initial: true })).toBe('/c/')
  })

  it('no lanza con escapes URI malformados', () => {
    expect(redirectSystemPath({ path: '/c/%E0%A4%A', initial: true }))
      .toBe('/alumno/codigo?identifier=%25E0%25A4%25A&auto=1')
  })
})

describe('redirectSystemPath — vuelta a la app tras confirmar el correo', () => {
  it('eva://auth/confirmed aterriza en verify-email con confirmed=1 y el email', () => {
    expect(redirectSystemPath({ path: 'eva://auth/confirmed?email=coach%40example.com', initial: true }))
      .toBe('/(auth)/verify-email?confirmed=1&email=coach%40example.com')
    expect(redirectSystemPath({ path: 'eva://auth/confirmed', initial: false }))
      .toBe('/(auth)/verify-email?confirmed=1')
  })
})
