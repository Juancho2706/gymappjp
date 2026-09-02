import { COPY_NODES, copyText, posixFilename } from '../lib/text-nodes.mjs'

/**
 * Reemplaza a `tests/mobile/store-copy.test.ts` (borrado el 2026-09-02).
 *
 * Guard de la LINEA CANONICA de tienda (embudo Free→Pro, W6). Hermano de
 * `no-prices-in-mobile`, pero para un riesgo distinto: aquel impide que un
 * PRECIO se filtre a la app; este impide que la unica frase que Android si
 * admite («Los cambios de plan se hacen en eva-app.cl») se DUPLIQUE en
 * variantes escritas a mano por cada pantalla.
 *
 * Por que importa: `verify-email.tsx` decia «Cambia de plan cuando quieras desde
 * eva-app.cl» —una segunda linea de compliance, distinta de la canonica, en un
 * archivo que nadie asocia con las tiendas—. Con dos o tres de esas, ajustar la
 * politica significa buscarlas a mano y una siempre se queda atras.
 *
 * La regla tiene dos caras:
 *  - en `apps/mobile/lib/client-cap.ts` (la fabrica de la frase) EXIGE la
 *    declaracion canonica;
 *  - en el resto de `apps/mobile` PROHIBE reescribirla.
 */

const CANONICAL_FILE = 'apps/mobile/lib/client-cap.ts'
const CANONICAL_NAME = 'STORE_PLAN_CHANGE_CAPTION'
const CANONICAL_VALUE = 'Los cambios de plan se hacen en eva-app.cl'

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'La linea de tienda vive UNA sola vez, en apps/mobile/lib/client-cap.ts; el resto de la app la importa.',
        },
        schema: [],
        messages: {
            duplicated:
                'Copy de tienda duplicado ({{what}}). Importa STORE_PLAN_CHANGE_CAPTION / storePlanChangeCaption de lib/client-cap.ts en vez de reescribir la frase.',
            missingCanonical:
                'Falta la declaracion canonica `export const {{name}} = \'{{value}}\'` en este archivo: es la fabrica de la linea de tienda y el resto de la app la importa de aca.',
        },
    },
    create(context) {
        const filename = posixFilename(context)

        // ── Cara A: la fabrica de la frase ────────────────────────────────────
        if (filename.endsWith(CANONICAL_FILE)) {
            let found = false
            return {
                VariableDeclarator(node) {
                    if (
                        node.id?.type === 'Identifier' &&
                        node.id.name === CANONICAL_NAME &&
                        node.init?.type === 'Literal' &&
                        node.init.value === CANONICAL_VALUE
                    ) {
                        found = true
                    }
                },
                'Program:exit'(node) {
                    if (!found) {
                        context.report({
                            node,
                            messageId: 'missingCanonical',
                            data: { name: CANONICAL_NAME, value: CANONICAL_VALUE },
                        })
                    }
                },
            }
        }

        // ── Cara B: el resto de la app ────────────────────────────────────────
        const visitors = {}
        for (const type of COPY_NODES) {
            visitors[type] = (node) => {
                const text = copyText(node)
                if (!text) return
                const lower = text.toLowerCase()
                if (lower.includes('cambios de plan')) {
                    context.report({
                        node,
                        messageId: 'duplicated',
                        data: { what: 'el literal «cambios de plan»' },
                    })
                    return
                }
                if (lower.includes('eva-app.cl') && lower.includes('plan')) {
                    context.report({
                        node,
                        messageId: 'duplicated',
                        data: { what: '«eva-app.cl» junto a «plan»' },
                    })
                }
            }
        }
        return visitors
    },
}

export default rule
