import { jsxName } from '../lib/text-nodes.mjs'

/**
 * Reemplaza al `describe('el contrato del submit no se movio')` de
 * `apps/web/src/app/(auth)/register/_components/register-sin-precios.test.tsx`
 * (el resto del archivo sigue siendo test: renderiza los pasos reales y mide el
 * HTML, que es donde se ve un precio que entre por un helper importado).
 *
 * `/register?tier=free` es el aterrizaje del sello «Hecho con EVA» de la app del
 * alumno. Dos cosas no se pueden mover sin romper ese embudo:
 *   1. el form manda el tier elegido en `subscription_tier` (+ `billing_cycle`);
 *   2. el modo SIN PRECIOS se enciende SOLO con `?tier=free` explicito — llegar
 *      sin `?tier` sigue mostrando la grilla, que es la vitrina del alta web.
 */

const HIDDEN_INPUTS = [
    { name: 'subscription_tier', value: 'tier' },
    { name: 'billing_cycle', value: 'billingCycle' },
]

/** Valor de un atributo JSX string (`name="x"`), o `null`. */
function stringAttr(attributes, attrName) {
    for (const attr of attributes ?? []) {
        if (attr.type !== 'JSXAttribute' || jsxName(attr.name) !== attrName) continue
        if (attr.value?.type === 'Literal' && typeof attr.value.value === 'string') return attr.value.value
    }
    return null
}

/** Nombre del identificador de `value={foo}`, o `null`. */
function expressionAttrIdentifier(attributes, attrName) {
    for (const attr of attributes ?? []) {
        if (attr.type !== 'JSXAttribute' || jsxName(attr.name) !== attrName) continue
        const expression = attr.value?.type === 'JSXExpressionContainer' ? attr.value.expression : null
        if (expression?.type === 'Identifier') return expression.name
    }
    return null
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'El alta conserva su contrato: hidden inputs del tier/ciclo y el modo sin precios encendido solo por ?tier=free.',
        },
        schema: [],
        messages: {
            missingHiddenInput:
                'Falta el input oculto `{{name}}` con el valor `{{value}}`: es lo que le lleva el plan elegido al server action del alta.',
            missingFreeOnlyGate:
                'Falta `setFreeOnly(rawTier === \'free\')`: el modo sin precios tiene que encenderse SOLO con `?tier=free` explicito (llegar sin `?tier` muestra la grilla).',
        },
    },
    create(context) {
        const seenInputs = new Set()
        let hasFreeOnlyGate = false

        return {
            JSXOpeningElement(node) {
                if (jsxName(node.name) !== 'input') return
                if (stringAttr(node.attributes, 'type') !== 'hidden') return
                const name = stringAttr(node.attributes, 'name')
                const value = expressionAttrIdentifier(node.attributes, 'value')
                const expected = HIDDEN_INPUTS.find((input) => input.name === name)
                if (expected && expected.value === value) seenInputs.add(name)
            },
            CallExpression(node) {
                if (node.callee?.type !== 'Identifier' || node.callee.name !== 'setFreeOnly') return
                const [arg] = node.arguments
                if (
                    arg?.type === 'BinaryExpression' &&
                    arg.operator === '===' &&
                    arg.left?.type === 'Identifier' &&
                    arg.left.name === 'rawTier' &&
                    arg.right?.type === 'Literal' &&
                    arg.right.value === 'free'
                ) {
                    hasFreeOnlyGate = true
                }
            },
            'Program:exit'(node) {
                for (const input of HIDDEN_INPUTS) {
                    if (!seenInputs.has(input.name)) {
                        context.report({ node, messageId: 'missingHiddenInput', data: input })
                    }
                }
                if (!hasFreeOnlyGate) context.report({ node, messageId: 'missingFreeOnlyGate' })
            },
        }
    },
}

export default rule
