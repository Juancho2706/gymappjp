/**
 * Plugin eslint LOCAL (sin dependencias nuevas: es un objeto plano que la flat
 * config inyecta en `plugins`).
 *
 * Por que existe (higiene 2026-09-02): habia ~20 tests de vitest que leian
 * archivos FUENTE como texto (`readFileSync` + `expect(src).toContain(...)`)
 * para afirmar reglas sobre el codigo — precios que no pueden entrar a la app
 * movil, copy que no puede duplicarse, shells de marca que no pueden montarse.
 * Eso es exactamente el trabajo de un linter: corre sobre el archivo que edito,
 * marca la LINEA culpable y no paga el costo de arrancar el runner. Los tests
 * que verifican CONFIGURACION (vercel.json, app.json, assets, geometria, keys
 * i18n) se quedaron como tests: ahi no hay AST que mirar.
 *
 * Cada regla documenta en su cabecera que test reemplazo.
 *
 * Convencion: todas se cablean como `local/<nombre>` y viven acotadas por
 * `files:` al archivo o al arbol que cubria el test viejo — nunca globales.
 */
import hechoConEvaMetadata from './rules/hecho-con-eva-metadata.mjs'
import noNativewindVarsCopy from './rules/no-nativewind-vars-copy.mjs'
import noPricesInMobile from './rules/no-prices-in-mobile.mjs'
import registerFreeTierContract from './rules/register-free-tier-contract.mjs'
import storePlanCaption from './rules/store-plan-caption.mjs'
import studentLoginLoadingUnbranded from './rules/student-login-loading-unbranded.mjs'
import subscriptionModulesIncluded from './rules/subscription-modules-included.mjs'
import subscriptionOpenInAppGate from './rules/subscription-open-in-app-gate.mjs'
import subscriptionPriceSuffix from './rules/subscription-price-suffix.mjs'

/** @type {import('eslint').ESLint.Plugin} */
const localRules = {
    meta: { name: 'eslint-plugin-eva-local', version: '1.0.0' },
    rules: {
        'hecho-con-eva-metadata': hechoConEvaMetadata,
        'no-nativewind-vars-copy': noNativewindVarsCopy,
        'no-prices-in-mobile': noPricesInMobile,
        'register-free-tier-contract': registerFreeTierContract,
        'store-plan-caption': storePlanCaption,
        'student-login-loading-unbranded': studentLoginLoadingUnbranded,
        'subscription-modules-included': subscriptionModulesIncluded,
        'subscription-open-in-app-gate': subscriptionOpenInAppGate,
        'subscription-price-suffix': subscriptionPriceSuffix,
    },
}

export default localRules
