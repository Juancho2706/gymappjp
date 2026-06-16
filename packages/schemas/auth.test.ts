import { describe, it, expect } from 'vitest'
import { ForgotPasswordSchema } from './auth'

describe('ForgotPasswordSchema', () => {
    // Regresion: formData.get('team_slug') devuelve NULL cuando el form se abre sin team_slug
    // (coach/alumno standalone). Con `.optional()` esto tiraba "expected string, received null"
    // y rompia el reset de password para todo usuario no-team (bug ffc118e, 2026-06-13).
    it('acepta team_slug null (caso standalone, sin slug en la URL)', () => {
        const r = ForgotPasswordSchema.safeParse({ email: 'a@b.com', team_slug: null })
        expect(r.success).toBe(true)
    })

    it('acepta team_slug undefined y ausente', () => {
        expect(ForgotPasswordSchema.safeParse({ email: 'a@b.com', team_slug: undefined }).success).toBe(true)
        expect(ForgotPasswordSchema.safeParse({ email: 'a@b.com' }).success).toBe(true)
    })

    it('acepta team_slug string (caso pool/team)', () => {
        expect(ForgotPasswordSchema.safeParse({ email: 'a@b.com', team_slug: 'movida' }).success).toBe(true)
    })

    it('rechaza email invalido', () => {
        expect(ForgotPasswordSchema.safeParse({ email: 'no-es-email', team_slug: null }).success).toBe(false)
    })
})
