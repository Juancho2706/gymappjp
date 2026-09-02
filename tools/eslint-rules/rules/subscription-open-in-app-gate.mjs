import { jsxName } from '../lib/text-nodes.mjs'

/**
 * Reemplaza al segundo `describe` de
 * `apps/web/src/app/coach/subscription/_components/OpenInAppCard.test.tsx` (el
 * primero sigue siendo test: renderiza la tarjeta y mide su copy).
 *
 * W6.7 del embudo Free→Pro. `OpenInAppCard` es el acuse de recibo del pago: solo
 * puede aparecer DESPUES de un pago confirmado (`?upgrade=success`). Si se
 * montara siempre, cualquier coach que abriera «Mi plan» leeria que acaba de
 * cambiar de plan. El flag nace apagado y lo enciende el retorno del checkout.
 */

const FLAG = 'justChangedPlan'
const SETTER = 'setJustChangedPlan'
const CARD = 'OpenInAppCard'

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'OpenInAppCard se monta solo tras un pago confirmado: gateada por justChangedPlan, que nace apagado.',
        },
        schema: [],
        messages: {
            missingGate:
                'Falta `{{flag}} ? <{{card}} /> : null`: sin el gate la tarjeta de «abre la app» se le muestra a cualquier coach que entre a Mi plan, no solo al que acaba de pagar.',
            missingSetter:
                'Falta `{{setter}}(true)`: es el retorno `?upgrade=success` del checkout el que enciende la tarjeta.',
            missingInitialState:
                'Falta `const [{{flag}}, {{setter}}] = useState(false)`: el flag tiene que NACER apagado (abrir la pantalla sin venir del checkout no lo enciende).',
        },
    },
    create(context) {
        let hasGate = false
        let hasSetter = false
        let hasInitialState = false

        return {
            ConditionalExpression(node) {
                if (node.test?.type !== 'Identifier' || node.test.name !== FLAG) return
                const consequent = node.consequent
                if (
                    consequent?.type === 'JSXElement' &&
                    jsxName(consequent.openingElement?.name) === CARD
                ) {
                    hasGate = true
                }
            },
            CallExpression(node) {
                if (node.callee?.type !== 'Identifier' || node.callee.name !== SETTER) return
                const [arg] = node.arguments
                if (arg?.type === 'Literal' && arg.value === true) hasSetter = true
            },
            VariableDeclarator(node) {
                if (node.id?.type !== 'ArrayPattern') return
                const [flag, setter] = node.id.elements
                if (flag?.type !== 'Identifier' || flag.name !== FLAG) return
                if (setter?.type !== 'Identifier' || setter.name !== SETTER) return
                const init = node.init
                if (init?.type !== 'CallExpression') return
                if (init.callee?.type !== 'Identifier' || init.callee.name !== 'useState') return
                const [initial] = init.arguments
                if (initial?.type === 'Literal' && initial.value === false) hasInitialState = true
            },
            'Program:exit'(node) {
                if (!hasGate) {
                    context.report({ node, messageId: 'missingGate', data: { flag: FLAG, card: CARD } })
                }
                if (!hasSetter) {
                    context.report({ node, messageId: 'missingSetter', data: { setter: SETTER } })
                }
                if (!hasInitialState) {
                    context.report({
                        node,
                        messageId: 'missingInitialState',
                        data: { flag: FLAG, setter: SETTER },
                    })
                }
            },
        }
    },
}

export default rule
