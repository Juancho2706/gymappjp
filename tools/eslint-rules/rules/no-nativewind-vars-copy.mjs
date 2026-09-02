import { calleeName, isCallTo } from '../lib/text-nodes.mjs'

/**
 * Reemplaza al primer `describe` de `tests/mobile/brand-vars-identity.test.ts`
 * (el resto de ese archivo sigue siendo test: compara valores, no fuente).
 *
 * El white-label de CLASES (bg-sport-*, text-sport-*, bg-cta-fill, bg-primary…)
 * depende de que el objeto que devuelve `vars()` de NativeWind llegue INTACTO al
 * `style` de la <View> proveedora.
 *
 * `vars()` devuelve un objeto VACIO y guarda el juego de variables en un WeakMap
 * global claveado por la IDENTIDAD de ese objeto (react-native-css-interop,
 * `runtime/native/api.ts` → `opaqueStyles.set(style, …)`). Cualquier copia
 * —`{ ...vars(x) }`, `Object.assign({}, vars(x))`, `StyleSheet.flatten`— pierde
 * la clave del WeakMap y deja al subarbol SIN una sola variable: la app entera
 * cae a los tokens estaticos de `global.css`, o sea azul EVA en cualquier marca.
 * Es exactamente el QA del owner del 22-08 (marca rosa por preset, app azul).
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'No copiar el resultado de vars() de NativeWind: la copia pierde la clave del WeakMap y mata el white-label.',
        },
        schema: [],
        messages: {
            copied:
                'No copies el resultado de vars() ({{how}}): NativeWind guarda las variables en un WeakMap claveado por la IDENTIDAD del objeto, y la copia deja al subarbol sin marca (azul EVA en cualquier cuenta). Pasa `vars(x)` tal cual al `style`.',
        },
    },
    create(context) {
        const reportSpread = (node) => {
            if (isCallTo(node.argument, 'vars')) {
                context.report({ node, messageId: 'copied', data: { how: '`...vars(…)`' } })
            }
        }

        return {
            // `{ ...vars(x) }` y `[...vars(x)]`
            SpreadElement: reportSpread,
            // `<View style={{ ...vars(x) }} />` usa SpreadElement; `{...vars(x)}` como
            // atributo JSX es un nodo propio.
            JSXSpreadAttribute: reportSpread,
            // Parsers legacy.
            ExperimentalSpreadProperty: reportSpread,
            CallExpression(node) {
                const name = calleeName(node)
                if (name !== 'assign' && name !== 'flatten') return
                if (!node.arguments.some((arg) => isCallTo(arg, 'vars'))) return
                context.report({
                    node,
                    messageId: 'copied',
                    data: { how: name === 'assign' ? '`Object.assign(…, vars(…))`' : '`flatten(vars(…))`' },
                })
            },
        }
    },
}

export default rule
