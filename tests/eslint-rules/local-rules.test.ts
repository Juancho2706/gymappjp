import { RuleTester } from 'eslint'
import { describe } from 'vitest'

import local from '../../tools/eslint-rules/index.mjs'

/**
 * Tests de las reglas eslint LOCALES (higiene 2026-09-02).
 *
 * Estas reglas reemplazaron a los guards de vitest que leian el fuente como
 * texto (`readFileSync` + `toContain`). Cada bloque de abajo repite, en forma de
 * `RuleTester`, lo que afirmaba el test viejo: un caso VALIDO igual al codigo que
 * hoy hay en el repo y uno INVALIDO igual a la regresion que el test cazaba.
 *
 * Los samples se escriben en JS/JSX (no TS) a proposito: el parser por defecto
 * de eslint alcanza para los nodos que estas reglas miran (Literal, JSXText,
 * MemberExpression, VariableDeclarator) y asi el test no depende de que parser
 * arrastre `eslint-config-next`.
 */
const ruleTester = new RuleTester({
    languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        parserOptions: { ecmaFeatures: { jsx: true } },
    },
})

const rules = local.rules as Record<string, import('eslint').Rule.RuleModule>

describe('eslint local · no-prices-in-mobile (← tests/mobile-no-prices.test.ts)', () => {
    ruleTester.run('no-prices-in-mobile', rules['no-prices-in-mobile'], {
        valid: [
            // El cupo si viaja a la app: lo que no viaja es la plata.
            { code: "import { getTierMaxClients } from './coach-tiers'\nconst max = getTierMaxClients('pro')" },
            // «/mesociclo» no es un sufijo de precio: el patron exige limite de palabra.
            { code: "const route = '/mesociclo/actual'" },
        ],
        invalid: [
            {
                code: 'const price = tier.monthlyPriceClp',
                errors: [{ messageId: 'forbiddenName' }],
            },
            {
                code: "const features = TIER_CONFIG[tier].features",
                errors: [{ messageId: 'forbiddenName' }],
            },
            {
                code: "const copy = 'Pro por $29.990 al mes'",
                errors: [{ messageId: 'forbiddenText' }],
            },
            {
                code: 'const clp = 29990',
                errors: [{ messageId: 'forbiddenText' }],
            },
            {
                code: 'const Card = () => <Text>$29.990/mes</Text>',
                errors: [{ messageId: 'forbiddenText' }],
            },
            {
                // El barrido textual que reemplaza tampoco perdonaba los comentarios.
                code: '// el plan cuesta $29.990\nexport const x = 1',
                errors: [{ messageId: 'forbiddenText' }],
            },
        ],
    })
})

describe('eslint local · store-plan-caption (← tests/mobile/store-copy.test.ts)', () => {
    ruleTester.run('store-plan-caption', rules['store-plan-caption'], {
        valid: [
            {
                // Cualquier pantalla: importa la frase, no la reescribe.
                filename: 'apps/mobile/app/coach/settings.tsx',
                code: "import { STORE_PLAN_CHANGE_CAPTION } from '../../lib/client-cap'\nconst caption = STORE_PLAN_CHANGE_CAPTION",
            },
            {
                // La fabrica: declara la frase canonica.
                filename: 'apps/mobile/lib/client-cap.ts',
                code: "export const STORE_PLAN_CHANGE_CAPTION = 'Los cambios de plan se hacen en eva-app.cl'",
            },
        ],
        invalid: [
            {
                // La regresion real de `verify-email.tsx`.
                filename: 'apps/mobile/app/(auth)/verify-email.tsx',
                code: "const caption = 'Cambia de plan cuando quieras desde eva-app.cl'",
                errors: [{ messageId: 'duplicated' }],
            },
            {
                filename: 'apps/mobile/components/PlanCard.tsx',
                code: "const Card = () => <Text>Los cambios de plan se hacen en la web</Text>",
                errors: [{ messageId: 'duplicated' }],
            },
            {
                filename: 'apps/mobile/lib/client-cap.ts',
                code: "export const STORE_PLAN_CHANGE_CAPTION = 'Cambia tu plan en la web'",
                errors: [{ messageId: 'missingCanonical' }],
            },
        ],
    })
})

describe('eslint local · no-nativewind-vars-copy (← tests/mobile/brand-vars-identity.test.ts)', () => {
    ruleTester.run('no-nativewind-vars-copy', rules['no-nativewind-vars-copy'], {
        valid: [
            { code: 'const Provider = ({ theme }) => <View style={vars(theme)} />' },
            { code: 'const style = [vars(theme), styles.root]' },
        ],
        invalid: [
            {
                code: 'const style = { ...vars(theme) }',
                errors: [{ messageId: 'copied' }],
            },
            {
                code: 'const style = Object.assign({}, vars(theme))',
                errors: [{ messageId: 'copied' }],
            },
            {
                code: 'const style = StyleSheet.flatten(vars(theme))',
                errors: [{ messageId: 'copied' }],
            },
        ],
    })
})

describe('eslint local · student-login-loading-unbranded (← c/[coach_slug]/login/loading.test.tsx)', () => {
    ruleTester.run('student-login-loading-unbranded', rules['student-login-loading-unbranded'], {
        valid: [
            {
                code: 'export default function LoginLoading() {\n  return <div className="min-h-dvh w-full bg-surface-app"><span className="sr-only">Cargando…</span></div>\n}',
            },
        ],
        invalid: [
            {
                code: 'export default function LoginLoading() {\n  return <BrandClientLoadingShell />\n}',
                errors: [{ messageId: 'branded' }],
            },
        ],
    })
})

