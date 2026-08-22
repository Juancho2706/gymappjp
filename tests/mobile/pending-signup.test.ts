// Credenciales del alta en memoria (QA del owner 22-08: «ya confirmé» debe entrar, no mandar al
// login). Módulo puro, sin react-native.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearPendingSignup,
  peekPendingSignup,
  rememberPendingSignup,
} from '../../apps/mobile/lib/pending-signup'

beforeEach(() => clearPendingSignup())

describe('pending-signup', () => {
  it('guarda y devuelve las credenciales del alta, normalizando el email', () => {
    rememberPendingSignup('  Coach@Example.com ', 'Secreta123')
    expect(peekPendingSignup()).toEqual({ email: 'coach@example.com', password: 'Secreta123' })
    expect(peekPendingSignup('coach@example.com')).not.toBeNull()
    expect(peekPendingSignup('COACH@example.com')).not.toBeNull()
  })

  it('no entrega credenciales de OTRO email (la pantalla puede abrirse con otro alta)', () => {
    rememberPendingSignup('coach@example.com', 'Secreta123')
    expect(peekPendingSignup('otra@example.com')).toBeNull()
  })

  it('se consume con clear y arranca vacío', () => {
    expect(peekPendingSignup()).toBeNull()
    rememberPendingSignup('coach@example.com', 'Secreta123')
    clearPendingSignup()
    expect(peekPendingSignup()).toBeNull()
  })
})
