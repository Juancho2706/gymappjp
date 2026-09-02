import { COPY_NODES, copyText } from '../lib/text-nodes.mjs'

/**
 * Reemplaza a
 * `apps/web/src/app/coach/subscription/_components/subscription-modules-included.test.ts`
 * (borrado el 2026-09-02).
 *
 * QA del owner 02-09 (OB2). El bloque «Modulos incluidos» de la pantalla de
 * suscripcion pintaba candado gris y «Estos modulos vienen incluidos en
 * cualquier plan pago» cuando `hasActivePaidPlan` era falso — es decir, a TODO
 * coach free. Contradice la regla vigente (D1): todo esta incluido en todos los
 * planes y lo unico que cambia entre ellos es el CUPO de alumnos.
 *
 * `hasActivePaidPlan` sigue vivo para el cambio de plan (prorrateo, gate de
 * Flow): lo que no puede volver es un `included` derivado de el.
 */

const FORBIDDEN_COPY = [
    'incluidos en cualquier plan pago',
    'Elige un plan abajo para activarlos',
]

const REQUIRED_COPY = 'Vienen incluidos en todos los planes'

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Los modulos vienen incluidos en TODOS los planes: ni copy que los ate a un plan pago ni `included` derivado de hasActivePaidPlan.',
        },
        schema: [],
        messages: {
            paidPlanCopy:
                'Copy que ata los modulos a un plan pago («{{text}}»). Desde D1 todo esta incluido en todos los planes; lo unico que cambia es el CUPO.',
            gatedIncluded:
                '`included` derivado de `hasActivePaidPlan` vuelve a pintar el candado gris a todo coach free (QA del owner 02-09, OB2).',
            missingCopy:
                'Falta el copy «{{text}}» en el bloque «Modulos incluidos»: es lo que dice que no se compran por separado.',
        },
    },
    create(context) {
        let hasRequiredCopy = false

        const visitors = {
            VariableDeclarator(node) {
                if (
                    node.id?.type === 'Identifier' &&
                    node.id.name === 'included' &&
                    node.init?.type === 'Identifier' &&
                    node.init.name === 'hasActivePaidPlan'
                ) {
                    context.report({ node, messageId: 'gatedIncluded' })
                }
            },
            'Program:exit'(node) {
                if (!hasRequiredCopy) {
                    context.report({ node, messageId: 'missingCopy', data: { text: REQUIRED_COPY } })
                }
            },
        }

        for (const type of COPY_NODES) {
            visitors[type] = (node) => {
                const text = copyText(node)
                if (!text) return
                if (text.includes(REQUIRED_COPY)) hasRequiredCopy = true
                for (const forbidden of FORBIDDEN_COPY) {
                    if (text.includes(forbidden)) {
                        context.report({ node, messageId: 'paidPlanCopy', data: { text: forbidden } })
                    }
                }
            }
        }

        return visitors
    },
}

export default rule
