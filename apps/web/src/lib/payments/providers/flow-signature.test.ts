import { describe, expect, it } from 'vitest'
import { buildSignedFlowBody, signFlowParams, verifyFlowSignature } from './flow-signature'

// Firma HMAC-SHA256 de Flow (nucleo de TODA llamada al REST + verificacion del webhook). Es money code:
// una firma mal armada = Flow rechaza (-o peor, acepta con params equivocados). Anclamos el algoritmo
// exacto con un vector dorado + propiedades. Vector calculado offline con el MISMO algoritmo (crypto).
describe('flow-signature — HMAC-SHA256 de Flow', () => {
    const SECRET = 'test-secret-key'
    const PARAMS = { apiKey: 'test-api-key', amount: 1990, commerceOrder: 'EVA-1', currency: 'CLP', email: 'a@b.cl' }
    // Golden: sha256_hmac('amount1990apiKeytest-api-keycommerceOrderEVA-1currencyCLPemaila@b.cl', SECRET)
    const GOLDEN = 'a617a73c4d96dd9ea401e05bf95d1d6aed367cbc98ac935b8d185d412973bae7'

    it('firma el vector dorado exacto (regresion del algoritmo)', () => {
        expect(signFlowParams(PARAMS, SECRET)).toBe(GOLDEN)
    })

    it('es independiente del orden de insercion (Flow ordena alfabeticamente)', () => {
        const reordered = { email: 'a@b.cl', currency: 'CLP', apiKey: 'test-api-key', commerceOrder: 'EVA-1', amount: 1990 }
        expect(signFlowParams(reordered, SECRET)).toBe(GOLDEN)
    })

    it('EXCLUYE `s` de la cadena firmada (un `s` presente no altera la firma)', () => {
        const withS = { ...PARAMS, s: 'firma-vieja-que-no-cuenta' }
        expect(signFlowParams(withS, SECRET)).toBe(GOLDEN)
    })

    it('serializa los numeros como texto (amount 1990 === "1990")', () => {
        const asString = { ...PARAMS, amount: '1990' }
        expect(signFlowParams(asString, SECRET)).toBe(GOLDEN)
    })

    it('cambia si cambia el secret (la firma depende del secretKey)', () => {
        expect(signFlowParams(PARAMS, 'otro-secret')).not.toBe(GOLDEN)
    })

    it('cambia si cambia cualquier valor (integridad)', () => {
        expect(signFlowParams({ ...PARAMS, amount: 2000 }, SECRET)).not.toBe(GOLDEN)
    })

    it('buildSignedFlowBody incluye todos los params + `s` firmado', () => {
        const body = buildSignedFlowBody(PARAMS, SECRET)
        const usp = new URLSearchParams(body)
        expect(usp.get('apiKey')).toBe('test-api-key')
        expect(usp.get('amount')).toBe('1990')
        expect(usp.get('commerceOrder')).toBe('EVA-1')
        expect(usp.get('s')).toBe(GOLDEN)
    })

    describe('verifyFlowSignature', () => {
        it('acepta la firma correcta', () => {
            expect(verifyFlowSignature(PARAMS, GOLDEN, SECRET)).toBe(true)
        })
        it('rechaza una firma manipulada (mismo largo)', () => {
            const tampered = 'b' + GOLDEN.slice(1)
            expect(verifyFlowSignature(PARAMS, tampered, SECRET)).toBe(false)
        })
        it('rechaza una firma de largo distinto sin explotar', () => {
            expect(verifyFlowSignature(PARAMS, 'corta', SECRET)).toBe(false)
        })
        it('rechaza si el payload fue alterado', () => {
            expect(verifyFlowSignature({ ...PARAMS, amount: 9999 }, GOLDEN, SECRET)).toBe(false)
        })
    })
})
