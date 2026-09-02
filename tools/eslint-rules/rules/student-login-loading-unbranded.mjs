import { jsxName } from '../lib/text-nodes.mjs'

/**
 * Reemplaza al segundo `it` de
 * `apps/web/src/app/c/[coach_slug]/login/loading.test.tsx` (el primero sigue
 * siendo test: renderiza el componente).
 *
 * El login del alumno NO se cubre con el splash/loader de marca (owner
 * 2026-09-02: entrar a `/c/josefit/login` mostraba primero una pantalla de carga
 * con el color del coach). Criterio espejado de RN: el splash de marca vive en
 * la entrada CON sesion (`SplashGate`) y encima del dashboard
 * (`DashboardSplashOverlay`), nunca antes del formulario de login.
 */

const BRAND_SHELLS = new Set(['BrandClientLoadingShell', 'ClientLoadingShell', 'EvaRouteLoader'])

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'El loading del login del alumno no monta shells de marca: el loader con color del coach es para superficies ya autenticadas.',
        },
        schema: [],
        messages: {
            branded:
                '`{{name}}` pinta la marca del coach ANTES del formulario de login (owner 2026-09-02, «loader naranja» en /c/josefit/login). El loader de marca es para superficies autenticadas; este fallback se queda desnudo.',
        },
    },
    create(context) {
        const report = (node, name) => context.report({ node, messageId: 'branded', data: { name } })

        return {
            JSXOpeningElement(node) {
                const name = jsxName(node.name)
                if (name && BRAND_SHELLS.has(name)) report(node, name)
            },
            ImportSpecifier(node) {
                const name = node.local?.name
                if (name && BRAND_SHELLS.has(name)) report(node, name)
            },
            ImportDefaultSpecifier(node) {
                const name = node.local?.name
                if (name && BRAND_SHELLS.has(name)) report(node, name)
            },
        }
    },
}

export default rule
