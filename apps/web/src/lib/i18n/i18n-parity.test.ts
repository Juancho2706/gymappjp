import { describe, it, expect } from 'vitest'
import es from './es.json'
import en from './en.json'

/**
 * Paridad i18n GLOBAL es/en (plan 02 / F4.2).
 *
 * TODA key de `es.json` debe existir en `en.json` y viceversa — el arbol
 * completo, no solo `landing.*`. Los json son planos (claves con punto, valores
 * string), asi que comparamos los sets de keys de primer nivel directamente.
 *
 * Ataja el bug clasico de "string crudo en EN" (key faltante en un idioma) en
 * cualquier superficie, no solo la landing. Antes de este test no existia red.
 */

const esKeys = Object.keys(es as Record<string, string>)
const enKeys = Object.keys(en as Record<string, string>)

describe('i18n parity (es <-> en)', () => {
    it('ambos diccionarios son planos (todos los valores son string)', () => {
        const nonStringEs = esKeys.filter((k) => typeof (es as Record<string, unknown>)[k] !== 'string')
        const nonStringEn = enKeys.filter((k) => typeof (en as Record<string, unknown>)[k] !== 'string')
        expect(nonStringEs, `es.json keys no-string: ${nonStringEs.join(', ')}`).toEqual([])
        expect(nonStringEn, `en.json keys no-string: ${nonStringEn.join(', ')}`).toEqual([])
    })

    it('toda key de es.json existe en en.json', () => {
        const enSet = new Set(enKeys)
        const missingInEn = esKeys.filter((k) => !enSet.has(k)).sort()
        expect(missingInEn, `keys presentes en es.json pero ausentes en en.json: ${missingInEn.join(', ')}`).toEqual([])
    })

    it('toda key de en.json existe en es.json', () => {
        const esSet = new Set(esKeys)
        const missingInEs = enKeys.filter((k) => !esSet.has(k)).sort()
        expect(missingInEs, `keys presentes en en.json pero ausentes en es.json: ${missingInEs.join(', ')}`).toEqual([])
    })

    it('ambos diccionarios tienen exactamente el mismo conjunto de keys', () => {
        expect(esKeys.length).toBe(enKeys.length)
        expect([...esKeys].sort()).toEqual([...enKeys].sort())
    })
})
