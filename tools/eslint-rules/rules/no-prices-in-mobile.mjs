import { COPY_NODES, copyText } from '../lib/text-nodes.mjs'

/**
 * Reemplaza a `tests/mobile-no-prices.test.ts` (borrado el 2026-09-02).
 *
 * Compliance de tiendas (embudo-free-pro W5.5, decision cerrada del owner 21-08):
 * la app iOS no puede mostrar un precio, un link de compra ni un tier ajeno (la
 * venta vive en correo y web, guideline 3.1.1; Android admite UNA linea sin
 * link). El riesgo real no es que alguien escriba «$29.990» a mano: es que una
 * pantalla importe el catalogo entero y pinte `TIER_CONFIG.pro.monthlyPriceClp`
 * «para informar».
 *
 * Si algun dia mobile necesita un precio, la conversacion es de producto (IAP /
 * gatillos del SPEC), no un `// eslint-disable` suelto.
 */

/** Identificadores prohibidos: aparecer en CUALQUIER posicion ya es la fuga. */
const FORBIDDEN_NAMES = new Map([
    ['monthlyPriceClp', 'monthlyPriceClp (precio del catalogo)'],
    ['yearlyPriceClp', 'yearlyPriceClp (precio del catalogo)'],
    ['TIER_CONFIG', 'TIER_CONFIG (catalogo entero: arrastra precios)'],
])

/**
 * Patrones de texto prohibidos. Se miden sobre literales, template literals,
 * texto JSX, el raw de los literales numericos y los comentarios — igual que el
 * barrido textual que reemplazan.
 */
const FORBIDDEN_TEXT = [
    { pattern: /\$29\.990/, label: '$29.990 (precio literal de Pro)' },
    { pattern: /(?<!\d)29990(?!\d)/, label: '29990 (precio de Pro sin formatear)' },
    // `\b` para no cazar rutas legitimas («/mesociclo»); «$29.990/mes» y «/mes.» si caen.
    { pattern: /\/mes\b/, label: '«/mes» (sufijo de precio)' },
]

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'apps/mobile no habla de plata: ni precios del catalogo, ni el literal de Pro, ni el sufijo «/mes» (App Store 3.1.1).',
        },
        schema: [],
        messages: {
            forbiddenName: 'Precio filtrado a la app movil: {{label}}. La venta vive en correo y web (App Store 3.1.1).',
            forbiddenText: 'Precio filtrado a la app movil: {{label}}. La venta vive en correo y web (App Store 3.1.1).',
        },
    },
    create(context) {
        const sourceCode = context.sourceCode ?? context.getSourceCode()

        /** Reporta el primer patron de texto que matchee. */
        const checkText = (node, text) => {
            if (!text) return
            for (const { pattern, label } of FORBIDDEN_TEXT) {
                if (pattern.test(text)) {
                    context.report({ node, messageId: 'forbiddenText', data: { label } })
                    return
                }
            }
        }

        const checkTextAtLoc = (loc, text) => {
            if (!text) return
            for (const { pattern, label } of FORBIDDEN_TEXT) {
                if (pattern.test(text)) {
                    context.report({ loc, messageId: 'forbiddenText', data: { label } })
                    return
                }
            }
        }

        const visitors = {
            Identifier(node) {
                const label = FORBIDDEN_NAMES.get(node.name)
                if (label) context.report({ node, messageId: 'forbiddenName', data: { label } })
            },
            'Program:exit'() {
                for (const comment of sourceCode.getAllComments()) {
                    checkTextAtLoc(comment.loc, comment.value)
                }
            },
        }

        for (const type of COPY_NODES) {
            visitors[type] = (node) => {
                checkText(node, copyText(node))
            }
        }

        // Literales numericos: `29990` sin formatear.
        const literalVisitor = visitors.Literal
        visitors.Literal = (node) => {
            if (typeof node.value === 'number') {
                checkText(node, String(node.raw ?? node.value))
                return
            }
            literalVisitor(node)
        }

        return visitors
    },
}

export default rule
