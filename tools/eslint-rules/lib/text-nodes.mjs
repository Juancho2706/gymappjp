/**
 * Helpers compartidos por las reglas locales.
 *
 * Las reglas de este plugin reemplazan tests que leian el FUENTE como texto
 * (`readFileSync` + `expect(src).toContain(...)`). Al pasarlas a eslint la
 * afirmacion se hace sobre el AST, asi que hace falta un puñado de utilidades
 * para tratar de forma uniforme las tres formas en que un literal de copy puede
 * aparecer en un `.ts`/`.tsx`: string literal, pedazo de template literal y
 * texto JSX.
 */

/**
 * Devuelve el texto de un nodo que puede contener copy, o `null` si el nodo no
 * lo es. Cubre `Literal` (string), `TemplateElement` y `JSXText`.
 *
 * @param {import('estree').Node & { type: string, value?: unknown, cooked?: string }} node
 * @returns {string | null}
 */
export function copyText(node) {
    switch (node.type) {
        case 'Literal':
            return typeof node.value === 'string' ? node.value : null
        case 'TemplateElement':
            return node.value?.cooked ?? node.value?.raw ?? null
        case 'JSXText':
            return typeof node.value === 'string' ? node.value : null
        default:
            return null
    }
}

/** Visitor keys de los tres nodos que puede devolver `copyText`. */
export const COPY_NODES = ['Literal', 'TemplateElement', 'JSXText']

/**
 * `true` si el nodo es una llamada a la funcion `name` (`name(...)`).
 *
 * @param {any} node
 * @param {string} name
 */
export function isCallTo(node, name) {
    return (
        node?.type === 'CallExpression' &&
        node.callee?.type === 'Identifier' &&
        node.callee.name === name
    )
}

/**
 * Nombre invocado de una `CallExpression`, ya sea `foo()` o `obj.foo()`.
 * Devuelve `null` para calls computadas o mas exoticas.
 *
 * @param {any} node
 * @returns {string | null}
 */
export function calleeName(node) {
    if (node?.type !== 'CallExpression') return null
    const callee = node.callee
    if (callee?.type === 'Identifier') return callee.name
    if (callee?.type === 'MemberExpression' && !callee.computed && callee.property?.type === 'Identifier') {
        return callee.property.name
    }
    return null
}

/**
 * Nombre de un elemento JSX (`<Foo />` -> `Foo`, `<a.b />` -> `a.b`).
 *
 * @param {any} nameNode
 * @returns {string | null}
 */
export function jsxName(nameNode) {
    if (!nameNode) return null
    if (nameNode.type === 'JSXIdentifier') return nameNode.name
    if (nameNode.type === 'JSXMemberExpression') {
        const object = jsxName(nameNode.object)
        const property = jsxName(nameNode.property)
        return object && property ? `${object}.${property}` : null
    }
    return null
}

/** Ruta del archivo en curso normalizada a separadores POSIX (Windows incluido). */
export function posixFilename(context) {
    return context.filename.split('\\').join('/')
}