describe('eslint local · subscription-modules-included (← subscription-modules-included.test.ts)', () => {
    ruleTester.run('subscription-modules-included', rules['subscription-modules-included'], {
        valid: [
            {
                code: 'const Section = () => <p>Vienen incluidos en todos los planes, sin costo extra.</p>',
            },
        ],
        invalid: [
            {
                code: 'const Section = () => <p>Estos módulos vienen incluidos en cualquier plan pago</p>',
                // Orden por posicion: `missingCopy` se reporta sobre `Program` (1:1).
                errors: [{ messageId: 'missingCopy' }, { messageId: 'paidPlanCopy' }],
            },
            {
                code: 'const included = hasActivePaidPlan\nconst Section = () => <p>Vienen incluidos en todos los planes</p>',
                errors: [{ messageId: 'gatedIncluded' }],
            },
        ],
    })
})

describe('eslint local · subscription-price-suffix (← subscription-price-suffix.test.ts)', () => {
    const OK = [
        'const price = getTierPriceClp(tier, priceCycle)',
        'const Card = () => <span>{BILLING_CYCLE_PRICE_SUFFIX[priceCycle]}</span>',
    ].join('\n')

    ruleTester.run('subscription-price-suffix', rules['subscription-price-suffix'], {
        valid: [{ code: OK }],
        invalid: [
            {
                // La regresion: «$287.904 /mes» con el ciclo Anual.
                code: `${OK}\nconst Suffix = () => <span className="text-muted"> /mes</span>`,
                errors: [{ messageId: 'hardcodedSuffix' }],
            },
            {
                // El precio sale de `selectedCycle` y el sufijo de `priceCycle`: se despegan.
                code: 'const price = getTierPriceClp(tier, selectedCycle)\nconst Card = () => <span>{BILLING_CYCLE_PRICE_SUFFIX[priceCycle]}</span>',
                errors: [{ messageId: 'missingPriceCycle' }],
            },
        ],
    })
})

describe('eslint local · subscription-open-in-app-gate (← OpenInAppCard.test.tsx)', () => {
    const OK = [
        'const [justChangedPlan, setJustChangedPlan] = useState(false)',
        'function onUpgrade() { setJustChangedPlan(true) }',
        'const Card = () => <div>{justChangedPlan ? <OpenInAppCard /> : null}</div>',
    ].join('\n')

    ruleTester.run('subscription-open-in-app-gate', rules['subscription-open-in-app-gate'], {
        valid: [{ code: OK }],
        invalid: [
            {
                // Sin gate: la tarjeta de «abre la app» se le muestra a cualquiera.
                code: 'const [justChangedPlan, setJustChangedPlan] = useState(false)\nfunction onUpgrade() { setJustChangedPlan(true) }\nconst Card = () => <div><OpenInAppCard /></div>',
                errors: [{ messageId: 'missingGate' }],
            },
            {
                // El flag nace encendido: entrar a Mi plan simula un pago.
                code: 'const [justChangedPlan, setJustChangedPlan] = useState(true)\nfunction onUpgrade() { setJustChangedPlan(true) }\nconst Card = () => <div>{justChangedPlan ? <OpenInAppCard /> : null}</div>',
                errors: [{ messageId: 'missingInitialState' }],
            },
        ],
    })
})

describe('eslint local · register-free-tier-contract (← register-sin-precios.test.tsx)', () => {
    const OK = [
        'function onQuery(rawTier) { setFreeOnly(rawTier === \'free\') }',
        'const Form = () => (<form><input type="hidden" name="subscription_tier" value={tier} /><input type="hidden" name="billing_cycle" value={billingCycle} /></form>)',
    ].join('\n')

    ruleTester.run('register-free-tier-contract', rules['register-free-tier-contract'], {
        valid: [{ code: OK }],
        invalid: [
            {
                // Sin el hidden del ciclo, el alta manda un plan sin periodicidad.
                code: 'function onQuery(rawTier) { setFreeOnly(rawTier === \'free\') }\nconst Form = () => (<form><input type="hidden" name="subscription_tier" value={tier} /></form>)',
                errors: [{ messageId: 'missingHiddenInput' }],
            },
            {
                // El modo sin precios encendido por default: el alta web pierde su vitrina.
                code: 'function onQuery() { setFreeOnly(true) }\nconst Form = () => (<form><input type="hidden" name="subscription_tier" value={tier} /><input type="hidden" name="billing_cycle" value={billingCycle} /></form>)',
                errors: [{ messageId: 'missingFreeOnlyGate' }],
            },
        ],
    })
})

describe('eslint local · hecho-con-eva-metadata (← hecho-con-eva.test.tsx)', () => {
    ruleTester.run('hecho-con-eva-metadata', rules['hecho-con-eva-metadata'], {
        valid: [
            {
                code: "export const metadata = { alternates: { canonical: '/hecho-con-eva' }, robots: { index: true, follow: true } }",
            },
        ],
        invalid: [
            {
                code: "export const metadata = { alternates: { canonical: '/hecho-con-eva' }, robots: { index: false, follow: true } }",
                errors: [{ messageId: 'notIndexable' }],
            },
            {
                code: "export const metadata = { alternates: { canonical: '/sello' }, robots: { index: true } }",
                errors: [{ messageId: 'missingCanonical' }],
            },
        ],
    })
})
