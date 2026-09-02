/**
 * Reemplaza a los dos primeros `it` de
 * `apps/web/src/app/coach/subscription/_components/subscription-price-suffix.test.ts`
 * (los otros dos siguen siendo test: ejercitan la aritmetica de los helpers).
 *
 * W5.4 del embudo Free→Pro. La card de «Cambiar plan» pinta
 * `getTierPriceClp(tier, ciclo)`, que devuelve el TOTAL del periodo — y el
 * sufijo estaba escrito a mano como «/mes». Con el ciclo Anual seleccionado, la
 * card de Pro leia «$287.904 /mes»: el total del año presentado como
 * mensualidad. Un coach que decide con ese numero decide con un precio falso.
 *
 * Ademas, el sufijo tiene que salir del MISMO ciclo con el que se calculo el
 * precio (`priceCycle`, no `selectedCycle`): un tier sin ese ciclo (free)
 * mostraria un sufijo que no corresponde al numero de al lado.
 */

const SUFFIX_TABLE = 'BILLING_CYCLE_PRICE_SUFFIX'
const PRICE_CYCLE = 'priceCycle'
const PRICE_FN = 'getTierPriceClp'

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'El sufijo del precio de la card «Cambiar plan» sale de BILLING_CYCLE_PRICE_SUFFIX[priceCycle], nunca hardcodeado.',
        },
        schema: [],
        messages: {
            hardcodedSuffix:
                'Sufijo de precio hardcodeado («{{text}}»): `getTierPriceClp` devuelve el TOTAL del periodo, asi que con Anual esto miente ($287.904 /mes). Usa BILLING_CYCLE_PRICE_SUFFIX[priceCycle].',
            missingSuffixTable:
                'Falta `BILLING_CYCLE_PRICE_SUFFIX[priceCycle]` en el markup: sin el, el sufijo vuelve a estar escrito a mano y se despega del ciclo.',
            missingPriceCycle:
                'Falta `const price = getTierPriceClp(tier, priceCycle)`: si el precio se calcula con `selectedCycle`, el numero y el sufijo dejan de venir del mismo ciclo.',
        },
    },
    create(context) {
        let hasSuffixTable = false
        let hasPriceFromPriceCycle = false

        return {
            // `<span …> /mes</span>` — el sufijo escrito a mano en el markup.
            JSXText(node) {
                const match = /\/(mes|año|ano)\b/.exec(node.value ?? '')
                if (match) {
                    context.report({ node, messageId: 'hardcodedSuffix', data: { text: match[0] } })
                }
            },
            // `BILLING_CYCLE_PRICE_SUFFIX[priceCycle]`
            MemberExpression(node) {
                if (
                    node.computed &&
                    node.object?.type === 'Identifier' &&
                    node.object.name === SUFFIX_TABLE &&
                    node.property?.type === 'Identifier' &&
                    node.property.name === PRICE_CYCLE
                ) {
                    hasSuffixTable = true
                }
            },
            // `const price = getTierPriceClp(tier, priceCycle)`
            VariableDeclarator(node) {
                if (node.id?.type !== 'Identifier' || node.id.name !== 'price') return
                const init = node.init
                if (init?.type !== 'CallExpression') return
                if (init.callee?.type !== 'Identifier' || init.callee.name !== PRICE_FN) return
                const last = init.arguments[init.arguments.length - 1]
                if (last?.type === 'Identifier' && last.name === PRICE_CYCLE) {
                    hasPriceFromPriceCycle = true
                }
            },
            'Program:exit'(node) {
                if (!hasSuffixTable) context.report({ node, messageId: 'missingSuffixTable' })
                if (!hasPriceFromPriceCycle) context.report({ node, messageId: 'missingPriceCycle' })
            },
        }
    },
}

export default rule
