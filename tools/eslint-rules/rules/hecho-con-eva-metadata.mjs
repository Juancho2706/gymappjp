/**
 * Reemplaza al `it('la page es indexable y declara su canonica')` de
 * `apps/web/src/app/hecho-con-eva/hecho-con-eva.test.tsx` (el resto del archivo
 * sigue siendo test: renderiza el arbol real y busca plata en el HTML).
 *
 * `/hecho-con-eva` es el destino del sello «Hecho con EVA» (`getEvaBadgeUrl`,
 * `packages/tiers`) y la UNICA pagina web a la que la app movil manda al alumno.
 * Es indexable a proposito: contenido real y puerta de entrada organica. Si
 * alguien le pone `robots: { index: false }` o le mueve la canonica, el sello
 * sigue funcionando pero la pagina desaparece de Google sin que nada avise.
 */

const CANONICAL_PATH = '/hecho-con-eva'

/** Nombre de la key de una `Property`, sea identificador o string. */
function propertyName(property) {
    if (property?.type !== 'Property') return null
    if (property.key?.type === 'Identifier' && !property.computed) return property.key.name
    if (property.key?.type === 'Literal' && typeof property.key.value === 'string') return property.key.value
    return null
}

/** Busca una `Property` por nombre dentro de un `ObjectExpression`. */
function findProperty(objectExpression, name) {
    if (objectExpression?.type !== 'ObjectExpression') return null
    return objectExpression.properties.find((property) => propertyName(property) === name) ?? null
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'La landing del sello declara su canonica /hecho-con-eva y se mantiene indexable.',
        },
        schema: [],
        messages: {
            missingCanonical:
                'Falta la canonica `{{path}}` en `alternates` de la metadata: el sello de la app apunta a esta ruta y sin canonica la pagina compite consigo misma.',
            notIndexable:
                'Falta `index: true` en `robots` de la metadata: /hecho-con-eva es indexable a proposito (puerta de entrada organica del sello).',
        },
    },
    create(context) {
        let hasCanonical = false
        let isIndexable = false

        return {
            ObjectExpression(node) {
                const alternates = findProperty(node, 'alternates')
                if (alternates) {
                    const canonical = findProperty(alternates.value, 'canonical')
                    if (canonical?.value?.type === 'Literal' && canonical.value.value === CANONICAL_PATH) {
                        hasCanonical = true
                    }
                }

                const robots = findProperty(node, 'robots')
                if (robots) {
                    const index = findProperty(robots.value, 'index')
                    if (index?.value?.type === 'Literal' && index.value.value === true) {
                        isIndexable = true
                    }
                }
            },
            'Program:exit'(node) {
                if (!hasCanonical) {
                    context.report({ node, messageId: 'missingCanonical', data: { path: CANONICAL_PATH } })
                }
                if (!isIndexable) context.report({ node, messageId: 'notIndexable' })
            },
        }
    },
}

export default rule
